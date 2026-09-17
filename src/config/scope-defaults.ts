import { openKundolDatabase, type OpenDatabaseOptions } from "../db/client";

export interface ScopeDefaults {
  workdir?: string;
  dockerContext?: string;
}

const keys = { workdir: "optimise.default_workdir", dockerContext: "optimise.default_docker_context" } as const;

export function readScopeDefaults(options: OpenDatabaseOptions): ScopeDefaults {
  const connection = openKundolDatabase(options);
  try {
    const defaults: ScopeDefaults = {};
    for (const field of ["workdir", "dockerContext"] as const) {
      const row = connection.db.query<{ value: string }, [string]>("SELECT value FROM settings WHERE key = ?").get(keys[field]);
      if (row) defaults[field] = row.value;
    }
    return defaults;
  } finally {
    connection.close();
  }
}

/** First-use writes do not replace a concurrently chosen default. */
export function saveScopeDefaults(options: OpenDatabaseOptions, values: ScopeDefaults, replace = false): ScopeDefaults {
  const connection = openKundolDatabase(options);
  try {
    return connection.db.transaction(() => {
      const saved: ScopeDefaults = {};
      const conflict = replace
        ? "DO UPDATE SET value = excluded.value, value_type = excluded.value_type, updated_at = excluded.updated_at"
        : "DO NOTHING";
      const statement = connection.db.query(`INSERT INTO settings (key, value, value_type, updated_at)
        VALUES (?, ?, 'string', ?) ON CONFLICT(key) ${conflict}`);
      for (const field of ["workdir", "dockerContext"] as const) {
        const value = values[field];
        if (value !== undefined && statement.run(keys[field], value, new Date().toISOString()).changes > 0) saved[field] = value;
      }
      return saved;
    })();
  } finally {
    connection.close();
  }
}
