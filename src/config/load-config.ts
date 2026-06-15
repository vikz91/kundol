import type { Clock } from "../platform/clock";
import { systemClock } from "../platform/clock";
import { openKundolDatabase } from "../db/client";
import { ExcludedPathRepository } from "../db/repositories/excluded-path-repository";
import { SettingsRepository } from "../db/repositories/settings-repository";
import { WorkspaceRepository } from "../db/repositories/workspace-repository";
import type { KundolConfig } from "./config-schema";

export interface LoadConfigOptions {
  databasePath?: string;
  homeDir?: string;
  clock?: Clock;
}

export function loadKundolConfig(options: LoadConfigOptions = {}): KundolConfig {
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

    return {
      databasePath: connection.path,
      initialized: workspaces.list({ includeDisabled: true }).length > 0,
      workspaces: workspaces.list({ includeDisabled: true }),
      excludedPaths: excludedPaths.list(),
      settings: Object.fromEntries(settings.list().map((setting) => [setting.key, setting.value])),
    };
  } finally {
    connection.close();
  }
}
