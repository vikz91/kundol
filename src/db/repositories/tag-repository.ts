import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

export class TagRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  upsert(name: string): Tag {
    const normalized = normalizeTagName(name);
    const existing = this.findByName(normalized);
    if (existing) return existing;

    const id = randomUUID();
    this.db
      .query("INSERT INTO tags (id, name, created_at) VALUES ($id, $name, $createdAt)")
      .run({
        $id: id,
        $name: normalized,
        $createdAt: toIsoDateTime(this.clock.now()),
      });
    return this.findById(id)!;
  }

  findById(id: string): Tag | null {
    const row = this.db.query<TagRow, [string]>("SELECT * FROM tags WHERE id = ?").get(id);
    return row ? mapTag(row) : null;
  }

  findByName(name: string): Tag | null {
    const row = this.db.query<TagRow, [string]>("SELECT * FROM tags WHERE name = ?").get(normalizeTagName(name));
    return row ? mapTag(row) : null;
  }

  list(): Tag[] {
    return this.db.query<TagRow, []>("SELECT * FROM tags ORDER BY name").all().map(mapTag);
  }

  addToProject(projectId: string, tagName: string): void {
    const tag = this.upsert(tagName);
    this.db
      .query(
        `INSERT OR IGNORE INTO project_tags (project_id, tag_id, created_at)
         VALUES ($projectId, $tagId, $createdAt)`,
      )
      .run({
        $projectId: projectId,
        $tagId: tag.id,
        $createdAt: toIsoDateTime(this.clock.now()),
      });
  }

  removeFromProject(projectId: string, tagName: string): boolean {
    const tag = this.findByName(tagName);
    if (!tag) return false;
    const result = this.db
      .query("DELETE FROM project_tags WHERE project_id = $projectId AND tag_id = $tagId")
      .run({ $projectId: projectId, $tagId: tag.id });
    return result.changes > 0;
  }

  listForProject(projectId: string): Tag[] {
    return this.db
      .query<TagRow, [string]>(
        `SELECT tags.*
         FROM tags
         INNER JOIN project_tags ON project_tags.tag_id = tags.id
         WHERE project_tags.project_id = ?
         ORDER BY tags.name`,
      )
      .all(projectId)
      .map(mapTag);
  }

  listProjectIdsByTag(tagName: string): string[] {
    const tag = this.findByName(tagName);
    if (!tag) return [];
    return this.db
      .query<{ project_id: string }, [string]>("SELECT project_id FROM project_tags WHERE tag_id = ? ORDER BY project_id")
      .all(tag.id)
      .map((row) => row.project_id);
  }
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}
