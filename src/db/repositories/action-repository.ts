import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface ActionLogEntry {
  id: string;
  projectId: string | null;
  actionType: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface ActionRow {
  id: string;
  project_id: string | null;
  action_type: string;
  status: string;
  details_json: string;
  created_at: string;
}

export class ActionRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  record(input: {
    projectId?: string | null;
    actionType: string;
    status?: string;
    details?: Record<string, unknown>;
  }): ActionLogEntry {
    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO actions (id, project_id, action_type, status, details_json, created_at)
         VALUES ($id, $projectId, $actionType, $status, $detailsJson, $createdAt)`,
      )
      .run({
        $id: id,
        $projectId: input.projectId ?? null,
        $actionType: input.actionType,
        $status: input.status ?? "completed",
        $detailsJson: JSON.stringify(input.details ?? {}),
        $createdAt: toIsoDateTime(this.clock.now()),
      });
    return this.findById(id)!;
  }

  findById(id: string): ActionLogEntry | null {
    const row = this.db.query<ActionRow, [string]>("SELECT * FROM actions WHERE id = ?").get(id);
    return row ? mapAction(row) : null;
  }

  list(limit = 100): ActionLogEntry[] {
    return this.db
      .query<ActionRow, [number]>("SELECT * FROM actions ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map(mapAction);
  }
}

function mapAction(row: ActionRow): ActionLogEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    actionType: row.action_type,
    status: row.status,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}
