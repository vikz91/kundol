import { relative } from "node:path";
import { loadKundolConfig } from "../../config";
import { openKundolDatabase } from "../../db/client";
import {
  ActionRepository,
  ExcludedPathRepository,
  ProjectRepository,
  type Project,
} from "../../db/repositories";
import { runIndexWorker, type IndexWorkerResult } from "../../core/workers/index-worker";
import { inferLifecycleStatus } from "../../core/projects/lifecycle";
import type { DiscoveryWarning } from "../../core/projects/types";
import type { ProcessRunner } from "../../core/discovery/git";
import type { Clock } from "../../platform/clock";
import { systemClock, toIsoDateTime } from "../../platform/clock";
import { normalizeConfiguredPath } from "../../db/repositories/workspace-repository";

export interface RunWorkspaceIndexOptions {
  databasePath?: string;
  homeDir?: string;
  workspaceRoots?: string[];
  processRunner?: ProcessRunner;
  clock?: Clock;
  now?: () => Date;
}

export interface RunWorkspaceIndexResult {
  databasePath: string;
  workspacesIndexed: number;
  projectsFound: number;
  newProjects: number;
  updatedProjects: number;
  missingProjects: number;
  skippedDirectories: number;
  warnings: DiscoveryWarning[];
  startedAt: Date;
  completedAt: Date;
  elapsedMs: number;
  projects: Project[];
  missing: Project[];
  actionId: string;
}

export class WorkspaceIndexError extends Error {
  constructor(
    readonly code: "NOT_INITIALIZED" | "NO_WORKSPACES",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceIndexError";
  }
}

export async function runWorkspaceIndex(options: RunWorkspaceIndexOptions = {}): Promise<RunWorkspaceIndexResult> {
  const clock = options.clock ?? systemClock;
  const now = options.now ?? (() => clock.now());
  const config = loadKundolConfig({
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    clock,
  });

  const workspaceRoots = resolveWorkspaceRoots(options.workspaceRoots, config.workspaces);
  if (workspaceRoots.length === 0) {
    throw new WorkspaceIndexError(
      config.initialized ? "NO_WORKSPACES" : "NOT_INITIALIZED",
      config.initialized
        ? "No workspace roots are available for indexing."
        : "kundol is not initialized yet. Run `kundol init` to choose workspace folders.",
    );
  }

  const connection = openKundolDatabase({ databasePath: config.databasePath, clock });

  try {
    const projects = new ProjectRepository(connection.db, clock);
    const actions = new ActionRepository(connection.db, clock);
    const excludedPaths = new ExcludedPathRepository(connection.db, clock);
    const exclusions = excludedPaths.list().map((excludedPath) => excludedPath.path);
    const workerResult = await runIndexWorker({
      workspaceRoots,
      excludedPaths: exclusions,
      ...(options.processRunner ? { processRunner: options.processRunner } : {}),
      now,
    });
    const existingByPath = new Map(projects.list().map((project) => [project.path, project]));
    const upserted: Project[] = [];
    let newProjects = 0;
    let updatedProjects = 0;

    for (const indexedProject of workerResult.projects) {
      const existing = existingByPath.get(normalizeConfiguredPath(indexedProject.path));
      const status = inferLifecycleStatus({
        now: indexedProject.lastIndexedAt,
        firstSeenAt: existing?.createdAt ?? indexedProject.lastIndexedAt,
        lastModifiedAt: indexedProject.lastModifiedAt,
        ...(existing ? { previousStatus: existing.status } : {}),
        exists: true,
      });

      const project = projects.upsert({
        path: indexedProject.path,
        name: indexedProject.name,
        primaryRuntime: indexedProject.type.primaryRuntime,
        runtimes: indexedProject.type.runtimes,
        status,
        sizeBytes: indexedProject.sizeBytes,
        gitRemoteUrl: indexedProject.git.remoteUrl,
        gitBranch: indexedProject.git.branch,
        gitDirty: indexedProject.git.dirty ?? false,
        lastIndexedAt: toIsoDateTime(indexedProject.lastIndexedAt),
      });

      if (existing) {
        updatedProjects += 1;
      } else {
        newProjects += 1;
      }
      upserted.push(project);
    }

    const missing = markMissingProjects({
      projects,
      allProjects: Array.from(existingByPath.values()),
      discoveredPaths: new Set(workerResult.projects.map((project) => normalizeConfiguredPath(project.path))),
      workspaceRoots,
      indexedAt: workerResult.completedAt,
    });
    const action = actions.record({
      actionType: "INDEX",
      details: buildActionDetails(workerResult, {
        newProjects,
        updatedProjects,
        missingProjects: missing.length,
        workspaceRoots,
        excludedPaths: exclusions,
      }),
    });

    return {
      databasePath: connection.path,
      workspacesIndexed: workerResult.workspacesIndexed,
      projectsFound: workerResult.projects.length,
      newProjects,
      updatedProjects,
      missingProjects: missing.length,
      skippedDirectories: workerResult.skippedDirectories,
      warnings: workerResult.warnings,
      startedAt: workerResult.startedAt,
      completedAt: workerResult.completedAt,
      elapsedMs: workerResult.elapsedMs,
      projects: upserted,
      missing,
      actionId: action.id,
    };
  } finally {
    connection.close();
  }
}

function resolveWorkspaceRoots(
  overrideRoots: string[] | undefined,
  configuredWorkspaces: Array<{ path: string; enabled: boolean }>,
): string[] {
  const roots = overrideRoots ?? configuredWorkspaces.filter((workspace) => workspace.enabled).map((workspace) => workspace.path);
  return Array.from(new Set(roots.map((root) => normalizeConfiguredPath(root)))).sort((a, b) => a.localeCompare(b));
}

function markMissingProjects(input: {
  projects: ProjectRepository;
  allProjects: Project[];
  discoveredPaths: Set<string>;
  workspaceRoots: string[];
  indexedAt: Date;
}): Project[] {
  const missing: Project[] = [];

  for (const project of input.allProjects) {
    if (!isUnderAnyRoot(project.path, input.workspaceRoots) || input.discoveredPaths.has(project.path)) {
      continue;
    }

    missing.push(
      input.projects.upsert({
        path: project.path,
        name: project.name,
        primaryRuntime: project.primaryRuntime,
        runtimes: project.runtimes,
        status: inferLifecycleStatus({
          now: input.indexedAt,
          previousStatus: project.status,
          exists: false,
        }),
        sizeBytes: project.sizeBytes,
        cleanableBytes: project.cleanableBytes,
        gitRemoteUrl: project.gitRemoteUrl,
        gitBranch: project.gitBranch,
        gitDirty: project.gitDirty,
        notes: project.notes,
        lastIndexedAt: toIsoDateTime(input.indexedAt),
        lastScannedAt: project.lastScannedAt,
      }),
    );
  }

  return missing;
}

function isUnderAnyRoot(path: string, roots: string[]): boolean {
  return roots.some((root) => {
    const rel = relative(root, path);
    return rel === "" || (!!rel && !rel.startsWith("..") && !rel.startsWith("/"));
  });
}

function buildActionDetails(
  workerResult: IndexWorkerResult,
  counts: {
    newProjects: number;
    updatedProjects: number;
    missingProjects: number;
    workspaceRoots: string[];
    excludedPaths: string[];
  },
): Record<string, unknown> {
  return {
    workspacesIndexed: workerResult.workspacesIndexed,
    workspaceRoots: counts.workspaceRoots,
    excludedPaths: counts.excludedPaths,
    projectsFound: workerResult.projects.length,
    newProjects: counts.newProjects,
    updatedProjects: counts.updatedProjects,
    missingProjects: counts.missingProjects,
    skippedDirectories: workerResult.skippedDirectories,
    warnings: workerResult.warnings.length,
    elapsedMs: workerResult.elapsedMs,
    startedAt: toIsoDateTime(workerResult.startedAt),
    completedAt: toIsoDateTime(workerResult.completedAt),
  };
}
