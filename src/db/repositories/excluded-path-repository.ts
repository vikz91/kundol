import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";
import { normalizeConfiguredPath } from "./workspace-repository";

export interface ExcludedPath {
  id: string;
  path: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExcludedPathRow {
  id: string;
  path: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export class ExcludedPathRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  list(): ExcludedPath[] {
    return this.db
      .query<ExcludedPathRow, []>("SELECT * FROM excluded_paths ORDER BY path")
      .all()
      .map(mapExcludedPath);
  }

  upsert(path: string, reason: string | null = null): ExcludedPath {
    const now = toIsoDateTime(this.clock.now());
    const normalizedPath = normalizeConfiguredPath(path);
    const existing = this.db
      .query<ExcludedPathRow, [string]>("SELECT * FROM excluded_paths WHERE path = ?")
      .get(normalizedPath);

    if (existing) {
      this.db
        .query("UPDATE excluded_paths SET reason = $reason, updated_at = $updatedAt WHERE id = $id")
        .run({ $reason: reason, $updatedAt: now, $id: existing.id });
      return this.findById(existing.id)!;
    }

    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO excluded_paths (id, path, reason, created_at, updated_at)
         VALUES ($id, $path, $reason, $createdAt, $updatedAt)`,
      )
      .run({
        $id: id,
        $path: normalizedPath,
        $reason: reason,
        $createdAt: now,
        $updatedAt: now,
      });
    return this.findById(id)!;
  }

  remove(path: string): boolean {
    const result = this.db
      .query("DELETE FROM excluded_paths WHERE path = ?")
      .run(normalizeConfiguredPath(path));
    return result.changes > 0;
  }

  findById(id: string): ExcludedPath | null {
    const row = this.db.query<ExcludedPathRow, [string]>("SELECT * FROM excluded_paths WHERE id = ?").get(id);
    return row ? mapExcludedPath(row) : null;
  }
}

function mapExcludedPath(row: ExcludedPathRow): ExcludedPath {
  return {
    id: row.id,
    path: row.path,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
