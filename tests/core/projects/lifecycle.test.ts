import { describe, expect, test } from "bun:test";
import { inferLifecycleStatus } from "../../../src/core/projects";

const now = new Date("2026-06-15T10:30:00.000Z");

describe("lifecycle status inference", () => {
  test("keeps missing and archived projects conservative", () => {
    expect(inferLifecycleStatus({ now, exists: false })).toBe("DELETED");
    expect(inferLifecycleStatus({ now, previousStatus: "ARCHIVED", exists: true })).toBe("ARCHIVED");
    expect(inferLifecycleStatus({ now, archived: true, exists: true })).toBe("ARCHIVED");
  });

  test("classifies new, active, paused, and stale projects by conservative age thresholds", () => {
    expect(inferLifecycleStatus({ now, firstSeenAt: "2026-06-10T10:30:00.000Z", exists: true })).toBe("NEW");
    expect(
      inferLifecycleStatus({
        now,
        firstSeenAt: "2026-01-01T10:30:00.000Z",
        lastModifiedAt: "2026-06-01T10:30:00.000Z",
        previousStatus: "ACTIVE",
        exists: true,
      }),
    ).toBe("ACTIVE");
    expect(
      inferLifecycleStatus({
        now,
        firstSeenAt: "2026-01-01T10:30:00.000Z",
        lastModifiedAt: "2026-04-01T10:30:00.000Z",
        previousStatus: "ACTIVE",
        exists: true,
      }),
    ).toBe("PAUSED");
    expect(
      inferLifecycleStatus({
        now,
        firstSeenAt: "2026-01-01T10:30:00.000Z",
        lastModifiedAt: "2025-12-01T10:30:00.000Z",
        previousStatus: "PAUSED",
        exists: true,
      }),
    ).toBe("STALE");
  });
});
