import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openKundolDatabase } from "../../src/db";
import type { Project } from "../../src/db/repositories";
import { applyStorageOptimization, previewStorageOptimization, type OptimizePreview } from "../../src/services/optimize";

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
    expect(preview.knownReclaimableBytes).toBeGreaterThanOrEqual(1024);
  });

  test("selects old temp entries and keeps docker volumes protected", async () => {
    const oldTemp = await mkdtemp(path.join(tmpdir(), "000-kundol-old-temp-"));
    const oldDate = new Date(Date.now() - 10 * 86_400_000);
    await mkdir(path.join(oldTemp, "cache"), { recursive: true });
    await utimes(oldTemp, oldDate, oldDate);
    try {
      const preview = await previewStorageOptimization([]);

      const tempCandidate = preview.candidates.find((candidate) => candidate.kind === "filesystem" && candidate.path === oldTemp);
      expect(tempCandidate?.safety).toBe("safe");
      expect(tempCandidate?.defaultSelected).toBe(true);
      expect(preview.candidates.find((candidate) => candidate.id === "protected:docker-volumes")?.safety).toBe("protected");
    } finally {
      await rm(oldTemp, { recursive: true, force: true });
    }
  });

  test("apply returns an explicit failure summary for commands that fail", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kundol-optimize-"));
    const connection = openKundolDatabase({ homeDir });
    const preview: OptimizePreview = {
      candidates: [
        {
          id: "command:failing",
          kind: "command",
          category: "Package caches",
          label: "failing command",
          detail: "Intentional failure",
          command: "definitely-not-a-real-command",
          safety: "safe",
          defaultSelected: true,
          sizeBytes: null,
          run: ["definitely-not-a-real-command"],
        },
      ],
      safeSelectedCount: 1,
      reviewCount: 0,
      protectedCount: 0,
      knownReclaimableBytes: 0,
    };

    try {
      const result = await applyStorageOptimization(connection.db, preview);

      expect(result.applied).toEqual([]);
      expect(result.failed[0]?.candidate.label).toBe("failing command");
      expect(result.failed[0]?.error).toContain("definitely-not-a-real-command");
    } finally {
      connection.close();
    }
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
