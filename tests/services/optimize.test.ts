import { describe, expect, test } from "bun:test";
import type { Project } from "../../src/db/repositories";
import { previewStorageOptimization } from "../../src/services/optimize";

describe("storage optimizer", () => {
  test("selects inactive project cleanup and keeps active project cleanup review-only", async () => {
    const preview = await previewStorageOptimization([
      project({ id: "stale", name: "stale-api", status: "STALE", cleanableBytes: 1024 }),
      project({ id: "active", name: "active-api", status: "ACTIVE", cleanableBytes: 2048 }),
      project({ id: "empty", name: "empty-api", status: "STALE", cleanableBytes: 0 }),
    ]);

    const stale = preview.candidates.find((candidate) => candidate.id === "project:stale");
    const active = preview.candidates.find((candidate) => candidate.id === "project:active");

    expect(stale?.safety).toBe("safe");
    expect(stale?.defaultSelected).toBe(true);
    expect(active?.safety).toBe("review");
    expect(active?.defaultSelected).toBe(false);
    expect(preview.knownReclaimableBytes).toBe(1024);
  });

  test("marks macOS temp and docker volumes outside one-click apply", async () => {
    const preview = await previewStorageOptimization([]);

    expect(preview.candidates.find((candidate) => candidate.id === "review:tmp")?.safety).toBe("review");
    expect(preview.candidates.find((candidate) => candidate.id === "protected:docker-volumes")?.safety).toBe("protected");
  });
});

function project(overrides: Partial<Project>): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "project",
    path: overrides.path ?? `/tmp/${overrides.name ?? "project"}`,
    primaryRuntime: overrides.primaryRuntime ?? "node",
    runtimes: overrides.runtimes ?? ["node"],
    status: overrides.status ?? "NEW",
    sizeBytes: overrides.sizeBytes ?? 0,
    cleanableBytes: overrides.cleanableBytes ?? 0,
    gitRemoteUrl: overrides.gitRemoteUrl ?? null,
    gitBranch: overrides.gitBranch ?? null,
    gitDirty: overrides.gitDirty ?? false,
    notes: overrides.notes ?? null,
    lastIndexedAt: overrides.lastIndexedAt ?? null,
    lastScannedAt: overrides.lastScannedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-06-15T10:42:24.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-15T10:42:24.000Z",
  };
}
