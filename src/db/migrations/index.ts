import type { Database } from "bun:sqlite";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_persistence_and_config_schema",
    up: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        value_type TEXT NOT NULL DEFAULT 'string',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS excluded_paths (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        primary_runtime TEXT,
        runtimes_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'NEW',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        cleanable_bytes INTEGER NOT NULL DEFAULT 0,
        git_remote_url TEXT,
        git_branch TEXT,
        git_dirty INTEGER NOT NULL DEFAULT 0 CHECK (git_dirty IN (0, 1)),
        notes TEXT,
        last_indexed_at TEXT,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_primary_runtime ON projects(primary_runtime);
      CREATE INDEX IF NOT EXISTS idx_projects_last_indexed_at ON projects(last_indexed_at);

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_tags (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS project_scans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scanned_at TEXT NOT NULL,
        total_size_bytes INTEGER NOT NULL DEFAULT 0,
        cleanable_bytes INTEGER NOT NULL DEFAULT 0,
        item_count INTEGER NOT NULL DEFAULT 0,
        recommendation_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        details_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_project_scans_project_id ON project_scans(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_scans_scanned_at ON project_scans(scanned_at);

      CREATE TABLE IF NOT EXISTS scan_items (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES project_scans(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        safety TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scan_items_scan_id ON scan_items(scan_id);
      CREATE INDEX IF NOT EXISTS idx_scan_items_project_id ON scan_items(project_id);
      CREATE INDEX IF NOT EXISTS idx_scan_items_safety ON scan_items(safety);

      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_actions_project_id ON actions(project_id);
      CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);
      CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);
    `,
  },
];

export function runMigrations(db: Database, clock: Clock): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .query<{ version: number }, []>("SELECT version FROM schema_migrations")
    .all();
  const appliedVersions = new Set(appliedRows.map((row) => row.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    db.exec("BEGIN");
    try {
      db.exec(migration.up);
      db.query(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($version, $name, $appliedAt)",
      ).run({
        $version: migration.version,
        $name: migration.name,
        $appliedAt: toIsoDateTime(clock.now()),
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
