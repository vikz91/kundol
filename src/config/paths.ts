import { join } from "node:path";
import { getHomeDirectory } from "../platform/home";

export const kundolDirectoryName = ".kundol";
export const kundolDatabaseFileName = "kundol.db";

export interface KundolPathOptions {
  homeDir?: string;
}

export function getKundolHomePath(options: KundolPathOptions = {}): string {
  return join(options.homeDir ?? getHomeDirectory(), kundolDirectoryName);
}

export function getDefaultDatabasePath(options: KundolPathOptions = {}): string {
  return join(getKundolHomePath(options), kundolDatabaseFileName);
}
