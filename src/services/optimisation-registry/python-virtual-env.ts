import { constants } from "node:fs";
import { lstat, open, opendir, readFile, readlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { hasRecentChanges } from "./cli-bindings";
import { capturePathTarget, hasProjectMarker, samePathIdentity } from "./path-targets";
import { removeGeneratedPathSafely } from "./safe-removal";
import type {
  RegistryActionAdapter,
  RegistryAdapterPathTarget,
  RegistryEngineContext,
  RegistryPathTarget,
  RegistryRule,
  RegistrySelectorAdapter,
  RegistryTarget,
  RegistryValidator,
} from "./types";

const RULE_ID = "project.python.virtual_envs";
const SELECTOR_ID = "python.project_virtual_environments";
const ACTION_ID = "python.virtual_environment.remove_selected";
const ENV_NAMES = [".venv", "venv", "env"] as const;
const PROJECT_MARKERS = ["pyproject.toml", "requirements.txt", "setup.py"] as const;
const MAX_CONFIG_BYTES = 8 * 1024;
const MAX_ROOT_ENTRIES = 4_096;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PROCESSES = 4_096;
const MAX_FDS_PER_PROCESS = 512;
const MAX_PROC_TEXT_BYTES = 64 * 1024;

export type VirtualEnvProcessProbe = (targetPath: string) => Promise<true | string>;

export interface PythonVirtualEnvOptions {
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
  return rule.id === RULE_ID && rule.scope === "workdir" &&
    rule.selector.kind === "adapter" && rule.selector.adapterId === SELECTOR_ID &&
    rule.action.kind === "adapter" && rule.action.adapterId === ACTION_ID &&
    rule.review.tier === "review" && rule.review.selection === "explicit" && !rule.review.forceEligible;
}

async function projectMarker(root: string): Promise<boolean> {
  try { return await hasProjectMarker(root, PROJECT_MARKERS); }
  catch { return false; }
}

export async function hasVenvConfig(targetPath: string): Promise<boolean> {
  const config = path.join(targetPath, "pyvenv.cfg");
  try {
    const reviewed = await capturePathTarget(config, targetPath, "file", false);
    let source: string;
    const handle = await open(config, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.dev !== reviewed.device || info.ino !== reviewed.inode || info.size > MAX_CONFIG_BYTES) return false;
      source = await handle.readFile({ encoding: "utf8" });
    } finally {
      await handle.close();
    }
    const after = await capturePathTarget(config, targetPath, "file", false);
    if (!samePathIdentity(reviewed, after) || source.includes("\0")) return false;
    const homes = source.split(/\r?\n/).filter((line) => /^home\s*=/.test(line));
    if (homes.length !== 1) return false;
    const home = homes[0]!.slice(homes[0]!.indexOf("=") + 1).trim();
    if (!path.isAbsolute(home) || home.includes("\0")) return false;
    const bin = path.join(targetPath, "bin");
    const binInfo = await lstat(bin);
    if (!binInfo.isDirectory() || binInfo.isSymbolicLink()) return false;
    const pythonInfo = await lstat(path.join(bin, "python"));
    return pythonInfo.isFile() || pythonInfo.isSymbolicLink();
  } catch {
    return false;
  }
}

function refersToTarget(raw: string, targetPath: string): boolean {
  const cleaned = raw.endsWith(" (deleted)") ? raw.slice(0, -10) : raw;
  if (!path.isAbsolute(cleaned)) return false;
  return cleaned === targetPath || inside(targetPath, cleaned);
}

async function readProcText(filename: string): Promise<Buffer | null> {
  try {
    const content = await readFile(filename);
    return content.byteLength <= MAX_PROC_TEXT_BYTES ? content : null;
  } catch (error) {
    if (isVanished(error)) return Buffer.alloc(0);
    return null;
  }
}

function isVanished(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readProcLink(filename: string): Promise<string | null> {
  try { return await readlink(filename); }
  catch (error) { return isVanished(error) ? "" : null; }
}

/** Fail-closed Linux process visibility for same-UID processes. macOS needs separate native acceptance evidence. */
export const linuxVirtualEnvProcessProbe: VirtualEnvProcessProbe = async (targetPath) => {
  if (process.platform !== "linux" || typeof process.getuid !== "function") return "native process visibility unavailable";
  let entries: string[];
  try { entries = (await readdir("/proc")).filter((entry) => /^\d+$/.test(entry)); }
  catch { return "process inventory unavailable"; }
  if (entries.length > MAX_PROCESSES) return "process inventory exceeds safety budget";
  const currentUid = process.getuid();
  let visibilityIssue: string | null = null;
  for (const pid of entries) {
    const base = path.join("/proc", pid);
    let owner: number;
    try { owner = (await stat(base)).uid; }
    catch (error) {
      if (isVanished(error)) continue;
      visibilityIssue ??= "process ownership unavailable";
      continue;
    }
    if (owner !== currentUid) continue;
    const [cmdline, environ, cwd, executable] = await Promise.all([
      readProcText(path.join(base, "cmdline")),
      readProcText(path.join(base, "environ")),
      readProcLink(path.join(base, "cwd")),
      readProcLink(path.join(base, "exe")),
    ]);
    if (cmdline === null || environ === null || cwd === null || executable === null) {
      visibilityIssue ??= "same-user process visibility incomplete";
    }
    if ((cwd !== null && refersToTarget(cwd, targetPath)) ||
      (executable !== null && refersToTarget(executable, targetPath))) return "a process is using the virtual environment";
    for (const arg of (cmdline ?? Buffer.alloc(0)).toString("utf8").split("\0")) {
      if (path.isAbsolute(arg) && refersToTarget(path.resolve(arg), targetPath)) return "a process is using the virtual environment";
      if (cwd && arg.includes("/") && !path.isAbsolute(arg) && refersToTarget(path.resolve(cwd, arg), targetPath)) {
        return "a process is using the virtual environment";
      }
    }
    for (const variable of (environ ?? Buffer.alloc(0)).toString("utf8").split("\0")) {
      if (variable.startsWith("VIRTUAL_ENV=") && refersToTarget(variable.slice("VIRTUAL_ENV=".length), targetPath)) {
        return "a process is using the virtual environment";
      }
    }
    try {
      let checked = 0;
      for await (const fd of await opendir(path.join(base, "fd"))) {
        if (++checked > MAX_FDS_PER_PROCESS) {
          visibilityIssue ??= "same-user process has too many open files to verify";
          break;
        }
        const opened = await readProcLink(path.join(base, "fd", fd.name));
        if (opened === null) {
          visibilityIssue ??= "same-user open-file visibility incomplete";
          continue;
        }
        if (refersToTarget(opened, targetPath)) return "a process has a file open in the virtual environment";
      }
    } catch (error) {
      if (!isVanished(error)) visibilityIssue ??= "same-user open-file visibility incomplete";
    }
  }
  return visibilityIssue ?? true;
};

export function createPythonVirtualEnvBindings(options: PythonVirtualEnvOptions = {}) {
  const now = options.now ?? (() => new Date());
  const processProbe = options.processProbe ?? linuxVirtualEnvProcessProbe;

  async function quiet(targetPath: string): Promise<true | string> {
    const cutoff = now().getTime() - QUIET_PERIOD_MS;
    if (!Number.isFinite(cutoff)) return "virtual-environment activity clock invalid";
    try {
      return await hasRecentChanges(targetPath, cutoff)
        ? "virtual environment changed within the last 7 days"
        : true;
    } catch {
      return "virtual-environment activity could not be verified";
    }
  }

  async function exactMatch(root: string, targetPath: string, context: RegistryEngineContext): Promise<RegistryAdapterPathTarget | null> {
    if (!approvedRoot(root, context) || path.dirname(targetPath) !== root ||
      !ENV_NAMES.includes(path.basename(targetPath) as typeof ENV_NAMES[number]) || !(await projectMarker(root))) return null;
    try { await capturePathTarget(targetPath, root, "directory", false); }
    catch { return null; }
    if (!(await hasVenvConfig(targetPath)) || await quiet(targetPath) !== true || await processProbe(targetPath) !== true) return null;
    return {
      kind: "path", absolutePath: targetPath, scopeRoot: root, targetKind: "directory",
      evidence: ["project Python marker and pyvenv.cfg identify an exact environment", "tree quiet for 7 days; process-use visibility complete"],
    };
  }

  async function reviewedMatch(target: RegistryTarget, context: RegistryEngineContext): Promise<RegistryAdapterPathTarget | null> {
    if (target.kind !== "path" || target.fileKind !== "directory") return null;
    return exactMatch(path.resolve(target.scopeRoot), path.resolve(target.absolutePath), context);
  }

  const selector: RegistrySelectorAdapter = {
    list: async (rule, context) => {
      if (!approvedRule(rule)) return [];
      const targets: RegistryAdapterPathTarget[] = [];
      for (const suppliedRoot of context.projectRoots) {
        const root = path.resolve(suppliedRoot);
        if (!approvedRoot(root, context) || !(await projectMarker(root))) continue;
        try {
          let checked = 0;
          let exceeded = false;
          const rootTargets: RegistryAdapterPathTarget[] = [];
          for await (const entry of await opendir(root)) {
            if (++checked > MAX_ROOT_ENTRIES) { exceeded = true; break; }
            if (!entry.isDirectory() || !ENV_NAMES.includes(entry.name as typeof ENV_NAMES[number])) continue;
            const found = await exactMatch(root, path.join(root, entry.name), context);
            if (found) rootTargets.push(found);
          }
          if (!exceeded) targets.push(...rootTargets);
        } catch { continue; }
      }
      return targets;
    },
    lookup: async (rule, reviewed, context) => approvedRule(rule) ? reviewedMatch(reviewed, context) : null,
  };

  const ownerVerified: RegistryValidator = async (rule, candidate, context) => {
    if (!approvedRule(rule)) return "Python virtual-environment rule binding changed";
    return await reviewedMatch(candidate.target, context) ? true : "Python virtual environment owner or activity could not be verified";
  };

  const projectMarkerValidator: RegistryValidator = async (rule, candidate, context) => {
    if (!approvedRule(rule) || candidate.target.kind !== "path" || !approvedRoot(candidate.target.scopeRoot, context)) {
      return "Python virtual-environment rule binding changed";
    }
    return await projectMarker(candidate.target.scopeRoot) ? true : "Python project marker no longer matches";
  };

  const processUnused: RegistryValidator = async (rule, candidate) => {
    if (!approvedRule(rule) || candidate.target.kind !== "path") return "Python virtual-environment rule binding changed";
    return processProbe(candidate.target.absolutePath);
  };

  const action: RegistryActionAdapter = async (rule, candidate, context) => {
    if (!approvedRule(rule) || candidate.ruleId !== RULE_ID || candidate.target.kind !== "path") {
      throw new Error("Python virtual-environment action binding changed");
    }
    if (!(await reviewedMatch(candidate.target, context))) {
      throw new Error("Python virtual environment owner or activity could not be verified");
    }
    const reviewed: RegistryPathTarget = candidate.target;
    const live = await capturePathTarget(reviewed.absolutePath, reviewed.scopeRoot, "directory", false);
    if (!samePathIdentity(reviewed, live)) throw new Error("Python virtual environment changed before removal");
    await removeGeneratedPathSafely(live);
    return { reclaimedBytes: reviewed.sizeBytes };
  };

  return { selector, action, ownerVerified, projectMarker: projectMarkerValidator, processUnused };
}

export const pythonVirtualEnvBindings = createPythonVirtualEnvBindings();
