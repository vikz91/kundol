import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getDefaultDatabasePath } from "../config/paths";
import type { Clock } from "../platform/clock";
import { systemClock } from "../platform/clock";
import { runMigrations } from "./migrations";

export interface OpenDatabaseOptions {
  databasePath?: string;
  homeDir?: string;
  readonly?: boolean;
  migrate?: boolean;
  clock?: Clock;
}

export interface KundolDatabase {
  path: string;
  db: Database;
  close(): void;
}

export function resolveDatabasePath(options: OpenDatabaseOptions = {}): string {
  if (options.databasePath) {
    return options.databasePath;
  }
  return options.homeDir ? getDefaultDatabasePath({ homeDir: options.homeDir }) : getDefaultDatabasePath();
}

export function openKundolDatabase(options: OpenDatabaseOptions = {}): KundolDatabase {
  const databasePath = resolveDatabasePath(options);
  const isMemoryDatabase = databasePath === ":memory:";

  if (!isMemoryDatabase && !options.readonly) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath, {
    readonly: options.readonly ?? false,
    create: !(options.readonly ?? false),
  });

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  if (!isMemoryDatabase) {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  if (options.migrate !== false && !options.readonly) {
    runMigrations(db, options.clock ?? systemClock);
  }

  return {
    path: databasePath,
    db,
    close: () => db.close(),
  };
}
