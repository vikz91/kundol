import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import path from "node:path";
import { hasRecentChanges } from "./cli-bindings";
import { capturePathTarget, samePathIdentity } from "./path-targets";
import { removeGeneratedPathSafely } from "./safe-removal";
import { hasVenvConfig, linuxVirtualEnvProcessProbe } from "./python-virtual-env";
import type { VirtualEnvProcessProbe } from "./python-virtual-env";
import type {
  RegistryActionAdapter, RegistryAdapterPathTarget, RegistryEngineContext, RegistryPathTarget,
  RegistryRule, RegistrySelectorAdapter, RegistryTarget, RegistryValidator,
} from "./types";

const RULE_ID = "project.python.test_envs";
const SELECTOR_ID = "python.test_environments";
const ACTION_ID = "python.test_environment.remove_selected";
const PROJECT_MARKERS = ["pyproject.toml", "requirements.txt", "setup.py"] as const;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_ROOTS = 512;
const MAX_ENV_ENTRIES = 20_000;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const PROTECTED_NAMES = new Set([".git", ".env", "assets", "uploads", "reports", "report", "log", "logs", "dist", "release", "releases", "vendor", "src", "tmp"]);
const PROTECTED_EXTENSIONS = [".db", ".sqlite", ".sqlite3", ".log", ".zip", ".tar", ".tar.gz", ".tgz", ".whl", ".dmg", ".pkg"];

type Variant = "tox" | "nox";
type TestEnvMatch = { root: string; absolutePath: string; variant: Variant; session: string };

export interface PythonTestEnvironmentOptions {
  processProbe?: VirtualEnvProcessProbe;
  now?: () => Date;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function approvedRoot(root: string, context: RegistryEngineContext): boolean {
  if (!context.workdirRoot || !context.projectRoots.includes(root)) return false;
  const workdir = path.resolve(context.workdirRoot);
  return root === workdir || inside(workdir, root);
}

function approvedRule(rule: RegistryRule): boolean {
  return rule.id === RULE_ID && rule.scope === "workdir" && rule.selector.kind === "adapter" &&
    rule.selector.adapterId === SELECTOR_ID && rule.action.kind === "adapter" && rule.action.adapterId === ACTION_ID &&
    rule.review.tier === "review" && rule.review.selection === "explicit" && !rule.review.forceEligible;
}

async function projectMarker(root: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try { await capturePathTarget(path.join(root, marker), root, "file", false); return true; }
    catch { continue; }
  }
  return false;
}

async function readConfig(filename: string, root: string): Promise<string | null> {
  try {
    const reviewed = await capturePathTarget(filename, root, "file", false);
    const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.dev !== reviewed.device || before.ino !== reviewed.inode ||
        before.size > MAX_CONFIG_BYTES) return null;
      const content = Buffer.alloc(MAX_CONFIG_BYTES + 1);
      let read = 0;
      while (read < content.length) {
        const result = await handle.read(content, read, content.length - read, null);
        if (result.bytesRead === 0) break;
        read += result.bytesRead;
      }
      if (read > MAX_CONFIG_BYTES) return null;
      const after = await handle.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) return null;
      const recaptured = await capturePathTarget(filename, root, "file", false);
      const source = content.toString("utf8", 0, read);
      return samePathIdentity(reviewed, recaptured) && !source.includes("\0") ? source : null;
    } finally {
      await handle.close();
    }
  } catch { return null; }
}

async function maybePresent(filename: string): Promise<boolean> {
  try { await lstat(filename); return true; }
  catch (error) {
    return !(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT");
  }
}

function pinnedDependency(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.-]*==[A-Za-z0-9][A-Za-z0-9_.+-]*$/.test(value);
}

function simpleToxConfig(source: string): string | null {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = /^\[([A-Za-z]+)\]$/.exec(line);
    if (section) {
      if (sections.has(section[1]!)) return null;
      current = new Map();
      sections.set(section[1]!, current);
      continue;
    }
    const property = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (!current || !property || current.has(property[1]!)) return null;
    current.set(property[1]!, property[2]!.trim());
  }
  if (sections.size !== 2 || !sections.has("tox") || !sections.has("testenv")) return null;
  const tox = sections.get("tox")!;
  const testenv = sections.get("testenv")!;
  if (tox.size !== 1 || testenv.size !== 2 ||
    [...tox.keys()].some((key) => key !== "env_list") ||
    [...testenv.keys()].some((key) => key !== "deps" && key !== "commands")) return null;
  const session = tox.get("env_list") ?? "";
  if (!/^py[0-9]{2,3}$/.test(session) || !pinnedDependency(testenv.get("deps") ?? "") ||
    testenv.get("commands") !== "python -m pytest") return null;
  return session;
}

function simpleNoxConfig(source: string): string | null {
  const match = /^\s*import nox\s+@nox\.session\s+def\s+([a-z][a-z0-9_]*)\(session\):\s+session\.install\(["']([^"']+)["']\)\s+session\.run\(["']pytest["']\)\s*$/.exec(source);
  return match && pinnedDependency(match[2]!) ? match[1]! : null;
}

async function ownedSession(root: string, variant: Variant): Promise<string | null> {
  if (!(await projectMarker(root))) return null;
  if (variant === "tox") {
    if (await maybePresent(path.join(root, "tox.toml")) || await maybePresent(path.join(root, "noxfile.py"))) return null;
    const source = await readConfig(path.join(root, "tox.ini"), root);
    return source ? simpleToxConfig(source) : null;
  }
  if (await maybePresent(path.join(root, "tox.ini")) || await maybePresent(path.join(root, "tox.toml"))) return null;
  const source = await readConfig(path.join(root, "noxfile.py"), root);
  return source ? simpleNoxConfig(source) : null;
}

function disallowedEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_NAMES.has(lower) || lower.startsWith(".env.") ||
    PROTECTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

async function unambiguousTree(targetPath: string): Promise<boolean> {
  const pending = [targetPath];
  let checked = 0;
  try {
    while (pending.length > 0) {
      const directory = pending.pop()!;
      for await (const entry of await opendir(directory)) {
        if (++checked > MAX_ENV_ENTRIES || disallowedEntry(entry.name)) return false;
        if (entry.isSymbolicLink()) continue; // The no-follow remover unlinks links; it never follows them.
        if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
        else if (!entry.isFile()) return false;
      }
    }
    return true;
  } catch { return false; }
}

export function createPythonTestEnvironmentBindings(options: PythonTestEnvironmentOptions = {}) {
  const now = options.now ?? (() => new Date());
  const processProbe = options.processProbe ?? linuxVirtualEnvProcessProbe;

  async function exactMatch(root: string, absolutePath: string, context: RegistryEngineContext): Promise<TestEnvMatch | null> {
    const parent = path.dirname(absolutePath);
    const variant: Variant | null = path.basename(parent) === ".tox" ? "tox" :
      path.basename(parent) === ".nox" ? "nox" : null;
    if (!variant || path.dirname(parent) !== root || !approvedRoot(root, context)) return null;
    const session = await ownedSession(root, variant);
    if (!session || path.basename(absolutePath) !== session) return null;
    try { await capturePathTarget(absolutePath, root, "directory", false); }
    catch { return null; }
    if (!(await hasVenvConfig(absolutePath))) return null;
    const cutoff = now().getTime() - QUIET_PERIOD_MS;
    if (!Number.isFinite(cutoff)) return null;
    try {
      if (await hasRecentChanges(absolutePath, cutoff, MAX_ENV_ENTRIES)) return null;
    } catch { return null; }
    if (!(await unambiguousTree(absolutePath)) || await processProbe(absolutePath) !== true) return null;
    return { root, absolutePath, variant, session };
  }

  function adapterTarget(match: TestEnvMatch): RegistryAdapterPathTarget {
    return {
      kind: "path", absolutePath: match.absolutePath, scopeRoot: match.root, targetKind: "directory",
      evidence: [match.variant === "tox" ? "simple pinned tox.ini owns one named virtualenv" :
        "simple pinned noxfile.py owns one named virtualenv", "pyvenv.cfg and quiet no-report tree verified; same-user process visibility complete"],
    };
  }

  async function reviewedMatch(target: RegistryTarget, context: RegistryEngineContext): Promise<TestEnvMatch | null> {
    if (target.kind !== "path" || target.fileKind !== "directory") return null;
    return exactMatch(path.resolve(target.scopeRoot), path.resolve(target.absolutePath), context);
  }

  const selector: RegistrySelectorAdapter = {
    list: async (rule, context) => {
      if (!approvedRule(rule) || context.projectRoots.length > MAX_ROOTS) return [];
      const targets: RegistryAdapterPathTarget[] = [];
      for (const suppliedRoot of context.projectRoots) {
        const root = path.resolve(suppliedRoot);
        if (!approvedRoot(root, context)) continue;
        for (const variant of ["tox", "nox"] as const) {
          const session = await ownedSession(root, variant);
          if (!session) continue;
          const absolutePath = path.join(root, variant === "tox" ? ".tox" : ".nox", session);
          const match = await exactMatch(root, absolutePath, context);
          if (match) targets.push(adapterTarget(match));
        }
      }
      return targets;
    },
    lookup: async (rule, reviewed, context) => {
      if (!approvedRule(rule)) return null;
      const match = await reviewedMatch(reviewed, context);
      return match ? adapterTarget(match) : null;
    },
  };

  const ownerVerified: RegistryValidator = async (rule, candidate, context) => {
    if (!approvedRule(rule)) return "Python test-environment rule binding changed";
    return await reviewedMatch(candidate.target, context) ? true : "Python test environment owner or activity could not be verified";
  };

  const projectMarker: RegistryValidator = async (rule, candidate, context) => {
    if (!approvedRule(rule) || candidate.target.kind !== "path" || !approvedRoot(candidate.target.scopeRoot, context)) {
      return "Python test-environment rule binding changed";
    }
    const parent = path.dirname(candidate.target.absolutePath);
    const variant: Variant | null = path.basename(parent) === ".tox" ? "tox" :
      path.basename(parent) === ".nox" ? "nox" : null;
    if (!variant || path.dirname(parent) !== candidate.target.scopeRoot) return "Python test-environment target binding changed";
    return await ownedSession(candidate.target.scopeRoot, variant) === path.basename(candidate.target.absolutePath)
      ? true : "Python test-environment project marker no longer matches";
  };

  const processUnused: RegistryValidator = async (rule, candidate) => {
    if (!approvedRule(rule) || candidate.target.kind !== "path") return "Python test-environment rule binding changed";
    return processProbe(candidate.target.absolutePath);
  };

  const action: RegistryActionAdapter = async (rule, candidate, context) => {
    if (!approvedRule(rule) || candidate.ruleId !== RULE_ID || candidate.target.kind !== "path") {
      throw new Error("Python test-environment action binding changed");
    }
    const match = await reviewedMatch(candidate.target, context);
    if (!match) throw new Error("Python test environment owner or activity could not be verified");
    const reviewed: RegistryPathTarget = candidate.target;
    const live = await capturePathTarget(match.absolutePath, match.root, "directory", false);
    if (!samePathIdentity(reviewed, live)) throw new Error("Python test environment changed before removal");
    await removeGeneratedPathSafely(live);
    return { reclaimedBytes: reviewed.sizeBytes };
  };

  return { selector, action, ownerVerified, projectMarker, processUnused };
}

export const pythonTestEnvironmentBindings = createPythonTestEnvironmentBindings();
