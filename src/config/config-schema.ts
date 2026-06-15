import type { ExcludedPath } from "../db/repositories/excluded-path-repository";
import type { Workspace } from "../db/repositories/workspace-repository";

export interface KundolConfig {
  databasePath: string;
  initialized: boolean;
  workspaces: Workspace[];
  excludedPaths: ExcludedPath[];
  settings: Record<string, unknown>;
}

export interface SaveKundolConfigInput {
  workspaces?: Array<{ path: string; enabled?: boolean }>;
  excludedPaths?: Array<{ path: string; reason?: string | null }>;
  settings?: Record<string, unknown>;
}
