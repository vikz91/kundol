import type { Database } from "bun:sqlite";
import path from "node:path";
import { analyzeProjectCleanup } from "../../core/analysis/analyzer";
import type { ScanItem, ScanSummary } from "../../core/analysis/cleanable-item";
import type { Recommendation } from "../../core/recommendations/recommendation";
import type { RuntimeFamily } from "../../core/safety/types";
import type { ActionLogEntry, ActionRepository, Project, ProjectRepository, ProjectScan, ScanRepository } from "../../db/repositories";

export interface ScanCleanRepositories {
  db: Database;
  projects: ProjectRepository;
  scans: ScanRepository;
  actions: ActionRepository;
}

export interface ScanProjectServiceInput {
  target: string;
  largestLimit?: number;
}

export interface ScanProjectServiceResult {
  project: Project;
  scan: ProjectScan;
  summary: ScanSummary;
  items: ScanItem[];
  recommendations: Recommendation[];
  largestItems: ScanItem[];
  warnings: string[];
  action: ActionLogEntry;
}

export async function scanProjectService(
  input: ScanProjectServiceInput,
  repositories: ScanCleanRepositories,
): Promise<ScanProjectServiceResult> {
  const project = resolveProject(input.target, repositories.projects);
  if (!project) {
    throw new Error(`Project not found: ${input.target}`);
  }

  const analysisInput = {
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    runtimes: toRuntimeFamilies(project.runtimes),
    status: project.status,
    ...(input.largestLimit === undefined ? {} : { largestLimit: input.largestLimit }),
  };
  const analysis = await analyzeProjectCleanup(analysisInput);

  repositories.db.exec("BEGIN");
  try {
    const scan = repositories.scans.create({
      projectId: project.id,
      totalSizeBytes: analysis.summary.totalSizeBytes,
      cleanableBytes: analysis.summary.safeCleanupBytes,
      itemCount: analysis.items.length,
      recommendationCount: analysis.recommendations.length,
      details: {
        summary: analysis.summary,
        largestItems: analysis.largestItems.map(serializeScanItem),
        recommendations: analysis.recommendations,
        warnings: analysis.warnings,
      },
    });

    persistScanItems(repositories.db, scan.id, project.id, analysis.items, scan.scannedAt);

    const action = repositories.actions.record({
      projectId: project.id,
      actionType: "PROJECT_SCAN",
      details: {
        scanId: scan.id,
        totalSizeBytes: analysis.summary.totalSizeBytes,
        cleanableBytes: analysis.summary.safeCleanupBytes,
        itemCount: analysis.items.length,
        recommendationCount: analysis.recommendations.length,
      },
    });

    repositories.db.exec("COMMIT");

    return {
      project: repositories.projects.findById(project.id) ?? project,
      scan,
      summary: analysis.summary,
      items: analysis.items,
      recommendations: analysis.recommendations,
      largestItems: analysis.largestItems,
      warnings: analysis.warnings,
      action,
    };
  } catch (error) {
    repositories.db.exec("ROLLBACK");
    throw error;
  }
}

export function resolveProject(target: string, projects: ProjectRepository): Project | null {
  const byId = projects.findById(target);
  if (byId) return byId;

  if (looksLikePath(target)) {
    const pathTarget = path.isAbsolute(target) ? target : path.resolve(target);
    return projects.findByPath(pathTarget) ?? projects.findByPath(target);
  }

  const matches = projects.list().filter((project) => project.name === target);
  if (matches.length === 1) return matches[0] ?? null;
  if (matches.length > 1) {
    throw new Error(`Project name is ambiguous: ${target}`);
  }

  return projects.findByPath(target);
}

export function persistScanItems(
  db: Database,
  scanId: string,
  projectId: string,
  items: ScanItem[],
  createdAt: string,
): void {
  const insert = db.query(
    `INSERT INTO scan_items (
      id, scan_id, project_id, path, kind, safety, size_bytes, reason, metadata_json, created_at
    ) VALUES (
      $id, $scanId, $projectId, $path, $kind, $safety, $sizeBytes, $reason, $metadataJson, $createdAt
    )`,
  );

  for (const item of items) {
    insert.run({
      $id: crypto.randomUUID(),
      $scanId: scanId,
      $projectId: projectId,
      $path: item.path,
      $kind: item.kind,
      $safety: item.classification,
      $sizeBytes: item.sizeBytes,
      $reason: item.reason,
      $metadataJson: JSON.stringify({
        absolutePath: item.absolutePath,
        ruleId: item.ruleId,
        canAutoClean: item.canAutoClean,
      }),
      $createdAt: createdAt,
    });
  }
}

export function serializeScanItem(item: ScanItem): Record<string, unknown> {
  return {
    path: item.path,
    absolutePath: item.absolutePath,
    classification: item.classification,
    kind: item.kind,
    sizeBytes: item.sizeBytes,
    reason: item.reason,
    ruleId: item.ruleId,
    canAutoClean: item.canAutoClean,
  };
}

function toRuntimeFamilies(runtimes: string[]): RuntimeFamily[] {
  return runtimes.map((runtime) => runtime as RuntimeFamily);
}

function looksLikePath(target: string): boolean {
  return path.isAbsolute(target) || target.startsWith(".") || target.includes("/") || target.includes("\\");
}
