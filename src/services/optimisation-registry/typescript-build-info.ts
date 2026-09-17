import { constants } from "node:fs";
import { open, opendir } from "node:fs/promises";
import path from "node:path";
import { capturePathTarget, samePathIdentity } from "./path-targets";
import { removeGeneratedPathSafely } from "./safe-removal";
import type {
  RegistryActionAdapter,
  RegistryAdapterPathTarget,
  RegistryCandidate,
  RegistryEngineContext,
  RegistryPathTarget,
  RegistryRule,
  RegistrySelectorAdapter,
  RegistryTarget,
  RegistryValidator,
} from "./types";

const RULE_ID = "project.typescript.build_info";
const SELECTOR_ID = "typescript.build_info";
const ACTION_ID = "typescript.build_info.remove";
const MAX_CONFIGS_PER_ROOT = 16;
const MAX_CONFIG_BYTES = 128 * 1024;
const MAX_ROOT_ENTRIES = 4_096;

type ConfigMatch = { absolutePath: string; configPath: string };

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
    rule.review.tier === "safe" && rule.review.selection === "suggested" && rule.review.forceEligible;
}

// tsconfig files are JSON with comments and trailing commas. This small lexical
// normalizer handles only those two extensions; malformed or unusual configs
// fail closed rather than invoking a compiler or evaluating project code.
function parseJsonWithComments(source: string): unknown {
  let stripped = "";
  let inString = false;
  let escaping = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index++) {
    const current = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n" || current === "\r") { lineComment = false; stripped += current; }
      else stripped += " ";
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") { blockComment = false; stripped += "  "; index++; }
      else stripped += current === "\n" || current === "\r" ? current : " ";
      continue;
    }
    if (inString) {
      stripped += current;
      if (escaping) escaping = false;
      else if (current === "\\") escaping = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') { inString = true; stripped += current; continue; }
    if (current === "/" && next === "/") { lineComment = true; stripped += "  "; index++; continue; }
    if (current === "/" && next === "*") { blockComment = true; stripped += "  "; index++; continue; }
    stripped += current;
  }
  if (inString || blockComment) throw new Error("incomplete tsconfig string or comment");

  let normalized = "";
  inString = false;
  escaping = false;
  for (let index = 0; index < stripped.length; index++) {
    const current = stripped[index]!;
    if (inString) {
      normalized += current;
      if (escaping) escaping = false;
      else if (current === "\\") escaping = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') { inString = true; normalized += current; continue; }
    if (current === ",") {
      let next = index + 1;
      while (next < stripped.length && /\s/.test(stripped[next]!)) next++;
      if (stripped[next] === "}" || stripped[next] === "]") continue;
    }
    normalized += current;
  }
  return JSON.parse(normalized) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configuredRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.endsWith(".tsbuildinfo") || path.isAbsolute(value) ||
    value.includes("\0") || value.includes("\\") || value.includes("*") || value.includes("?") || value.includes("[")) return null;
  const segments = value.split("/");
  if (segments.length === 0 || segments.some((segment) => !segment || segment === "..")) return null;
  return value;
}

async function readOwnedConfig(configPath: string, root: string): Promise<ConfigMatch | null> {
  try {
    const reviewed = await capturePathTarget(configPath, root, "file", false);
    let source: string;
    const handle = await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.dev !== reviewed.device || info.ino !== reviewed.inode || info.size > MAX_CONFIG_BYTES) return null;
      source = await handle.readFile({ encoding: "utf8" });
    } finally {
      await handle.close();
    }
    const after = await capturePathTarget(configPath, root, "file", false);
    if (!samePathIdentity(reviewed, after)) return null;
    const parsed = parseJsonWithComments(source);
    if (!isRecord(parsed) || Object.hasOwn(parsed, "extends") || !isRecord(parsed.compilerOptions)) return null;
    const options = parsed.compilerOptions;
    if (options.incremental !== true && options.composite !== true) return null;
    if (options.incremental === false) return null;
    const relative = configuredRelativePath(options.tsBuildInfoFile);
    if (!relative) return null;
    const absolutePath = path.resolve(root, relative);
    if (!inside(root, absolutePath)) return null;
    return { absolutePath, configPath };
  } catch {
    return null;
  }
}

async function configMatches(root: string): Promise<ConfigMatch[]> {
  try {
    const configs: string[] = [];
    let checked = 0;
    for await (const entry of await opendir(root)) {
      if (++checked > MAX_ROOT_ENTRIES) return [];
      if (entry.isFile() && /^tsconfig(?:[._-][a-zA-Z0-9._-]+)?\.json$/.test(entry.name)) {
        configs.push(entry.name);
        if (configs.length > MAX_CONFIGS_PER_ROOT) return [];
      }
    }
    const matches: ConfigMatch[] = [];
    for (const name of configs.sort()) {
      const found = await readOwnedConfig(path.join(root, name), root);
      if (found) matches.push(found);
    }
    return matches;
  } catch {
    return [];
  }
}

async function targetForMatch(match: ConfigMatch, root: string): Promise<RegistryAdapterPathTarget | null> {
  try {
    await capturePathTarget(match.absolutePath, root, "file", false);
    return {
      kind: "path", absolutePath: match.absolutePath, scopeRoot: root, targetKind: "file",
      evidence: [`owner config: ${match.configPath}`, "explicit incremental tsBuildInfoFile under project root"],
    };
  } catch {
    return null;
  }
}

async function exactMatch(target: RegistryTarget, context: RegistryEngineContext): Promise<ConfigMatch | null> {
  if (target.kind !== "path" || target.fileKind !== "file") return null;
  const root = path.resolve(target.scopeRoot);
  if (!approvedRoot(root, context) || !inside(root, target.absolutePath) || !target.absolutePath.endsWith(".tsbuildinfo")) return null;
  return (await configMatches(root)).find((match) => match.absolutePath === target.absolutePath) ?? null;
}

export const typescriptBuildInfoSelector: RegistrySelectorAdapter = {
  list: async (rule, context) => {
    if (!approvedRule(rule)) return [];
    const targets: RegistryAdapterPathTarget[] = [];
    for (const suppliedRoot of context.projectRoots) {
      const root = path.resolve(suppliedRoot);
      if (!approvedRoot(root, context)) continue;
      for (const match of await configMatches(root)) {
        const target = await targetForMatch(match, root);
        if (target) targets.push(target);
      }
    }
    return targets;
  },
  lookup: async (rule, reviewed, context) => {
    if (!approvedRule(rule)) return null;
    const match = await exactMatch(reviewed, context);
    return match ? await targetForMatch(match, path.resolve(reviewed.kind === "path" ? reviewed.scopeRoot : "")) : null;
  },
};

export const typescriptBuildInfoProjectMarker: RegistryValidator = async (rule, candidate, context) => {
  if (!approvedRule(rule)) return "TypeScript build-info rule binding changed";
  return await exactMatch(candidate.target, context) ? true : "TypeScript owner config no longer matches build-info path";
};

// Both registry checks are deliberately backed by the same exact config proof.
// The CLI registers this owner validator only for the TypeScript rule, rather
// than weakening owner verification for unrelated adapters.
export const typescriptBuildInfoOwnerVerified: RegistryValidator = typescriptBuildInfoProjectMarker;

export const typescriptBuildInfoAction: RegistryActionAdapter = async (rule, candidate: RegistryCandidate, context) => {
  if (!approvedRule(rule) || candidate.ruleId !== RULE_ID || candidate.target.kind !== "path") {
    throw new Error("TypeScript build-info action binding changed");
  }
  const match = await exactMatch(candidate.target, context);
  if (!match) throw new Error("TypeScript owner config no longer matches build-info path");
  const reviewed: RegistryPathTarget = candidate.target;
  const live = await capturePathTarget(match.absolutePath, reviewed.scopeRoot, "file", false);
  if (!samePathIdentity(reviewed, live)) throw new Error("TypeScript build-info target changed before removal");
  await removeGeneratedPathSafely(live);
  return { reclaimedBytes: live.sizeBytes };
};
