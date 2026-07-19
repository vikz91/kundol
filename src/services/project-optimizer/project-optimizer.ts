import { lstat, readdir, realpath, rm, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { classifyCleanupPath } from "../../core/safety/policy";
import { normalizeRelativePath } from "../../core/safety/path-utils";
import type { RuntimeFamily } from "../../core/safety/types";

const DEFAULT_MAX_DEPTH = 7;

const PROJECT_MARKERS: ReadonlyArray<{ runtime: RuntimeFamily; names?: readonly string[]; extensions?: readonly string[] }> = [
  {
    runtime: "node",
    names: ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", ".nvmrc", ".node-version"],
  },
  { runtime: "bun", names: ["bun.lock", "bun.lockb", ".bun-version"] },
  { runtime: "deno", names: ["deno.json", "deno.jsonc", "deps.ts", "import_map.json"] },
  {
    runtime: "python",
    names: ["pyproject.toml", "requirements.txt", "poetry.lock", "Pipfile", "Pipfile.lock", "uv.lock", "setup.py", "setup.cfg", "tox.ini"],
  },
  { runtime: "go", names: ["go.mod", "go.sum", "go.work"] },
  { runtime: "rust", names: ["Cargo.toml", "Cargo.lock", "rust-toolchain", "rust-toolchain.toml"] },
  { runtime: "java", names: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "gradlew", "mvnw"] },
  { runtime: "dotnet", names: ["global.json", "Directory.Build.props", "packages.lock.json"], extensions: [".csproj", ".sln"] },
];

const GENERATED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".vite",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "htmlcov",
  ".gradle",
  "target",
  "bin",
  "obj",
  "TestResults",
  ".vs",
]);

const GENERATED_FILE_NAMES = new Set([".eslintcache", "tsconfig.tsbuildinfo", "coverage.out", "tarpaulin-report.html"]);
const GENERATED_FILE_SUFFIXES = [".egg-info", ".profraw", ".profdata", ".test"];
const SKIP_DIRECTORY_NAMES = new Set([
  ...GENERATED_DIRECTORY_NAMES,
  ".git",
  "assets",
  "asset",
  "Assets",
  "uploads",
  "upload",
  "media",
  "migrations",
  "migration",
  "vendor",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".nox",
]);

export interface ProjectOptimizerScanInput {
  workdir: string;
  maxDepth?: number;
}

export interface ProjectOptimizerCandidate {
  id: string;
  projectName: string;
  projectRoot: string;
  projectRelativePath: string;
  absolutePath: string;
  realPath: string;
  kind: "file" | "directory";
  runtimes: RuntimeFamily[];
  sizeBytes: number;
  reason: string;
  ruleId: string;
}

export interface ProjectOptimizerProject {
  root: string;
  relativePath: string;
  runtimes: RuntimeFamily[];
}

export interface ProjectOptimizerScanResult {
  workdir: string;
  maxDepth: number;
  projects: ProjectOptimizerProject[];
  candidates: ProjectOptimizerCandidate[];
  reclaimableBytes: number;
  totalBytes: number;
  warnings: string[];
}

export interface ProjectOptimizerPlan {
  workdir: string;
  maxDepth: number;
  projects: ProjectOptimizerProject[];
  candidates: ProjectOptimizerCandidate[];
  reclaimableBytes: number;
  totalBytes: number;
  warnings: string[];
}

export interface ProjectOptimizerApplyResult {
  plan: ProjectOptimizerPlan;
  removed: ProjectOptimizerCandidate[];
  deleted: ProjectOptimizerCandidate[];
  skipped: Array<{ candidate: ProjectOptimizerCandidate; reason: string }>;
  failed: Array<{ candidate: ProjectOptimizerCandidate; error: string }>;
  reclaimedBytes: number;
  warnings: string[];
}

export async function scanProjectOptimizer(input: ProjectOptimizerScanInput): Promise<ProjectOptimizerScanResult> {
  const workdir = path.resolve(input.workdir);
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const warnings: string[] = [];
  const projects: ProjectOptimizerProject[] = [];
  const candidates: ProjectOptimizerCandidate[] = [];
  const seenCandidateRealPaths = new Set<string>();
  const seenDirectoryRealPaths = new Set<string>();

  await assertReadableDirectory(workdir);
  await visitDirectory({ absolutePath: workdir, depth: 0, workdir, maxDepth, projects, candidates, warnings, seenCandidateRealPaths, seenDirectoryRealPaths });

  return {
    workdir,
    maxDepth,
    projects,
    candidates,
    reclaimableBytes: sumCandidateBytes(candidates),
    totalBytes: sumCandidateBytes(candidates),
    warnings,
  };
}

export async function planProjectOptimization(input: ProjectOptimizerScanInput | ProjectOptimizerScanResult): Promise<ProjectOptimizerPlan> {
  const scan = "candidates" in input ? input : await scanProjectOptimizer(input);
  return {
    workdir: scan.workdir,
    maxDepth: scan.maxDepth,
    projects: scan.projects,
    candidates: scan.candidates,
    reclaimableBytes: scan.reclaimableBytes,
    totalBytes: scan.totalBytes,
    warnings: scan.warnings,
  };
}

export async function applyProjectOptimization(plan: ProjectOptimizerPlan): Promise<ProjectOptimizerApplyResult> {
  const deleted: ProjectOptimizerCandidate[] = [];
  const skipped: Array<{ candidate: ProjectOptimizerCandidate; reason: string }> = [];
  const failed: Array<{ candidate: ProjectOptimizerCandidate; error: string }> = [];
  const warnings = [...plan.warnings];
  const deletedRealPaths = new Set<string>();

  for (const candidate of plan.candidates) {
    const verification = await verifyLiveCandidate(candidate, deletedRealPaths);
    if (!verification.ok) {
      skipped.push({ candidate, reason: verification.reason });
      continue;
    }

    try {
      await rm(verification.absolutePath, { recursive: verification.kind === "directory", force: false });
      deleted.push(candidate);
      deletedRealPaths.add(verification.realPath);
    } catch (error) {
      failed.push({ candidate, error: errorMessage(error) });
    }
  }

  return {
    plan,
    removed: deleted,
    deleted,
    skipped,
    failed,
    reclaimedBytes: sumCandidateBytes(deleted),
    warnings,
  };
}

export type ProjectOptimiseCandidate = ProjectOptimizerCandidate;
export type ProjectOptimisePlan = ProjectOptimizerPlan;
export type ProjectOptimiseApplyResult = ProjectOptimizerApplyResult;

export async function scanProjectOptimiseTargets(
  workdir: string,
  options: { maxDepth?: number } = {},
): Promise<ProjectOptimisePlan> {
  return planProjectOptimization({
    workdir,
    ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
  });
}

export async function applyProjectOptimisePlan(plan: ProjectOptimisePlan): Promise<ProjectOptimiseApplyResult> {
  return applyProjectOptimization(plan);
}

interface VisitDirectoryInput {
  absolutePath: string;
  depth: number;
  workdir: string;
  maxDepth: number;
  projects: ProjectOptimizerProject[];
  candidates: ProjectOptimizerCandidate[];
  warnings: string[];
  seenCandidateRealPaths: Set<string>;
  seenDirectoryRealPaths: Set<string>;
}

async function visitDirectory(input: VisitDirectoryInput): Promise<void> {
  let entries;
  let currentRealPath: string;
  try {
    currentRealPath = await realpath(input.absolutePath);
    if (input.seenDirectoryRealPaths.has(currentRealPath)) return;
    input.seenDirectoryRealPaths.add(currentRealPath);
    entries = await readdir(input.absolutePath, { withFileTypes: true });
  } catch (error) {
    input.warnings.push(`Skipped unreadable directory ${input.absolutePath}: ${errorMessage(error)}`);
    return;
  }

  const runtimes = detectRuntimes(entries);
  if (runtimes.length > 0) {
    input.projects.push({
      root: input.absolutePath,
      relativePath: normalizeRelativePath(path.relative(input.workdir, input.absolutePath) || "."),
      runtimes,
    });
  }

  if (input.depth >= input.maxDepth && runtimes.length === 0) return;

  for (const entry of entries) {
    const childPath = path.join(input.absolutePath, entry.name);
    const relativeToProject = normalizeRelativePath(path.relative(input.absolutePath, childPath));

    if (entry.isSymbolicLink()) continue;

    if (runtimes.length > 0) {
      const candidate = await maybeCreateCandidate({
        projectRoot: input.absolutePath,
        relativePath: relativeToProject,
        absolutePath: childPath,
        isDirectory: entry.isDirectory(),
        runtimes,
        seenCandidateRealPaths: input.seenCandidateRealPaths,
        warnings: input.warnings,
      });
      if (candidate) {
        input.candidates.push(candidate);
        continue;
      }
    }

    if (!entry.isDirectory() || shouldSkipDirectory(entry.name) || input.depth >= input.maxDepth) continue;

    await visitDirectory({ ...input, absolutePath: childPath, depth: input.depth + 1 });
  }
}

function detectRuntimes(entries: Dirent[]): RuntimeFamily[] {
  const entryNames = new Set(entries.map((entry) => entry.name));
  const runtimes = new Set<RuntimeFamily>();

  for (const marker of PROJECT_MARKERS) {
    const hasName = marker.names?.some((name) => entryNames.has(name)) ?? false;
    const hasExtension = marker.extensions?.some((extension) => entries.some((entry) => entry.name.endsWith(extension))) ?? false;
    if (hasName || hasExtension) runtimes.add(marker.runtime);
  }

  if (runtimes.has("bun")) runtimes.add("node");
  return [...runtimes];
}

interface MaybeCreateCandidateInput {
  projectRoot: string;
  relativePath: string;
  absolutePath: string;
  isDirectory: boolean;
  runtimes: RuntimeFamily[];
  seenCandidateRealPaths: Set<string>;
  warnings: string[];
}

async function maybeCreateCandidate(input: MaybeCreateCandidateInput): Promise<ProjectOptimizerCandidate | null> {
  if (!isGeneratedCandidateName(input.relativePath, input.isDirectory)) return null;
  if (input.relativePath === ".") return null;

  const classification = classifyCleanupPath({
    relativePath: input.relativePath,
    isDirectory: input.isDirectory,
    runtimes: input.runtimes,
  });
  if (classification.classification !== "safe" || !classification.canAutoClean) return null;

  try {
    const candidateRealPath = await realpath(input.absolutePath);
    if (input.seenCandidateRealPaths.has(candidateRealPath)) return null;

    const sizeBytes = input.isDirectory ? await directorySizeBytes(input.absolutePath, input.warnings) : await fileSizeBytes(input.absolutePath);
    input.seenCandidateRealPaths.add(candidateRealPath);

    return {
      id: candidateId(input.projectRoot, input.relativePath),
      projectName: path.basename(input.projectRoot),
      projectRoot: input.projectRoot,
      projectRelativePath: input.relativePath,
      absolutePath: input.absolutePath,
      realPath: candidateRealPath,
      kind: input.isDirectory ? "directory" : "file",
      runtimes: input.runtimes,
      sizeBytes,
      reason: classification.reason,
      ruleId: classification.ruleId,
    };
  } catch (error) {
    input.warnings.push(`Skipped cleanup candidate ${input.absolutePath}: ${errorMessage(error)}`);
    return null;
  }
}

async function verifyLiveCandidate(
  candidate: ProjectOptimizerCandidate,
  alreadyDeletedRealPaths: ReadonlySet<string>,
): Promise<{ ok: true; absolutePath: string; realPath: string; kind: "file" | "directory" } | { ok: false; reason: string }> {
  const projectRoot = path.resolve(candidate.projectRoot);
  const absolutePath = path.resolve(projectRoot, candidate.projectRelativePath);
  const relativeToProject = path.relative(projectRoot, absolutePath);

  if (relativeToProject === "" || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
    return { ok: false, reason: "cleanup path escapes project root" };
  }
  if (candidate.projectRelativePath === ".") {
    return { ok: false, reason: "project root is never deleted" };
  }

  let liveStat;
  let liveRealPath;
  try {
    liveStat = await lstat(absolutePath);
    if (liveStat.isSymbolicLink()) return { ok: false, reason: "symlinks are not cleaned automatically" };
    liveRealPath = await realpath(absolutePath);
  } catch (error) {
    return { ok: false, reason: `missing or unreadable path: ${errorMessage(error)}` };
  }

  if (alreadyDeletedRealPaths.has(liveRealPath)) {
    return { ok: false, reason: "real path was already deleted" };
  }

  const liveKind = liveStat.isDirectory() ? "directory" : "file";
  if (liveKind !== candidate.kind) {
    return { ok: false, reason: "path type changed since planning" };
  }
  if (!isGeneratedCandidateName(candidate.projectRelativePath, liveStat.isDirectory())) {
    return { ok: false, reason: "path no longer matches generated cleanup allowlist" };
  }

  const classification = classifyCleanupPath({
    relativePath: candidate.projectRelativePath,
    isDirectory: liveStat.isDirectory(),
    runtimes: candidate.runtimes,
  });
  if (classification.classification !== "safe" || !classification.canAutoClean) {
    return { ok: false, reason: "path no longer classifies as safe auto-clean" };
  }

  return { ok: true, absolutePath, realPath: liveRealPath, kind: liveKind };
}

function isGeneratedCandidateName(relativePath: string, isDirectory: boolean): boolean {
  const name = path.posix.basename(normalizeRelativePath(relativePath));
  const lowerName = name.toLowerCase();

  if (isDirectory) {
    return GENERATED_DIRECTORY_NAMES.has(name) || lowerName.endsWith(".egg-info");
  }

  return GENERATED_FILE_NAMES.has(name) || GENERATED_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix));
}

function shouldSkipDirectory(name: string): boolean {
  return SKIP_DIRECTORY_NAMES.has(name);
}

async function assertReadableDirectory(absolutePath: string): Promise<void> {
  const entry = await lstat(absolutePath);
  if (!entry.isDirectory()) {
    throw new Error(`Workdir is not a directory: ${absolutePath}`);
  }
}

async function directorySizeBytes(absolutePath: string, warnings: string[]): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Skipped unreadable directory while sizing ${absolutePath}: ${errorMessage(error)}`);
    return total;
  }

  for (const entry of entries) {
    const childPath = path.join(absolutePath, entry.name);
    if (entry.isSymbolicLink()) continue;
    try {
      if (entry.isDirectory()) {
        total += await directorySizeBytes(childPath, warnings);
      } else if (entry.isFile()) {
        total += await fileSizeBytes(childPath);
      }
    } catch (error) {
      warnings.push(`Skipped unreadable path while sizing ${childPath}: ${errorMessage(error)}`);
    }
  }

  return total;
}

async function fileSizeBytes(absolutePath: string): Promise<number> {
  const file = await stat(absolutePath);
  return file.size;
}

function candidateId(projectRoot: string, relativePath: string): string {
  return `project:${projectRoot}:${relativePath}`;
}

function sumCandidateBytes(candidates: ProjectOptimizerCandidate[]): number {
  return candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
