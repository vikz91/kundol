import type { Database } from "bun:sqlite";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";

export type SettingValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export interface Setting {
  key: string;
  value: SettingValue;
  valueType: string;
  updatedAt: string;
}

interface SettingRow {
  key: string;
  value: string;
  value_type: string;
  updated_at: string;
}

export class SettingsRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  get(key: string): Setting | null {
    const row = this.db.query<SettingRow, [string]>("SELECT * FROM settings WHERE key = ?").get(key);
    return row ? mapSetting(row) : null;
  }

  getValue<T extends SettingValue>(key: string, fallback: T): T {
    const setting = this.get(key);
    return setting ? (setting.value as T) : fallback;
  }

  set(key: string, value: SettingValue): Setting {
    const serialized = serializeSetting(value);
    this.db
      .query(
        `INSERT INTO settings (key, value, value_type, updated_at)
         VALUES ($key, $value, $valueType, $updatedAt)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           value_type = excluded.value_type,
           updated_at = excluded.updated_at`,
      )
      .run({
        $key: key,
        $value: serialized.value,
        $valueType: serialized.valueType,
        $updatedAt: toIsoDateTime(this.clock.now()),
      });
    return this.get(key)!;
  }

  list(): Setting[] {
    return this.db.query<SettingRow, []>("SELECT * FROM settings ORDER BY key").all().map(mapSetting);
  }
}

function serializeSetting(value: SettingValue): { value: string; valueType: string } {
  if (value === null) {
    return { value: "null", valueType: "null" };
  }
  if (Array.isArray(value)) {
    return { value: JSON.stringify(value), valueType: "json" };
  }
  if (typeof value === "object") {
    return { value: JSON.stringify(value), valueType: "json" };
  }
  return { value: String(value), valueType: typeof value };
}

function mapSetting(row: SettingRow): Setting {
  return {
    key: row.key,
    value: deserializeSetting(row.value, row.value_type),
    valueType: row.value_type,
    updatedAt: row.updated_at,
  };
}

function deserializeSetting(value: string, valueType: string): SettingValue {
  switch (valueType) {
    case "boolean":
      return value === "true";
    case "number":
      return Number(value);
    case "json":
      return JSON.parse(value) as SettingValue;
    case "null":
      return null;
    default:
      return value;
  }
}
