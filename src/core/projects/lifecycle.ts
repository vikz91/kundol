import type { LifecycleStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LifecycleThresholds {
  newDays: number;
  activeDays: number;
  pausedDays: number;
}

export const DEFAULT_LIFECYCLE_THRESHOLDS: LifecycleThresholds = {
  newDays: 14,
  activeDays: 30,
  pausedDays: 120,
};

export interface InferLifecycleStatusInput {
  now: Date;
  firstSeenAt?: Date | string | null;
  lastModifiedAt?: Date | string | null;
  previousStatus?: string | null;
  archived?: boolean;
  exists?: boolean;
  thresholds?: Partial<LifecycleThresholds>;
}

export function inferLifecycleStatus(input: InferLifecycleStatusInput): LifecycleStatus {
  if (input.exists === false) {
    return "DELETED";
  }

  if (input.archived || input.previousStatus === "ARCHIVED") {
    return "ARCHIVED";
  }

  const thresholds = {
    ...DEFAULT_LIFECYCLE_THRESHOLDS,
    ...input.thresholds,
  };
  const firstSeenAt = parseDate(input.firstSeenAt);
  const lastModifiedAt = parseDate(input.lastModifiedAt);

  if (!input.previousStatus || isWithinDays(input.now, firstSeenAt, thresholds.newDays)) {
    return "NEW";
  }

  if (isWithinDays(input.now, lastModifiedAt, thresholds.activeDays)) {
    return "ACTIVE";
  }

  if (isWithinDays(input.now, lastModifiedAt, thresholds.pausedDays)) {
    return "PAUSED";
  }

  return "STALE";
}

function isWithinDays(now: Date, value: Date | null, days: number): boolean {
  if (!value) {
    return false;
  }

  return now.getTime() - value.getTime() <= days * DAY_MS;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
