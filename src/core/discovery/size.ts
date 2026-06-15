import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveryWarning } from "../projects/types";

export interface DirectorySizeOptions {
  skipDirectoryNames?: ReadonlySet<string>;
}

export interface DirectorySizeResult {
  sizeBytes: number;
  filesCounted: number;
  directoriesCounted: number;
  skippedDirectories: number;
  warnings: DiscoveryWarning[];
}

export async function calculateDirectorySize(
  rootPath: string,
  options: DirectorySizeOptions = {},
): Promise<DirectorySizeResult> {
  const warnings: DiscoveryWarning[] = [];
  let sizeBytes = 0;
  let filesCounted = 0;
  let directoriesCounted = 0;
  let skippedDirectories = 0;

  async function visit(path: string): Promise<void> {
    let info;
    try {
      info = await lstat(path);
    } catch (error) {
      warnings.push(toSizeWarning(path, error));
      return;
    }

    if (info.isSymbolicLink()) {
      skippedDirectories += 1;
      return;
    }

    if (info.isFile()) {
      sizeBytes += info.size;
      filesCounted += 1;
      return;
    }

    if (!info.isDirectory()) {
      sizeBytes += info.size;
      return;
    }

    const directoryName = path.split(/[\\/]/).pop() ?? path;
    if (options.skipDirectoryNames?.has(directoryName)) {
      skippedDirectories += 1;
      return;
    }

    directoriesCounted += 1;

    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      warnings.push(toSizeWarning(path, error));
      return;
    }

    await Promise.all(entries.map((entry) => visit(join(path, entry.name))));
  }

  await visit(rootPath);

  return {
    sizeBytes,
    filesCounted,
    directoriesCounted,
    skippedDirectories,
    warnings,
  };
}

function toSizeWarning(path: string, error: unknown): DiscoveryWarning {
  return {
    code: "SIZE_CALCULATION_FAILED",
    path,
    message: error instanceof Error ? error.message : "Could not calculate size.",
  };
}
