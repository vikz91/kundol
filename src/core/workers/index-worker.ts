import { basename, resolve } from "node:path";
import { calculateDirectorySize } from "../discovery/size";
import { discoverWorkspaceProjects } from "../discovery/traversal";
import { collectGitMetadata, type ProcessRunner } from "../discovery/git";
import type { DiscoveredProject, DiscoveryWarning, GitMetadata } from "../projects/types";

export interface IndexWorkerInput {
  workspaceRoots: string[];
  excludedPaths?: string[];
  processRunner?: ProcessRunner;
  now?: () => Date;
}

export interface IndexedProject extends DiscoveredProject {
  sizeBytes: number;
  lastModifiedAt: Date | null;
  lastIndexedAt: Date;
  git: GitMetadata;
  warnings: DiscoveryWarning[];
}

export interface IndexWorkerResult {
  workspacesIndexed: number;
  projects: IndexedProject[];
  skippedDirectories: number;
  warnings: DiscoveryWarning[];
  startedAt: Date;
  completedAt: Date;
  elapsedMs: number;
}

export async function runIndexWorker(input: IndexWorkerInput): Promise<IndexWorkerResult> {
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const projects = new Map<string, IndexedProject>();
  const warnings: DiscoveryWarning[] = [];
  let skippedDirectories = 0;

  for (const workspaceRoot of deduplicateRoots(input.workspaceRoots)) {
    const discovery = await discoverWorkspaceProjects(
      workspaceRoot,
      input.excludedPaths ? { excludedPaths: input.excludedPaths } : {},
    );
    skippedDirectories += discovery.skippedDirectories;
    warnings.push(...discovery.warnings);

    for (const project of discovery.projects) {
      const [size, git] = await Promise.all([
        calculateDirectorySize(project.path),
        collectGitMetadata(
          project.path,
          input.processRunner ? { processRunner: input.processRunner } : {},
        ),
      ]);

      const projectWarnings = [...size.warnings, ...git.warnings];
      warnings.push(...projectWarnings);
      projects.set(project.path, {
        ...project,
        name: project.name || basename(project.path),
        sizeBytes: size.sizeBytes,
        lastModifiedAt: git.lastModifiedAt,
        lastIndexedAt: now(),
        git,
        warnings: projectWarnings,
      });
    }
  }

  const completedAt = now();

  return {
    workspacesIndexed: deduplicateRoots(input.workspaceRoots).length,
    projects: Array.from(projects.values()).sort((a, b) => a.path.localeCompare(b.path)),
    skippedDirectories,
    warnings,
    startedAt,
    completedAt,
    elapsedMs: completedAt.getTime() - startedAt.getTime(),
  };
}

function deduplicateRoots(roots: string[]): string[] {
  return Array.from(new Set(roots.map((root) => resolve(root)))).sort((a, b) => a.localeCompare(b));
}
