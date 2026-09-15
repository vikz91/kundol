import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface ActionLogEntry {
  id: string;
  actionType: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface ActionRow {
  id: string;
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
    actionType: string;
    status?: string;
    details?: Record<string, unknown>;
  }): void {
    this.db
      .query(
        `INSERT INTO actions (id, action_type, status, details_json, created_at)
         VALUES ($id, $actionType, $status, $detailsJson, $createdAt)`,
      )
      .run({
        $id: randomUUID(),
        $actionType: input.actionType,
        $status: input.status ?? "completed",
        $detailsJson: JSON.stringify(input.details ?? {}),
        $createdAt: toIsoDateTime(this.clock.now()),
      });
  }

  list(limit = 100): ActionLogEntry[] {
    return this.db
      .query<ActionRow, [number]>("SELECT id, action_type, status, details_json, created_at FROM actions ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => ({
        id: row.id,
        actionType: row.action_type,
        status: row.status,
        details: JSON.parse(row.details_json) as Record<string, unknown>,
        createdAt: row.created_at,
      }));
  }
}
