import { lstat, opendir, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { RegistryEngineContext, RegistryPathTarget, RegistryRule } from "./types";

const PROTECTED_NAMES = new Set([".git", "assets", "asset", "uploads", "upload", "media", "migrations", "migration", "vendor"]);
const PROTECTED_EXTENSIONS = [".db", ".sqlite", ".sqlite3", ".png", ".jpg", ".jpeg", ".mp4", ".mov"];
type GeneratedPolicy = { markers: readonly string[]; minimumTier: "safe" | "review" | "protected"; targetKind: "file" | "directory" | "either" };
const NODE_MARKERS = ["package.json"];
const PYTHON_MARKERS = ["pyproject.toml", "requirements.txt", "setup.py"];
const DOTNET_MARKERS = ["*.csproj", "*.sln"];
const policy = (markers: readonly string[], minimumTier: GeneratedPolicy["minimumTier"], targetKind: GeneratedPolicy["targetKind"]): GeneratedPolicy =>
  ({ markers, minimumTier, targetKind });
const APPROVED_GENERATED_NAMES = new Map<string, GeneratedPolicy>([
  [".build", policy(["Package.swift"], "safe", "directory")],
  ["node_modules", policy(NODE_MARKERS, "safe", "directory")],
  ...["dist", "build", ".next", ".nuxt", ".turbo", "coverage"].map((name): [string, GeneratedPolicy] => [name, policy(NODE_MARKERS, "review", "directory")]),
  ...["__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"].map((name): [string, GeneratedPolicy] => [name, policy(PYTHON_MARKERS, "safe", "directory")]),
  ["target", policy(["Cargo.toml"], "safe", "directory")],
  ["bin", policy(DOTNET_MARKERS, "review", "directory")],
  ["obj", policy(DOTNET_MARKERS, "safe", "directory")],
  [".parcel-cache", policy(NODE_MARKERS, "safe", "directory")],
  [".eslintcache", policy(NODE_MARKERS, "safe", "file")],
  ["htmlcov", policy(PYTHON_MARKERS, "review", "directory")],
  ["TestResults", policy(DOTNET_MARKERS, "review", "directory")],
  [".vs", policy(["*.sln"], "protected", "directory")],
  ["coverage.out", policy(["go.mod"], "review", "file")],
  ["tarpaulin-report.html", policy(["Cargo.toml"], "review", "file")],
]);
const APPROVED_GENERATED_SUFFIXES = new Map<string, GeneratedPolicy>([
  [".egg-info", policy(["setup.py", "pyproject.toml"], "review", "either")],
  [".test", policy(["go.mod"], "review", "file")],
  [".profraw", policy(["CMakeLists.txt", "Cargo.toml", "Makefile"], "review", "file")],
  [".profdata", policy(["CMakeLists.txt", "Cargo.toml", "Makefile"], "review", "file")],
]);
const TIER_PRIORITY = { safe: 0, review: 1, protected: 2 } as const;
const MAX_MEASURED_ENTRIES = 50_000;

function matchesGeneratedPolicy(rule: RegistryRule, entry: string, approved: Map<string, GeneratedPolicy>): boolean {
  const found = approved.get(entry);
  if (!found || (rule.selector.kind !== "generated_path" && rule.selector.kind !== "generated_suffix")) return false;
  return TIER_PRIORITY[rule.review.tier] >= TIER_PRIORITY[found.minimumTier] &&
    rule.selector.targetKind === found.targetKind &&
    rule.selector.markers.length > 0 && rule.selector.markers.every((marker) => found.markers.includes(marker));
}

export function isApprovedGeneratedSelector(rule: RegistryRule): boolean {
  if (rule.selector.kind === "generated_path") return rule.selector.names.every((name) => matchesGeneratedPolicy(rule, name, APPROVED_GENERATED_NAMES));
  if (rule.selector.kind === "generated_suffix") return rule.selector.suffixes.every((suffix) => matchesGeneratedPolicy(rule, suffix, APPROVED_GENERATED_SUFFIXES));
  return false;
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function assertNoSymlinkChain(scopeRoot: string, absolutePath: string): Promise<void> {
  const root = path.resolve(scopeRoot);
  const target = path.resolve(absolutePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("target escapes scope root");
  let current = root;
  if ((await lstat(current)).isSymbolicLink()) throw new Error(`symlink scope root: ${current}`);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`symlink in target ancestry: ${current}`);
  }
}

function assertNonProtectedName(targetPath: string): void {
  const name = path.basename(targetPath).toLowerCase();
  if (PROTECTED_NAMES.has(name) || name === ".env" || name.startsWith(".env.") || PROTECTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw new Error(`protected target name: ${name}`);
  }
}

async function directorySizeBytes(root: string, maximumEntries: number): Promise<number | null> {
  let total = 0;
  let checked = 0;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    try {
      for await (const entry of await opendir(directory)) {
        if (++checked > maximumEntries) return null;
        if (entry.isSymbolicLink()) continue;
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) pending.push(child);
        else if (entry.isFile()) total += (await lstat(child)).size;
      }
    } catch (error) {
      throw new Error(`cannot measure generated directory ${directory}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
  return total;
}

export async function hasProjectMarker(projectRoot: string, markers: readonly string[]): Promise<boolean> {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  return matchesProjectMarkerEntries(entries, markers);
}

export function matchesProjectMarkerEntries(entries: readonly import("node:fs").Dirent[], markers: readonly string[]): boolean {
  return markers.some((marker) => {
    if (marker.startsWith("*.") && !marker.slice(1).includes("*")) {
      return entries.some((entry) => entry.isFile() && entry.name.endsWith(marker.slice(1)));
    }
    if (marker.includes("*") || marker.includes("?") || marker.includes("[")) return false;
    return entries.some((entry) => entry.name === marker && (entry.isFile() || entry.isDirectory()));
  });
}

export async function capturePathTarget(
  absolutePath: string,
  scopeRoot: string,
  expectedKind: "file" | "directory" | "either" = "either",
  measureSize = true,
  maximumMeasuredEntries = MAX_MEASURED_ENTRIES,
): Promise<RegistryPathTarget> {
  const target = path.resolve(absolutePath);
  const root = path.resolve(scopeRoot);
  if (!isInside(root, target)) throw new Error("target escapes scope root or is the scope root");
  assertNonProtectedName(target);
  await assertNoSymlinkChain(root, target);
  const [rootRealPath, targetRealPath, info] = await Promise.all([realpath(root), realpath(target), lstat(target)]);
  if (!isInside(rootRealPath, targetRealPath)) throw new Error("target real path escapes scope root");
  const fileKind = info.isFile() ? "file" : info.isDirectory() ? "directory" : null;
  if (!fileKind || (expectedKind !== "either" && fileKind !== expectedKind)) throw new Error("target kind does not match selector");
  const sizeBytes = fileKind === "file" ? info.size : measureSize ? await directorySizeBytes(target, maximumMeasuredEntries) : null;
  return {
    kind: "path",
    key: `path:${targetRealPath}`,
    absolutePath: target,
    realPath: targetRealPath,
    scopeRoot: root,
    fileKind,
    device: info.dev,
    inode: info.ino,
    sizeBytes,
  };
}

export async function findGeneratedTargets(rule: RegistryRule, context: RegistryEngineContext): Promise<RegistryPathTarget[]> {
  if (rule.selector.kind !== "generated_path" && rule.selector.kind !== "generated_suffix") return [];
  const targets: RegistryPathTarget[] = [];
  for (const suppliedRoot of context.projectRoots) {
    const root = path.resolve(suppliedRoot);
    if (root === path.parse(root).root || root === path.resolve(context.homeDir)) continue;
    try {
      await assertNoSymlinkChain(root, root);
      if (!(await hasProjectMarker(root, rule.selector.markers))) continue;
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const matches = rule.selector.kind === "generated_path"
          ? rule.selector.names.includes(entry.name)
          : rule.selector.suffixes.some((suffix) => entry.name.endsWith(suffix));
        if (!matches) continue;
        try {
          targets.push(await capturePathTarget(path.join(root, entry.name), root, rule.selector.targetKind ?? "either", false));
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  return targets;
}

export function samePathIdentity(left: RegistryPathTarget, right: RegistryPathTarget): boolean {
  return left.absolutePath === right.absolutePath && left.realPath === right.realPath && left.scopeRoot === right.scopeRoot &&
    left.fileKind === right.fileKind && left.device === right.device && left.inode === right.inode;
}
