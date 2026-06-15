import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openKundolDatabase, resolveDatabasePath } from "../../src/db/client";
import { ActionRepository, ProjectRepository, ScanRepository } from "../../src/db/repositories";
import { loadKundolConfig, saveKundolConfig } from "../../src/config";
import type { Clock } from "../../src/platform/clock";

const fixedClock: Clock = {
  now: () => new Date("2026-06-15T09:50:26.000Z"),
};

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function tempDatabasePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kundol-db-test-"));
  tempRoots.push(root);
  return join(root, "nested", "kundol.db");
}

describe("kundol database foundation", () => {
  test("resolves the default database under the provided home directory", () => {
    expect(resolveDatabasePath({ homeDir: "/Users/example" })).toBe("/Users/example/.kundol/kundol.db");
  });

  test("initializes migrations idempotently at an injected path", async () => {
    const databasePath = await tempDatabasePath();

    const first = openKundolDatabase({ databasePath, clock: fixedClock });
    const second = openKundolDatabase({ databasePath, clock: fixedClock });

    try {
      const rows = second.db
        .query<{ version: number; name: string }, []>("SELECT version, name FROM schema_migrations")
        .all();
      expect(rows).toEqual([
        {
          version: 1,
          name: "initial_persistence_and_config_schema",
        },
      ]);
    } finally {
      first.close();
      second.close();
    }
  });

  test("loads and saves config from SQLite tables", async () => {
    const databasePath = await tempDatabasePath();

    const initial = loadKundolConfig({ databasePath, clock: fixedClock });
    expect(initial.initialized).toBe(false);
    expect(initial.workspaces).toEqual([]);

    const saved = saveKundolConfig(
      {
        workspaces: [{ path: "/tmp/kundol-demo" }],
        excludedPaths: [{ path: "/tmp/kundol-demo/private", reason: "manual test exclusion" }],
        settings: {
          archiveRoot: "/tmp/kundol-archives",
          showHints: true,
        },
      },
      { databasePath, clock: fixedClock },
    );

    expect(saved.initialized).toBe(true);
    expect(saved.workspaces).toHaveLength(1);
    expect(saved.workspaces.at(0)?.path).toBe("/tmp/kundol-demo");
    expect(saved.excludedPaths.at(0)?.path).toBe("/tmp/kundol-demo/private");
    expect(saved.settings.archiveRoot).toBe("/tmp/kundol-archives");
    expect(saved.settings.showHints).toBe(true);
  });

  test("repositories persist projects, scans, and action audit rows", async () => {
    const databasePath = await tempDatabasePath();
    const connection = openKundolDatabase({ databasePath, clock: fixedClock });

    try {
      const projects = new ProjectRepository(connection.db, fixedClock);
      const scans = new ScanRepository(connection.db, fixedClock);
      const actions = new ActionRepository(connection.db, fixedClock);

      const project = projects.upsert({
        path: "/tmp/kundol-demo/node-api-orders",
        primaryRuntime: "node",
        runtimes: ["node"],
        status: "ACTIVE",
        sizeBytes: 1024,
        lastIndexedAt: "2026-06-15T09:50:26.000Z",
      });

      const scan = scans.create({
        projectId: project.id,
        totalSizeBytes: 2048,
        cleanableBytes: 1024,
        itemCount: 2,
        recommendationCount: 1,
      });

      const action = actions.record({
        projectId: project.id,
        actionType: "PROJECT_SCAN",
        details: { scanId: scan.id },
      });

      expect(projects.findByPath("/tmp/kundol-demo/node-api-orders")?.primaryRuntime).toBe("node");
      expect(scans.findLatestForProject(project.id)?.cleanableBytes).toBe(1024);
      expect(actions.findById(action.id)?.details).toEqual({ scanId: scan.id });
    } finally {
      connection.close();
    }
  });
});
