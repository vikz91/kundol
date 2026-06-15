export const archiveBeforeCleanDaysKey = "archive.beforeCleanDays";
export const defaultArchiveBeforeCleanDays = 15;

export interface TypedKundolSettings {
  archiveBeforeCleanDays: number;
}

export function parseArchiveBeforeCleanDays(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultArchiveBeforeCleanDays;
  return Math.floor(parsed);
}

export function readTypedSettings(settings: Record<string, unknown>): TypedKundolSettings {
  return {
    archiveBeforeCleanDays: parseArchiveBeforeCleanDays(settings[archiveBeforeCleanDaysKey]),
  };
}
