import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { DiscoveryWarning, GitMetadata } from "../projects/types";

export interface ProcessRunner {
  run(command: string, args: string[], options: { cwd: string }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

export interface CollectGitMetadataOptions {
  processRunner?: ProcessRunner;
}

export async function collectGitMetadata(
  projectPath: string,
  options: CollectGitMetadataOptions = {},
): Promise<GitMetadata> {
  const warnings: DiscoveryWarning[] = [];
  const gitDirectory = await resolveGitDirectory(projectPath, warnings);

  if (!gitDirectory) {
    return {
      isGitRepo: false,
      branch: null,
      remoteUrl: null,
      dirty: null,
      lastModifiedAt: null,
      warnings,
    };
  }

  const [branch, remoteUrl, lastModifiedAt, dirty] = await Promise.all([
    readGitBranch(gitDirectory, warnings),
    readOriginRemote(gitDirectory, warnings),
    readGitModifiedTime(gitDirectory, warnings),
    readDirtyFlag(projectPath, options.processRunner, warnings),
  ]);

  return {
    isGitRepo: true,
    branch,
    remoteUrl,
    dirty,
    lastModifiedAt,
    warnings,
  };
}

async function resolveGitDirectory(projectPath: string, warnings: DiscoveryWarning[]): Promise<string | null> {
  const dotGitPath = join(projectPath, ".git");

  try {
    const dotGitInfo = await lstat(dotGitPath);
    if (dotGitInfo.isDirectory()) {
      return dotGitPath;
    }

    if (dotGitInfo.isFile()) {
      const content = await readFile(dotGitPath, "utf8");
      const match = content.match(/^gitdir:\s*(.+)$/m);
      const gitDir = match?.[1];
      if (!gitDir) {
        return null;
      }

      return resolve(dirname(dotGitPath), gitDir.trim());
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      warnings.push(toGitWarning(dotGitPath, error));
    }
  }

  return null;
}

async function readGitBranch(gitDirectory: string, warnings: DiscoveryWarning[]): Promise<string | null> {
  const headPath = join(gitDirectory, "HEAD");

  try {
    const head = (await readFile(headPath, "utf8")).trim();
    const branchMatch = head.match(/^ref:\s+refs\/heads\/(.+)$/);
    return branchMatch?.[1] ?? (head.slice(0, 12) || null);
  } catch (error) {
    warnings.push(toGitWarning(headPath, error));
    return null;
  }
}

async function readOriginRemote(gitDirectory: string, warnings: DiscoveryWarning[]): Promise<string | null> {
  const configPath = join(gitDirectory, "config");

  try {
    const config = await readFile(configPath, "utf8");
    const lines = config.split(/\r?\n/);
    let inOriginRemote = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith("[") && line.endsWith("]")) {
        inOriginRemote = /^\[remote\s+"origin"\]$/.test(line);
        continue;
      }

      if (inOriginRemote) {
        const match = line.match(/^url\s*=\s*(.+)$/);
        const remoteUrl = match?.[1];
        if (remoteUrl) {
          return remoteUrl.trim();
        }
      }
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      warnings.push(toGitWarning(configPath, error));
    }
  }

  return null;
}

async function readGitModifiedTime(gitDirectory: string, warnings: DiscoveryWarning[]): Promise<Date | null> {
  try {
    const info = await lstat(gitDirectory);
    return info.mtime;
  } catch (error) {
    warnings.push(toGitWarning(gitDirectory, error));
    return null;
  }
}

async function readDirtyFlag(
  projectPath: string,
  processRunner: ProcessRunner | undefined,
  warnings: DiscoveryWarning[],
): Promise<boolean | null> {
  if (!processRunner) {
    return null;
  }

  try {
    const result = await processRunner.run("git", ["status", "--porcelain"], { cwd: projectPath });
    if (result.exitCode !== 0) {
      warnings.push({
        code: "GIT_METADATA_FAILED",
        path: projectPath,
        message: result.stderr.trim() || "Could not read git dirty status.",
      });
      return null;
    }

    return result.stdout.trim().length > 0;
  } catch (error) {
    warnings.push(toGitWarning(projectPath, error));
    return null;
  }
}

function toGitWarning(path: string, error: unknown): DiscoveryWarning {
  return {
    code: "GIT_METADATA_FAILED",
    path,
    message: error instanceof Error ? error.message : "Could not read git metadata.",
  };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
