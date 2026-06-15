import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface CreateProjectScanInput {
  projectId: string;
  totalSizeBytes?: number;
  cleanableBytes?: number;
  itemCount?: number;
  recommendationCount?: number;
  status?: string;
  details?: Record<string, unknown>;
}

export interface ProjectScan {
  id: string;
  projectId: string;
  scannedAt: string;
  totalSizeBytes: number;
  cleanableBytes: number;
  itemCount: number;
  recommendationCount: number;
  status: string;
  details: Record<string, unknown>;
}

export interface ScanItemRecord {
  id: string;
  scanId: string;
  projectId: string;
  path: string;
  kind: string;
  safety: string;
  sizeBytes: number;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ProjectScanRow {
  id: string;
  project_id: string;
  scanned_at: string;
  total_size_bytes: number;
  cleanable_bytes: number;
  item_count: number;
  recommendation_count: number;
  status: string;
  details_json: string;
}

interface ScanItemRow {
  id: string;
  scan_id: string;
  project_id: string;
  path: string;
  kind: string;
  safety: string;
  size_bytes: number;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

export class ScanRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  create(input: CreateProjectScanInput): ProjectScan {
    const id = randomUUID();
    const scannedAt = toIsoDateTime(this.clock.now());
    this.db
      .query(
        `INSERT INTO project_scans (
          id, project_id, scanned_at, total_size_bytes, cleanable_bytes,
          item_count, recommendation_count, status, details_json
        ) VALUES (
          $id, $projectId, $scannedAt, $totalSizeBytes, $cleanableBytes,
          $itemCount, $recommendationCount, $status, $detailsJson
        )`,
      )
      .run({
        $id: id,
        $projectId: input.projectId,
        $scannedAt: scannedAt,
        $totalSizeBytes: input.totalSizeBytes ?? 0,
        $cleanableBytes: input.cleanableBytes ?? 0,
        $itemCount: input.itemCount ?? 0,
        $recommendationCount: input.recommendationCount ?? 0,
        $status: input.status ?? "completed",
        $detailsJson: JSON.stringify(input.details ?? {}),
      });

    this.db
      .query(
        `UPDATE projects
         SET last_scanned_at = $lastScannedAt,
             cleanable_bytes = $cleanableBytes,
             updated_at = $updatedAt
         WHERE id = $projectId`,
      )
      .run({
        $lastScannedAt: scannedAt,
        $cleanableBytes: input.cleanableBytes ?? 0,
        $updatedAt: scannedAt,
        $projectId: input.projectId,
      });

    return this.findById(id)!;
  }

  findById(id: string): ProjectScan | null {
    const row = this.db.query<ProjectScanRow, [string]>("SELECT * FROM project_scans WHERE id = ?").get(id);
    return row ? mapProjectScan(row) : null;
  }

  findLatestForProject(projectId: string): ProjectScan | null {
    const row = this.db
      .query<ProjectScanRow, [string]>(
        "SELECT * FROM project_scans WHERE project_id = ? ORDER BY scanned_at DESC LIMIT 1",
      )
      .get(projectId);
    return row ? mapProjectScan(row) : null;
  }

  createItem(input: {
    scanId: string;
    projectId: string;
    path: string;
    kind: string;
    safety: string;
    sizeBytes?: number;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): ScanItemRecord {
    const id = randomUUID();
    const createdAt = toIsoDateTime(this.clock.now());
    this.db
      .query(
        `INSERT INTO scan_items (
          id, scan_id, project_id, path, kind, safety, size_bytes, reason, metadata_json, created_at
        ) VALUES (
          $id, $scanId, $projectId, $path, $kind, $safety, $sizeBytes, $reason, $metadataJson, $createdAt
        )`,
      )
      .run({
        $id: id,
        $scanId: input.scanId,
        $projectId: input.projectId,
        $path: input.path,
        $kind: input.kind,
        $safety: input.safety,
        $sizeBytes: input.sizeBytes ?? 0,
        $reason: input.reason ?? null,
        $metadataJson: JSON.stringify(input.metadata ?? {}),
        $createdAt: createdAt,
      });
    return this.findItemById(id)!;
  }

  listItemsForScan(scanId: string): ScanItemRecord[] {
    return this.db
      .query<ScanItemRow, [string]>("SELECT * FROM scan_items WHERE scan_id = ? ORDER BY size_bytes DESC, path ASC")
      .all(scanId)
      .map(mapScanItem);
  }

  findItemById(id: string): ScanItemRecord | null {
    const row = this.db.query<ScanItemRow, [string]>("SELECT * FROM scan_items WHERE id = ?").get(id);
    return row ? mapScanItem(row) : null;
  }
}

function mapProjectScan(row: ProjectScanRow): ProjectScan {
  return {
    id: row.id,
    projectId: row.project_id,
    scannedAt: row.scanned_at,
    totalSizeBytes: row.total_size_bytes,
    cleanableBytes: row.cleanable_bytes,
    itemCount: row.item_count,
    recommendationCount: row.recommendation_count,
    status: row.status,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
  };
}

function mapScanItem(row: ScanItemRow): ScanItemRecord {
  return {
    id: row.id,
    scanId: row.scan_id,
    projectId: row.project_id,
    path: row.path,
    kind: row.kind,
    safety: row.safety,
    sizeBytes: row.size_bytes,
    reason: row.reason,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}
