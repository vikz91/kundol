import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface Workspace {
  id: string;
  path: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceRow {
  id: string;
  path: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface UpsertWorkspaceInput {
  path: string;
  enabled?: boolean;
}

export function normalizeConfiguredPath(path: string): string {
  return resolve(path);
}

export class WorkspaceRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  list(options: { includeDisabled?: boolean } = {}): Workspace[] {
    const rows = options.includeDisabled
      ? this.db.query<WorkspaceRow, []>("SELECT * FROM workspaces ORDER BY path").all()
      : this.db.query<WorkspaceRow, []>("SELECT * FROM workspaces WHERE enabled = 1 ORDER BY path").all();
    return rows.map(mapWorkspace);
  }

  upsert(input: UpsertWorkspaceInput): Workspace {
    const now = toIsoDateTime(this.clock.now());
    const normalizedPath = normalizeConfiguredPath(input.path);
    const enabled = input.enabled ?? true;
    const existing = this.db
      .query<WorkspaceRow, [string]>("SELECT * FROM workspaces WHERE path = ?")
      .get(normalizedPath);

    if (existing) {
      this.db
        .query("UPDATE workspaces SET enabled = $enabled, updated_at = $updatedAt WHERE id = $id")
        .run({
          $enabled: enabled ? 1 : 0,
          $updatedAt: now,
          $id: existing.id,
        });
      return this.findById(existing.id)!;
    }

    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO workspaces (id, path, enabled, created_at, updated_at)
         VALUES ($id, $path, $enabled, $createdAt, $updatedAt)`,
      )
      .run({
        $id: id,
        $path: normalizedPath,
        $enabled: enabled ? 1 : 0,
        $createdAt: now,
        $updatedAt: now,
      });
    return this.findById(id)!;
  }

  setEnabled(path: string, enabled: boolean): boolean {
    const result = this.db
      .query("UPDATE workspaces SET enabled = $enabled, updated_at = $updatedAt WHERE path = $path")
      .run({
        $enabled: enabled ? 1 : 0,
        $updatedAt: toIsoDateTime(this.clock.now()),
        $path: normalizeConfiguredPath(path),
      });
    return result.changes > 0;
  }

  findById(id: string): Workspace | null {
    const row = this.db.query<WorkspaceRow, [string]>("SELECT * FROM workspaces WHERE id = ?").get(id);
    return row ? mapWorkspace(row) : null;
  }
}

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    path: row.path,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
