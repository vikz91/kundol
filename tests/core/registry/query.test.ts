import { describe, expect, test } from "bun:test";
import type { Project } from "../../../src/db/repositories";
import {
  formatBytes,
  formatDashboardSummary,
  formatProjectListTable,
  getDashboardSummary,
  listProjects,
  showProject,
  toRegistryProjectRow,
  toTuiProjectSummary,
  type ProjectListSource,
  type RegistryTagResolver,
} from "../../../src/core/registry";

const projects: Project[] = [
  project({
    id: "api",
    name: "api-server",
    path: "/tmp/work/api-server",
    primaryRuntime: "node",
    runtimes: ["node", "bun"],
    status: "ACTIVE",
    sizeBytes: 12 * 1024 * 1024,
    cleanableBytes: 4 * 1024 * 1024,
    gitRemoteUrl: "git@example.com:api.git",
    gitDirty: true,
    notes: "orders backend",
  }),
  project({
    id: "cli",
    name: "tools-cli",
    path: "/tmp/work/tools-cli",
    primaryRuntime: "go",
    runtimes: ["go"],
    status: "STALE",
    sizeBytes: 80 * 1024 * 1024,
    cleanableBytes: 30 * 1024 * 1024,
    lastScannedAt: "2026-06-14T10:00:00.000Z",
  }),
  project({
    id: "site",
    name: "marketing-site",
    path: "/tmp/work/marketing-site",
    primaryRuntime: "python",
    runtimes: ["python"],
    status: "PAUSED",
    sizeBytes: 2 * 1024,
    cleanableBytes: 0,
  }),
];

const source: ProjectListSource = {
  list: () => projects,
};

const tags: RegistryTagResolver = {
  findProjectIdsByTag(tag: string) {
    return tag === "work" ? ["api", "cli"] : [];
  },
  listTagsForProject(projectId: string) {
    return projectId === "site" ? ["website"] : [];
  },
};

describe("registry project queries", () => {
  test("filters by status, runtime, and search and sorts by size descending", () => {
    const result = listProjects(source, {
      status: "active",
      runtime: "bun",
      search: "orders",
      sort: "-size",
    });

    expect(result.projects.map((item) => item.id)).toEqual(["api"]);
    expect(result.sort).toEqual({ field: "size", direction: "desc" });
  });

  test("filters by tag when a resolver is available", () => {
    const result = listProjects(source, { tag: "work", sort: "name" , tags });

    expect(result.projects.map((item) => item.id)).toEqual(["api", "cli"]);
    expect(result.warnings).toEqual([]);
  });

  test("handles tag filtering conservatively when tags are not wired", () => {
    const result = listProjects(source, { tag: "work" });

    expect(result.projects).toEqual([]);
    expect(result.warnings.at(0)?.code).toBe("TAG_FILTER_UNAVAILABLE");
  });

  test("search can include tags through the resolver", () => {
    const result = listProjects(source, { search: "website", tags });

    expect(result.projects.map((item) => item.id)).toEqual(["site"]);
  });

  test("can search only scanned projects", () => {
    const result = listProjects(source, { scanned: true, search: "cli" });

    expect(result.projects.map((item) => item.id)).toEqual(["cli"]);
    expect(result.filters.scanned).toBe(true);
  });

  test("shows a project by id, name, or normalized path", () => {
    expect(showProject(source, "api").project?.name).toBe("api-server");
    expect(showProject(source, "tools-cli").project?.id).toBe("cli");
    expect(showProject(source, "/tmp/work/marketing-site").project?.id).toBe("site");
  });

  test("reports ambiguous loose matches without choosing one", () => {
    const result = showProject(source, "work");

    expect(result.project).toBeNull();
    expect(result.matches).toHaveLength(3);
    expect(result.warnings.at(0)?.code).toBe("AMBIGUOUS_PROJECT_MATCH");
  });

  test("builds dashboard aggregates and top space consumers", () => {
    const summary = getDashboardSummary(source, { topLimit: 2 });

    expect(summary.totalProjects).toBe(3);
    expect(summary.totalSizeBytes).toBe(96_471_040);
    expect(summary.cleanableBytes).toBe(35_651_584);
    expect(summary.countsByStatus).toEqual([
      { status: "ACTIVE", count: 1 },
      { status: "PAUSED", count: 1 },
      { status: "STALE", count: 1 },
    ]);
    expect(summary.topSpaceConsumers.map((item) => item.id)).toEqual(["cli", "api"]);
  });
});

describe("registry formatting helpers", () => {
  test("formats bytes and project rows for terminal output", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(toRegistryProjectRow(projects[0]!).size).toBe("12 MB");
    expect(toRegistryProjectRow(projects[0]!).git).toBe("dirty");
  });

  test("maps projects to TUI summary data", () => {
    const summary = toTuiProjectSummary(projects[1]!);

    expect(summary.runtime).toBe("go");
    expect(summary.status).toBe("STALE");
    expect(summary.cleanable).toBe("30 MB");
  });

  test("formats list and dashboard text", () => {
    const list = formatProjectListTable(listProjects(source, { status: "ACTIVE" }));
    const dashboard = formatDashboardSummary(getDashboardSummary(source, { topLimit: 1 }));

    expect(list).toContain("api-server");
    expect(list).toContain("/tmp/work/api-server");
    expect(dashboard).toContain("Projects: 3 projects");
    expect(dashboard).toContain("tools-cli: 80 MB");
  });
});

function project(overrides: Partial<Project>): Project {
  return {
    id: "default",
    name: "default",
    path: "/tmp/work/default",
    primaryRuntime: null,
    runtimes: [],
    status: "NEW",
    sizeBytes: 0,
    cleanableBytes: 0,
    gitRemoteUrl: null,
    gitBranch: null,
    gitDirty: false,
    notes: null,
    lastIndexedAt: "2026-06-15T10:00:00.000Z",
    lastScannedAt: null,
    createdAt: "2026-06-15T10:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
    ...overrides,
  };
}
