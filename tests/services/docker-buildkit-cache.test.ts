import { describe, expect, test } from "bun:test";
import { parseBuildkitDu, type BuildkitBuilderIdentity } from "../../src/services/optimisation-registry/docker-buildkit-cache";

const builder: BuildkitBuilderIdentity = {
  dockerOwnerId: "docker:" + "a".repeat(64),
  builderName: "local-builder",
  driver: "docker-container",
  endpoint: "unix:///private/docker.sock",
  instanceId: "b".repeat(64),
};
const now = new Date("2026-09-15T00:00:00Z");
const old = "2026-09-01T00:00:00Z";
const recent = "2026-09-14T00:00:00Z";
const id = "abcdefghijklmnopqrstuvwx12";

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ID: id, Parents: [], CreatedAt: old, LastUsedAt: old,
    Reclaimable: true, Shared: false, Mutable: false,
    Size: "829889526", Description: "[stage 1/2] COPY . .", UsageCount: 1,
    Type: "regular", ...overrides,
  };
}

function capture(rows: readonly unknown[], truncated = false): { text: string; truncated: boolean } {
  return { text: rows.map((entry) => JSON.stringify(entry)).join("\n") + (rows.length ? "\n" : ""), truncated };
}

describe("pure bounded BuildKit du inventory", () => {
  test("uses explicit immutable builder provenance and full cache ID without a prune route", () => {
    const [target] = parseBuildkitDu({ captured: capture([row()]), builder, now });
    expect(target?.ownerId).toBe(builder.dockerOwnerId);
    expect(target?.resourceId).toMatch(/^buildkit-cache:[a-f0-9]{64}:[a-z0-9]{26}$/);
    expect(target?.sizeBytes).toBeNull();
    expect(target?.evidence?.join(" ")).toContain("829889526 private bytes");
    expect(parseBuildkitDu({ captured: capture([row()]), builder, now })[0]?.fingerprint).toBe(target?.fingerprint);
    expect(parseBuildkitDu({ captured: capture([row({ Size: "1" })]), builder, now })[0]?.fingerprint).not.toBe(target?.fingerprint);
    expect(parseBuildkitDu({ captured: capture([row()]), builder: { ...builder, instanceId: "c".repeat(64) }, now })[0]?.resourceId).not.toBe(target?.resourceId);
  });

  test("skips recent, active, mutable, shared, internal, and cache-mount records", () => {
    const cases = [
      { LastUsedAt: recent }, { Reclaimable: false }, { Mutable: true },
      { Shared: true }, { Type: "internal" }, { Type: "frontend" },
      { Type: "exec.cachemount" },
    ];
    for (const changed of cases) {
      expect(parseBuildkitDu({ captured: capture([row(changed)]), builder, now })).toEqual([]);
    }
  });

  test("fails closed on truncated/malformed JSON, duplicate IDs, missing state, and bad builder identity", () => {
    expect(() => parseBuildkitDu({ captured: capture([row()], true), builder, now })).toThrow("truncated");
    expect(() => parseBuildkitDu({ captured: { text: "{broken", truncated: false }, builder, now })).toThrow();
    expect(() => parseBuildkitDu({ captured: capture([row(), row()]), builder, now })).toThrow("unique full opaque");
    expect(() => parseBuildkitDu({ captured: capture([row({ Size: "1e9" })]), builder, now })).toThrow("exact byte count");
    expect(() => parseBuildkitDu({ captured: capture([row({ Reclaimable: null })]), builder, now })).toThrow("incomplete");
    expect(() => parseBuildkitDu({ captured: capture([row({ LastUsedAt: "bad-date" })]), builder, now })).toThrow("timestamps");
    expect(() => parseBuildkitDu({ captured: capture([row()]), builder: { ...builder, instanceId: "short" }, now })).toThrow("identity");
  });

  test("sanitizes Dockerfile-controlled descriptions and rejects unsafe age policy", () => {
    const [target] = parseBuildkitDu({ captured: capture([row({ Description: "secret\u001b[31m\u202eTAIL" })]), builder, now });
    expect(target?.evidence?.join(" ")).not.toContain("\u001b");
    expect(target?.evidence?.join(" ")).not.toContain("\u202e");
    expect(() => parseBuildkitDu({ captured: capture([row()]), builder, now, minimumAgeHours: 1 })).toThrow("policy");
  });
});
