import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { generateRecommendations } from "../recommendations/recommendation-engine";
import type { Recommendation } from "../recommendations/recommendation";
import { classifyCleanupPath } from "../safety/policy";
import { normalizeRelativePath, toProjectRelativePath } from "../safety/path-utils";
import type { ProjectLifecycleStatus, RuntimeFamily } from "../safety/types";
import type { ScanItem, ScanSummary } from "./cleanable-item";
import { largestScanItems } from "./largest-items";

export interface AnalyzeProjectInput {
  projectPath: string;
  projectId?: string;
  projectName?: string;
  runtimes?: RuntimeFamily[];
  status?: ProjectLifecycleStatus;
  largestLimit?: number;
}

export interface ProjectScanResult {
  project: {
    id?: string;
    name: string;
    path: string;
    runtimes: RuntimeFamily[];
    status?: ProjectLifecycleStatus;
  };
  summary: ScanSummary;
  items: ScanItem[];
  largestItems: ScanItem[];
  recommendations: Recommendation[];
  warnings: string[];
  scannedAt: string;
}

export async function analyzeProjectCleanup(input: AnalyzeProjectInput): Promise<ProjectScanResult> {
  const projectPath = path.resolve(input.projectPath);
  const projectName = input.projectName ?? path.basename(projectPath);
  const runtimes = input.runtimes ?? [];
  const warnings: string[] = [];
  const items: ScanItem[] = [];

  const totalSizeBytes = await sizePath(projectPath, warnings);
  await collectScanItems(projectPath, projectPath, runtimes, items, warnings);

  const summary = summarizeScanItems(items, totalSizeBytes);
  const largestItems = largestScanItems(items, input.largestLimit ?? 20);
  const recommendationInput = {
    projectName,
    summary,
    items,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const recommendations = generateRecommendations(recommendationInput);
  const project = {
    name: projectName,
    path: projectPath,
    runtimes,
    ...(input.projectId ? { id: input.projectId } : {}),
    ...(input.status ? { status: input.status } : {}),
  };

  return {
    project,
    summary,
    items,
    largestItems,
    recommendations,
    warnings,
    scannedAt: new Date().toISOString(),
  };
}

export function summarizeScanItems(items: ScanItem[], totalSizeBytes: number): ScanSummary {
  const summary: ScanSummary = {
    totalSizeBytes,
    safeCleanupBytes: 0,
    cautionBytes: 0,
    protectedBytes: 0,
    unknownBytes: 0,
  };

  for (const item of items) {
    if (item.classification === "safe") summary.safeCleanupBytes += item.sizeBytes;
    if (item.classification === "caution") summary.cautionBytes += item.sizeBytes;
    if (item.classification === "protected") summary.protectedBytes += item.sizeBytes;
    if (item.classification === "unknown") summary.unknownBytes += item.sizeBytes;
  }

  return summary;
}

async function collectScanItems(
  projectPath: string,
  currentPath: string,
  runtimes: RuntimeFamily[],
  items: ScanItem[],
  warnings: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Could not read ${toProjectRelativePath(projectPath, currentPath)}: ${errorMessage(error)}`);
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = normalizeRelativePath(path.relative(projectPath, absolutePath));
    const kind = entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : "file";
    const classification = classifyCleanupPath({
      relativePath,
      isDirectory: entry.isDirectory(),
      runtimes,
    });

    if (classification.classification !== "unknown" || kind !== "file") {
      const sizeBytes = await sizePath(absolutePath, warnings);
      if (classification.classification !== "unknown") {
        items.push({
          path: relativePath,
          absolutePath,
          classification: classification.classification,
          kind,
          sizeBytes,
          reason: classification.reason,
          ruleId: classification.ruleId,
          canAutoClean: classification.canAutoClean,
        });
        continue;
      }
    }

    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await collectScanItems(projectPath, absolutePath, runtimes, items, warnings);
    }
  }
}

async function sizePath(targetPath: string, warnings: string[]): Promise<number> {
  let stat;
  try {
    stat = await lstat(targetPath);
  } catch (error) {
    warnings.push(`Could not stat ${targetPath}: ${errorMessage(error)}`);
    return 0;
  }

  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return stat.size;
  }

  let total = 0;
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Could not read ${targetPath}: ${errorMessage(error)}`);
    return stat.size;
  }

  for (const entry of entries) {
    total += await sizePath(path.join(targetPath, entry.name), warnings);
  }

  return total;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
