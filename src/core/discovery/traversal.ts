import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { detectProjectMarkers, groupDetectedRuntimes, hasProjectMarkers } from "./markers";
import { inferProjectType } from "./type-inference";
import type { DiscoveredProject, DiscoveryWarning } from "../projects/types";

export const builtInTraversalSkipDirectoryNames = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "target",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".gradle",
  "bin",
  "obj",
  "Library",
  "Temp",
  "Logs",
]);

export interface DiscoverWorkspaceProjectsOptions {
  excludedPaths?: string[];
  detectMarkers?: typeof detectProjectMarkers;
}

export interface DiscoverWorkspaceProjectsResult {
  projects: DiscoveredProject[];
  skippedDirectories: number;
  warnings: DiscoveryWarning[];
}

export async function discoverWorkspaceProjects(
  workspaceRoot: string,
  options: DiscoverWorkspaceProjectsOptions = {},
): Promise<DiscoverWorkspaceProjectsResult> {
  const rootPath = resolve(workspaceRoot);
  const excludedPaths = await resolveExcludedPaths(options.excludedPaths ?? []);
  const detectMarkers = options.detectMarkers ?? detectProjectMarkers;
  const projectsByPath = new Map<string, DiscoveredProject>();
  const warnings: DiscoveryWarning[] = [];
  let skippedDirectories = 0;

  async function visit(directoryPath: string): Promise<void> {
    const absolutePath = resolve(directoryPath);

    if (excludedPaths.has(absolutePath) || excludedPaths.has(await safeRealPath(absolutePath))) {
      skippedDirectories += 1;
      warnings.push({
        code: "EXCLUDED_PATH_SKIPPED",
        path: absolutePath,
        message: "Skipped configured excluded path.",
      });
      return;
    }

    const directoryName = basename(absolutePath);
    if (shouldSkipDirectory(directoryName)) {
      skippedDirectories += 1;
      return;
    }

    try {
      const info = await lstat(absolutePath);
      if (info.isSymbolicLink()) {
        skippedDirectories += 1;
        warnings.push({
          code: "SYMLINK_SKIPPED",
          path: absolutePath,
          message: "Skipped symlinked directory.",
        });
        return;
      }

      if (!info.isDirectory()) {
        return;
      }
    } catch (error) {
      skippedDirectories += 1;
      warnings.push(toDirectoryWarning(absolutePath, error));
      return;
    }

    try {
      const markers = await detectMarkers(absolutePath);
      if (hasProjectMarkers(markers)) {
        const detectedRuntimes = groupDetectedRuntimes(markers);
        projectsByPath.set(absolutePath, {
          name: basename(absolutePath),
          path: absolutePath,
          markers,
          detectedRuntimes,
          type: inferProjectType(detectedRuntimes),
        });
      }
    } catch (error) {
      warnings.push(toDirectoryWarning(absolutePath, error));
    }

    let entries;
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      warnings.push(toDirectoryWarning(absolutePath, error));
      return;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => visit(join(absolutePath, entry.name))),
    );
  }

  await visit(rootPath);

  return {
    projects: Array.from(projectsByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
    skippedDirectories,
    warnings,
  };
}

export function shouldSkipDirectory(directoryName: string): boolean {
  return builtInTraversalSkipDirectoryNames.has(directoryName);
}

async function resolveExcludedPaths(paths: string[]): Promise<Set<string>> {
  const resolved = new Set<string>();

  for (const path of paths) {
    const absolutePath = resolve(path);
    resolved.add(absolutePath);
    resolved.add(await safeRealPath(absolutePath));
  }

  return resolved;
}

async function safeRealPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

function toDirectoryWarning(path: string, error: unknown): DiscoveryWarning {
  const code = isPermissionError(error) ? "PERMISSION_DENIED" : "UNREADABLE_DIRECTORY";
  return {
    code,
    path,
    message: error instanceof Error ? error.message : "Directory could not be read.",
  };
}

function isPermissionError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EACCES");
}
