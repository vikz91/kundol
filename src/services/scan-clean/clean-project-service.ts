import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import type { ScanItem } from "../../core/analysis/cleanable-item";
import { largestScanItems } from "../../core/analysis/largest-items";
import { createDryRunCleanupPlan } from "../../core/safety/dry-run";
import { classifyCleanupPath } from "../../core/safety/policy";
import { normalizeRelativePath } from "../../core/safety/path-utils";
import type { RuntimeFamily } from "../../core/safety/types";
import type { ActionLogEntry, Project, ProjectScan } from "../../db/repositories";
import { archiveProjectFolder, getProjectArchivePlan, type ProjectArchivePlan, type ProjectArchiveResult } from "../archive/project-archive-service";
import { resolveProject, type ScanCleanRepositories } from "./scan-project-service";

export interface CleanProjectServiceInput {
  target: string;
  apply?: boolean;
  scanId?: string;
  archiveBeforeCleanDays?: number;
  archiveRoot?: string;
}

export interface CleanProjectServiceResult {
  project: Project;
  scan: ProjectScan;
  dryRun: boolean;
  items: ScanItem[];
  deletedItems: ScanItem[];
  recoverableBytes: number;
  deletedBytes: number;
  archivePlan: ProjectArchivePlan;
  archive: ProjectArchiveResult | null;
  warnings: string[];
  action: ActionLogEntry;
}

interface ScanItemRow {
  path: string;
  kind: "file" | "directory" | "symlink";
  safety: string;
  size_bytes: number;
  reason: string | null;
  metadata_json: string;
}

export async function cleanProjectService(
  input: CleanProjectServiceInput,
  repositories: ScanCleanRepositories,
): Promise<CleanProjectServiceResult> {
  const project = resolveProject(input.target, repositories.projects);
  if (!project) {
    throw new Error(`Project not found: ${input.target}`);
  }

  const scan = input.scanId ? repositories.scans.findById(input.scanId) : repositories.scans.findLatestForProject(project.id);
  if (!scan || scan.projectId !== project.id) {
    throw new Error(`No scan found for project: ${project.name}`);
  }

  const persistedItems = findScanItemsForCleanup(scan.id, project, repositories);
  const plan = createDryRunCleanupPlan(persistedItems);
  const dryRun = input.apply !== true;
  const warnings = [...plan.warnings];
  const deletedItems: ScanItem[] = [];
  const archiveThresholdDays = input.archiveBeforeCleanDays ?? 15;
  const archivePlan = await getProjectArchivePlan(project.path, archiveThresholdDays);
  let archive: ProjectArchiveResult | null = null;

  if (!dryRun) {
    if (input.archiveRoot) {
      archive = await archiveProjectFolder({
        projectPath: project.path,
        projectName: project.name,
        archiveRoot: input.archiveRoot,
        thresholdDays: archiveThresholdDays,
      });
    }
    warnings.length = 0;
    for (const item of plan.items) {
      const verification = await verifySafeGeneratedItem(project, item);
      if (!verification.ok) {
        warnings.push(verification.warning);
        continue;
      }

      await rm(verification.absolutePath, {
        recursive: verification.isDirectory,
        force: false,
      });
      deletedItems.push(item);
    }
  }

  const action = repositories.actions.record({
    projectId: project.id,
    actionType: dryRun ? "CLEAN_DRY_RUN" : "CLEAN_APPLY",
    details: {
      scanId: scan.id,
      itemCount: plan.items.length,
      recoverableBytes: plan.recoverableBytes,
      deletedCount: deletedItems.length,
      deletedBytes: sumBytes(deletedItems),
      archivePlan,
      archive,
      warnings,
    },
  });

  return {
    project,
    scan,
    dryRun,
    items: plan.items,
    deletedItems,
    recoverableBytes: plan.recoverableBytes,
    deletedBytes: sumBytes(deletedItems),
    archivePlan,
    archive,
    warnings,
    action,
  };
}

function findScanItemsForCleanup(scanId: string, project: Project, repositories: ScanCleanRepositories): ScanItem[] {
  const rows = repositories.db
    .query<ScanItemRow, [string]>(
      `SELECT path, kind, safety, size_bytes, reason, metadata_json
       FROM scan_items
       WHERE scan_id = ? AND safety = 'safe'
       ORDER BY size_bytes DESC, path ASC`,
    )
    .all(scanId);

  const items = rows.map((row) => mapScanItemRow(row, project));
  return largestScanItems(
    items.filter((item) => item.classification === "safe" && item.canAutoClean),
    items.length,
  );
}

function mapScanItemRow(row: ScanItemRow, project: Project): ScanItem {
  const metadata = JSON.parse(row.metadata_json) as {
    absolutePath?: string;
    ruleId?: string;
    canAutoClean?: boolean;
  };
  const relativePath = normalizeRelativePath(row.path);

  return {
    path: relativePath,
    absolutePath: safeProjectPath(project.path, relativePath),
    classification: "safe",
    kind: row.kind,
    sizeBytes: row.size_bytes,
    reason: row.reason ?? "Safe generated cleanup candidate.",
    ruleId: metadata.ruleId ?? "persisted-scan-item",
    canAutoClean: metadata.canAutoClean === true,
  };
}

async function verifySafeGeneratedItem(
  project: Project,
  item: ScanItem,
): Promise<{ ok: true; absolutePath: string; isDirectory: boolean } | { ok: false; warning: string }> {
  const absolutePath = safeProjectPath(project.path, item.path);
  if (item.path === ".") {
    return { ok: false, warning: "Skipped project root cleanup candidate." };
  }

  let stat;
  try {
    stat = await lstat(absolutePath);
  } catch (error) {
    return { ok: false, warning: `Skipped missing cleanup candidate ${item.path}: ${errorMessage(error)}` };
  }

  const classification = classifyCleanupPath({
    relativePath: item.path,
    isDirectory: stat.isDirectory(),
    runtimes: project.runtimes.map((runtime) => runtime as RuntimeFamily),
  });

  if (classification.classification !== "safe" || !classification.canAutoClean) {
    return { ok: false, warning: `Skipped non-safe cleanup candidate ${item.path}.` };
  }

  return { ok: true, absolutePath, isDirectory: stat.isDirectory() };
}

function safeProjectPath(projectPath: string, relativePath: string): string {
  const absoluteProjectPath = path.resolve(projectPath);
  const absolutePath = path.resolve(absoluteProjectPath, relativePath);
  const relativeToProject = path.relative(absoluteProjectPath, absolutePath);

  if (relativeToProject === "" || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
    throw new Error(`Cleanup path escapes project: ${relativePath}`);
  }

  return absolutePath;
}

function sumBytes(items: ScanItem[]): number {
  return items.reduce((sum, item) => sum + item.sizeBytes, 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
