import { constants } from "node:fs";
import { open, opendir } from "node:fs/promises";
import path from "node:path";
import { capturePathTarget, samePathIdentity } from "./path-targets";
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

const RULE_ID = "project.cmake.build";
const SELECTOR_ID = "cmake.verified_build_trees";
const ACTION_ID = "cmake.build.remove";
const MAX_ROOT_ENTRIES = 4_096;
const MAX_CANDIDATES_PER_ROOT = 16;
const MAX_CACHE_BYTES = 512 * 1024;
const MAX_BUILD_ENTRIES = 20_000;
const PROTECTED_TREE_NAMES = new Set([
  ".git", ".env", "assets", "asset", "uploads", "upload", "media", "migrations", "migration", "vendor",
]);
const AMBIGUOUS_OUTPUT_NAMES = new Set([
  "dist", "release", "publish", "package", "packages", "install", "installer", "artifacts",
  "cpackconfig.cmake", "cpacksourceconfig.cmake", "cmakelists.txt",
]);
const AMBIGUOUS_EXTENSIONS = [".zip", ".tar", ".tar.gz", ".tgz", ".dmg", ".pkg", ".deb", ".rpm", ".msi", ".apk", ".aab", ".nupkg"];
const PROTECTED_EXTENSIONS = [".db", ".sqlite", ".sqlite3"];

type CMakeMatch = { sourceRoot: string; buildPath: string; cachePath: string };

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

function allowedBuildName(name: string): boolean {
  if (!/^(?:build(?:-[a-z0-9_-]+)?|cmake-build-[a-z0-9_-]+)$/i.test(name)) return false;
  return !/(?:release|relwithdebinfo|publish|package|install|dist|artifact|production|prod)/i.test(name);
}

async function markerExists(sourceRoot: string): Promise<boolean> {
  try {
    await capturePathTarget(path.join(sourceRoot, "CMakeLists.txt"), sourceRoot, "file", false);
    return true;
  } catch {
    return false;
  }
}

function cacheValues(source: string): Map<string, string> | null {
  const entries = new Map<string, string>();
  const relevant = new Set(["CMAKE_HOME_DIRECTORY", "CMAKE_CACHEFILE_DIR", "CMAKE_GENERATOR", "CMAKE_INSTALL_PREFIX"]);
  for (const line of source.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*):([A-Z]+)=(.*)$/.exec(line);
    if (!match || !relevant.has(match[1]!)) continue;
    const key = match[1]!;
    if (entries.has(key)) return null;
    if ((key === "CMAKE_HOME_DIRECTORY" || key === "CMAKE_CACHEFILE_DIR" || key === "CMAKE_GENERATOR") && match[2] !== "INTERNAL") return null;
    if (key === "CMAKE_INSTALL_PREFIX" && match[2] !== "PATH") return null;
    entries.set(key, match[3]!);
  }
  return entries;
}

async function readCache(cachePath: string, buildPath: string): Promise<Map<string, string> | null> {
  try {
    const reviewed = await capturePathTarget(cachePath, buildPath, "file", false);
    let source: string;
    const handle = await open(cachePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.dev !== reviewed.device || info.ino !== reviewed.inode || info.size > MAX_CACHE_BYTES) return null;
      source = await handle.readFile({ encoding: "utf8" });
    } finally {
      await handle.close();
    }
    const after = await capturePathTarget(cachePath, buildPath, "file", false);
    if (!samePathIdentity(reviewed, after)) return null;
    return cacheValues(source);
  } catch {
    return null;
  }
}

function disallowedTreeEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_TREE_NAMES.has(lower) || lower.startsWith(".env.") || AMBIGUOUS_OUTPUT_NAMES.has(lower) ||
    AMBIGUOUS_EXTENSIONS.some((extension) => lower.endsWith(extension)) ||
    PROTECTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

async function buildContentsAreUnambiguous(buildPath: string): Promise<boolean> {
  const pending = [buildPath];
  let checked = 0;
  let hasGeneratedMarker = false;
  try {
    while (pending.length > 0) {
      const directory = pending.pop()!;
      for await (const entry of await opendir(directory)) {
        if (++checked > MAX_BUILD_ENTRIES || disallowedTreeEntry(entry.name) || entry.isSymbolicLink()) return false;
        if (entry.name === "CMakeFiles" && entry.isDirectory() && directory === buildPath) hasGeneratedMarker = true;
        if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
        else if (!entry.isFile()) return false;
      }
    }
    return hasGeneratedMarker;
  } catch {
    return false;
  }
}

async function exactMatch(sourceRoot: string, buildPath: string, context: RegistryEngineContext): Promise<CMakeMatch | null> {
  if (!approvedRoot(sourceRoot, context) || path.dirname(buildPath) !== sourceRoot || !allowedBuildName(path.basename(buildPath))) return null;
  if (!(await markerExists(sourceRoot))) return null;
  try {
    await capturePathTarget(buildPath, sourceRoot, "directory", false);
  } catch {
    return null;
  }
  const cachePath = path.join(buildPath, "CMakeCache.txt");
  const cache = await readCache(cachePath, buildPath);
  if (!cache) return null;
  if (cache.get("CMAKE_HOME_DIRECTORY") !== sourceRoot || !cache.get("CMAKE_GENERATOR")) return null;
  const cacheDir = cache.get("CMAKE_CACHEFILE_DIR");
  if (cacheDir !== undefined && cacheDir !== buildPath) return null;
  const installPrefix = cache.get("CMAKE_INSTALL_PREFIX");
  if (installPrefix && path.isAbsolute(installPrefix) &&
    (path.resolve(installPrefix) === buildPath || inside(buildPath, path.resolve(installPrefix)))) return null;
  if (!(await buildContentsAreUnambiguous(buildPath))) return null;
  return { sourceRoot, buildPath, cachePath };
}

function adapterTarget(match: CMakeMatch): RegistryAdapterPathTarget {
  return {
    kind: "path", absolutePath: match.buildPath, scopeRoot: match.sourceRoot, targetKind: "directory",
    evidence: ["CMakeCache.txt identifies the owning source and build trees", "CMakeFiles build marker present; no release or protected entries found"],
  };
}

async function reviewedMatch(target: RegistryTarget, context: RegistryEngineContext): Promise<CMakeMatch | null> {
  if (target.kind !== "path" || target.fileKind !== "directory") return null;
  return exactMatch(path.resolve(target.scopeRoot), path.resolve(target.absolutePath), context);
}

export const cmakeBuildSelector: RegistrySelectorAdapter = {
  list: async (rule, context) => {
    if (!approvedRule(rule)) return [];
    const targets: RegistryAdapterPathTarget[] = [];
    for (const suppliedRoot of context.projectRoots) {
      const sourceRoot = path.resolve(suppliedRoot);
      if (!approvedRoot(sourceRoot, context) || !(await markerExists(sourceRoot))) continue;
      try {
        let checked = 0;
        let found = 0;
        let exceeded = false;
        const rootTargets: RegistryAdapterPathTarget[] = [];
        for await (const entry of await opendir(sourceRoot)) {
          if (++checked > MAX_ROOT_ENTRIES) { exceeded = true; break; }
          if (!entry.isDirectory() || !allowedBuildName(entry.name)) continue;
          if (++found > MAX_CANDIDATES_PER_ROOT) { exceeded = true; break; }
          const match = await exactMatch(sourceRoot, path.join(sourceRoot, entry.name), context);
          if (match) rootTargets.push(adapterTarget(match));
        }
        if (!exceeded) targets.push(...rootTargets);
      } catch {
        continue;
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

export const cmakeBuildProjectMarker: RegistryValidator = async (rule, candidate, context) => {
  if (!approvedRule(rule) || candidate.target.kind !== "path" ||
    !approvedRoot(candidate.target.scopeRoot, context)) return "CMake rule binding changed";
  return await markerExists(candidate.target.scopeRoot) ? true : "CMake source marker no longer matches";
};

export const cmakeBuildOwnerVerified: RegistryValidator = async (rule, candidate, context) => {
  if (!approvedRule(rule)) return "CMake rule binding changed";
  return await reviewedMatch(candidate.target, context) ? true : "CMake build owner or retained output could not be verified";
};

export const cmakeBuildAction: RegistryActionAdapter = async (rule, candidate, context) => {
  if (!approvedRule(rule) || candidate.ruleId !== RULE_ID || candidate.target.kind !== "path") {
    throw new Error("CMake build action binding changed");
  }
  const match = await reviewedMatch(candidate.target, context);
  if (!match) throw new Error("CMake build owner or retained output could not be verified");
  const reviewed: RegistryPathTarget = candidate.target;
  const live = await capturePathTarget(match.buildPath, match.sourceRoot, "directory", false);
  if (!samePathIdentity(reviewed, live)) throw new Error("CMake build directory changed before removal");
  await removeGeneratedPathSafely(live);
  return { reclaimedBytes: reviewed.sizeBytes };
};
