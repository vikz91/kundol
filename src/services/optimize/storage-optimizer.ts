import type { Database } from "bun:sqlite";
import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Project } from "../../db/repositories/project-repository";
import { ActionRepository } from "../../db/repositories/action-repository";
import { ProjectRepository } from "../../db/repositories/project-repository";
import { ScanRepository } from "../../db/repositories/scan-repository";
import { cleanProjectService } from "../scan-clean/clean-project-service";

export type OptimizeSafety = "safe" | "review" | "protected";
export type OptimizeCandidateKind = "project" | "command" | "filesystem";

export interface OptimizeCandidate {
  id: string;
  kind: OptimizeCandidateKind;
  category: string;
  label: string;
  detail: string;
  command: string;
  safety: OptimizeSafety;
  defaultSelected: boolean;
  sizeBytes: number | null;
  projectId?: string;
  projectName?: string;
  run?: string[];
  path?: string;
  minAgeDays?: number;
}

export interface OptimizePreview {
  candidates: OptimizeCandidate[];
  safeSelectedCount: number;
  reviewCount: number;
  protectedCount: number;
  knownReclaimableBytes: number;
}

export interface OptimizeApplyResult {
  applied: OptimizeCandidate[];
  skipped: OptimizeCandidate[];
  failed: Array<{ candidate: OptimizeCandidate; error: string }>;
}

export async function previewStorageOptimization(projects: Project[]): Promise<OptimizePreview> {
  const candidates: OptimizeCandidate[] = [
    ...projectCandidates(projects),
    ...(await commandCandidates()),
    ...(await filesystemCandidates()),
    ...reviewOnlyMacCandidates(),
  ];

  return {
    candidates,
    safeSelectedCount: candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected).length,
    reviewCount: candidates.filter((candidate) => candidate.safety === "review").length,
    protectedCount: candidates.filter((candidate) => candidate.safety === "protected").length,
    knownReclaimableBytes: candidates
      .filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected)
      .reduce((total, candidate) => total + (candidate.sizeBytes ?? 0), 0),
  };
}

export async function applyStorageOptimization(db: Database, preview: OptimizePreview): Promise<OptimizeApplyResult> {
  const applied: OptimizeCandidate[] = [];
  const skipped: OptimizeCandidate[] = [];
  const failed: Array<{ candidate: OptimizeCandidate; error: string }> = [];
  const selected = preview.candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected);
  const repositories = createScanRepositories(db);

  for (const candidate of selected) {
    try {
      if (candidate.kind === "project" && candidate.projectId) {
        await cleanProjectService({ target: candidate.projectId, apply: true }, repositories);
        applied.push(candidate);
        continue;
      }

      if (candidate.kind === "command" && candidate.run) {
        const result = await runCommand(candidate.run[0]!, candidate.run.slice(1));
        if (result.exitCode === 0) {
          applied.push(candidate);
        } else {
          failed.push({ candidate, error: result.output.trim() || `Command exited with ${result.exitCode}` });
        }
        continue;
      }

      if (candidate.kind === "filesystem" && candidate.path) {
        const verified = await verifyFilesystemCandidate(candidate);
        if (!verified.ok) {
          skipped.push(candidate);
          continue;
        }
        await rm(verified.path, { recursive: verified.isDirectory, force: false });
        applied.push(candidate);
        continue;
      }

      skipped.push(candidate);
    } catch (error) {
      failed.push({ candidate, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { applied, skipped, failed };
}

function projectCandidates(projects: Project[]): OptimizeCandidate[] {
  return projects
    .filter((project) => project.cleanableBytes > 0)
    .map((project) => {
      const inactive = ["PAUSED", "STALE"].includes(project.status);
      return {
        id: `project:${project.id}`,
        kind: "project",
        category: "Project generated files",
        label: project.name,
        detail: inactive
          ? "Safe generated files from an inactive indexed project."
          : "Safe generated files, but project looks active/new so it is review-only.",
        command: `kundol optimise projects ${project.path}`,
        safety: inactive ? "safe" : "review",
        defaultSelected: inactive,
        sizeBytes: project.cleanableBytes,
        projectId: project.id,
        projectName: project.name,
      } satisfies OptimizeCandidate;
    });
}

async function commandCandidates(): Promise<OptimizeCandidate[]> {
  const specs: Array<{
    id: string;
    category: string;
    label: string;
    detail: string;
    command: string;
    run: string[];
    safety: OptimizeSafety;
    defaultSelected: boolean;
    probe: string[];
  }> = [
    {
      id: "command:bun-cache-rm",
      category: "Package caches",
      label: "Bun cache",
      detail: "Removes Bun package cache; future installs may re-download.",
      command: "bun pm cache rm",
      run: ["bun", "pm", "cache", "rm"],
      safety: "safe",
      defaultSelected: true,
      probe: ["bun", "--version"],
    },
    {
      id: "command:pip-cache-purge",
      category: "Package caches",
      label: "pip cache",
      detail: "Removes pip wheel/download cache; future installs may re-download.",
      command: "python3 -m pip cache purge",
      run: ["python3", "-m", "pip", "cache", "purge"],
      safety: "safe",
      defaultSelected: true,
      probe: ["python3", "-m", "pip", "--version"],
    },
    {
      id: "command:npm-cache-verify",
      category: "Package caches",
      label: "npm cache verify",
      detail: "Verifies npm cache integrity and garbage-collects unneeded cache data.",
      command: "npm cache verify",
      run: ["npm", "cache", "verify"],
      safety: "safe",
      defaultSelected: true,
      probe: ["npm", "--version"],
    },
    {
      id: "command:pnpm-store-prune",
      category: "Package caches",
      label: "pnpm store prune",
      detail: "Removes unreferenced pnpm store packages; future installs may re-download.",
      command: "pnpm store prune",
      run: ["pnpm", "store", "prune"],
      safety: "safe",
      defaultSelected: true,
      probe: ["pnpm", "--version"],
    },
    {
      id: "command:yarn-cache-clean",
      category: "Package caches",
      label: "yarn cache clean",
      detail: "Removes Yarn cache archives; future installs may re-download.",
      command: "yarn cache clean",
      run: ["yarn", "cache", "clean"],
      safety: "safe",
      defaultSelected: true,
      probe: ["yarn", "--version"],
    },
    {
      id: "command:go-clean-cache",
      category: "Runtime caches",
      label: "Go build/test cache",
      detail: "Clears Go build cache and expires test result cache.",
      command: "go clean -cache -testcache",
      run: ["go", "clean", "-cache", "-testcache"],
      safety: "safe",
      defaultSelected: true,
      probe: ["go", "version"],
    },
    {
      id: "command:docker-system-prune",
      category: "Docker",
      label: "Docker system prune",
      detail: "Removes stopped containers, unused networks, dangling images, and build cache. Volumes are excluded.",
      command: "docker system prune --force",
      run: ["docker", "system", "prune", "--force"],
      safety: "safe",
      defaultSelected: true,
      probe: ["docker", "info"],
    },
  ];

  const candidates: OptimizeCandidate[] = [];
  for (const spec of specs) {
    const probe = await runCommand(spec.probe[0]!, spec.probe.slice(1));
    if (probe.exitCode !== 0) continue;
    candidates.push({
      id: spec.id,
      kind: "command",
      category: spec.category,
      label: spec.label,
      detail: spec.detail,
      command: spec.command,
      safety: spec.safety,
      defaultSelected: spec.defaultSelected,
      sizeBytes: null,
      run: spec.run,
    });
  }
  return candidates;
}

async function filesystemCandidates(): Promise<OptimizeCandidate[]> {
  const candidates: OptimizeCandidate[] = [];
  const tempRoot = tmpdir();
  let entries;
  try {
    entries = await readdir(tempRoot, { withFileTypes: true });
  } catch {
    return candidates;
  }

  const now = Date.now();
  const minAgeDays = 7;
  const minAgeMs = minAgeDays * 86_400_000;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(tempRoot, entry.name);
    try {
      const info = await lstat(absolutePath);
      if (now - info.mtimeMs < minAgeMs) continue;
      if (!info.isDirectory() && !info.isFile()) continue;
      const sizeBytes = info.isDirectory() ? await sizePath(absolutePath) : info.size;
      candidates.push({
        id: `filesystem:tmp:${entry.name}`,
        kind: "filesystem",
        category: "Temporary files",
        label: `Old temp ${entry.name}`,
        detail: `Removes a top-level temp ${info.isDirectory() ? "directory" : "file"} older than ${minAgeDays} days.`,
        command: `rm -rf ${absolutePath}`,
        safety: "safe",
        defaultSelected: true,
        sizeBytes,
        path: absolutePath,
        minAgeDays,
      });
    } catch {
      continue;
    }
  }

  return candidates;
}

function reviewOnlyMacCandidates(): OptimizeCandidate[] {
  return [
    {
      id: "review:user-caches",
      kind: "command",
      category: "macOS review-only",
      label: "~/Library/Caches",
      detail: "App caches can be active; use app-owned cleanup or explicit per-app review.",
      command: "review only",
      safety: "review",
      defaultSelected: false,
      sizeBytes: null,
    },
    {
      id: "protected:docker-volumes",
      kind: "command",
      category: "Protected",
      label: "Docker volumes",
      detail: "Volumes may contain databases/uploads and are never included in one-click apply.",
      command: "never default",
      safety: "protected",
      defaultSelected: false,
      sizeBytes: null,
    },
  ];
}

async function verifyFilesystemCandidate(candidate: OptimizeCandidate): Promise<{ ok: true; path: string; isDirectory: boolean } | { ok: false }> {
  if (!candidate.path || !candidate.minAgeDays) return { ok: false };
  const tempRoot = await realpath(tmpdir());
  let targetRealPath;
  let info;
  try {
    info = await lstat(candidate.path);
    if (info.isSymbolicLink()) return { ok: false };
    targetRealPath = await realpath(candidate.path);
  } catch {
    return { ok: false };
  }

  const relative = path.relative(tempRoot, targetRealPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false };
  if (!info.isDirectory() && !info.isFile()) return { ok: false };
  const minAgeMs = candidate.minAgeDays * 86_400_000;
  if (Date.now() - info.mtimeMs < minAgeMs) return { ok: false };
  return { ok: true, path: targetRealPath, isDirectory: info.isDirectory() };
}

async function sizePath(targetPath: string): Promise<number> {
  const info = await lstat(targetPath);
  if (!info.isDirectory() || info.isSymbolicLink()) return info.size;
  let total = 0;
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    try {
      total += await sizePath(path.join(targetPath, entry.name));
    } catch {
      continue;
    }
  }
  return total;
}

function createScanRepositories(db: Database) {
  const clock = { now: () => new Date() };
  return {
    db,
    projects: new ProjectRepository(db, clock),
    scans: new ScanRepository(db, clock),
    actions: new ActionRepository(db, clock),
  };
}

async function runCommand(command: string, args: string[]): Promise<{ exitCode: number; output: string }> {
  try {
    const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, output: `${stdout}${stderr}` };
  } catch (error) {
    return { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
  }
}
