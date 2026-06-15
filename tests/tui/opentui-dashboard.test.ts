import { describe, expect, test } from "bun:test";
import type { Project } from "../../src/db/repositories/project-repository";
import { buildOpenTuiDashboardModel, filterOpenTuiProjects } from "../../src/tui/opentui-dashboard";

describe("OpenTUI dashboard model", () => {
  test("summarizes registry projects for terminal rendering", () => {
    const model = buildOpenTuiDashboardModel([
      project({ name: "api", status: "ACTIVE", sizeBytes: 2048, cleanableBytes: 512, primaryRuntime: "bun" }),
      project({ name: "old-demo", status: "STALE", sizeBytes: 4096, cleanableBytes: 1024, primaryRuntime: "python" }),
      project({ name: "tiny", status: "ACTIVE", sizeBytes: 10, cleanableBytes: 0, primaryRuntime: null }),
    ]);

    expect(model.projectCount).toBe(3);
    expect(model.statusCounts).toEqual({ ACTIVE: 2, STALE: 1 });
    expect(model.totalSizeBytes).toBe(6154);
    expect(model.cleanableBytes).toBe(1536);
    expect(model.topProjects.map((project) => project.name)).toEqual(["old-demo", "api", "tiny"]);
  });

  test("falls back to runtime markers when primary runtime is missing", () => {
    const model = buildOpenTuiDashboardModel([
      project({ name: "legacy", primaryRuntime: null, runtimes: ["bun"], sizeBytes: 1 }),
    ]);

    expect(model.topProjects[0]?.runtime).toBe("bun");
  });

  test("tracks first-run setup state separately from empty project state", () => {
    const model = buildOpenTuiDashboardModel([], {
      initialized: false,
      workspaceCount: 0,
      archiveBeforeCleanDays: 21,
      archiveRoot: "/tmp/kundol-archives",
    });

    expect(model.initialized).toBe(false);
    expect(model.workspaceCount).toBe(0);
    expect(model.projectCount).toBe(0);
    expect(model.archiveBeforeCleanDays).toBe(21);
    expect(model.archiveRoot).toBe("/tmp/kundol-archives");
    expect(model.topProjects).toEqual([]);
  });

  test("filters dashboard project list by search and scanned-only state", () => {
    const projects = [
      project({ id: "api", name: "api-server", path: "/tmp/api-server", notes: "orders backend", lastScannedAt: "2026-06-15T10:00:00.000Z" }),
      project({ id: "scratch", name: "api-scratch", path: "/tmp/api-scratch", notes: "temporary api idea" }),
      project({ id: "site", name: "marketing-site", path: "/tmp/site", primaryRuntime: "python", runtimes: ["python"] }),
    ];

    const result = filterOpenTuiProjects(projects, { search: "api", scannedOnly: true });

    expect(result.map((item) => item.id)).toEqual(["api"]);
  });

  test("sorts dashboard project list by cleanable bytes", () => {
    const projects = [
      project({ id: "tiny", name: "tiny", cleanableBytes: 1 }),
      project({ id: "large", name: "large", cleanableBytes: 100 }),
      project({ id: "medium", name: "medium", cleanableBytes: 50 }),
    ];

    const result = filterOpenTuiProjects(projects, { sortMode: "cleanable" });

    expect(result.map((item) => item.id)).toEqual(["large", "medium", "tiny"]);
  });
});

function project(overrides: Partial<Project>): Project {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "project",
    path: overrides.path ?? `/tmp/${overrides.name ?? "project"}`,
    primaryRuntime: "primaryRuntime" in overrides ? overrides.primaryRuntime! : "node",
    runtimes: overrides.runtimes ?? [],
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
