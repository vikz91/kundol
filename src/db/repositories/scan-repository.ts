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
