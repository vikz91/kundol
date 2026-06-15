import type { Clock } from "../platform/clock";
import { systemClock } from "../platform/clock";
import { openKundolDatabase } from "../db/client";
import { ExcludedPathRepository } from "../db/repositories/excluded-path-repository";
import { SettingsRepository, type SettingValue } from "../db/repositories/settings-repository";
import { WorkspaceRepository } from "../db/repositories/workspace-repository";
import type { KundolConfig, SaveKundolConfigInput } from "./config-schema";
import { loadKundolConfig } from "./load-config";

export interface SaveConfigOptions {
  databasePath?: string;
  homeDir?: string;
  clock?: Clock;
}

export function saveKundolConfig(
  input: SaveKundolConfigInput,
  options: SaveConfigOptions = {},
): KundolConfig {
  const clock = options.clock ?? systemClock;
  const connection = openKundolDatabase({
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    clock,
  });

  try {
    const settings = new SettingsRepository(connection.db, clock);
    const workspaces = new WorkspaceRepository(connection.db, clock);
    const excludedPaths = new ExcludedPathRepository(connection.db, clock);

    for (const workspace of input.workspaces ?? []) {
      workspaces.upsert(workspace);
    }

    for (const excludedPath of input.excludedPaths ?? []) {
      excludedPaths.upsert(excludedPath.path, excludedPath.reason ?? null);
    }

    for (const [key, value] of Object.entries(input.settings ?? {})) {
      settings.set(key, value as SettingValue);
    }
  } finally {
    connection.close();
  }

  return loadKundolConfig(options);
}
