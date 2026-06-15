import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openKundolDatabase } from "../../src/db";
import { ActionRepository, ProjectRepository, ScanRepository } from "../../src/db/repositories";
import type { Clock } from "../../src/platform/clock";
import { cleanProjectService, scanProjectService, type ScanCleanRepositories } from "../../src/services/scan-clean";

const fixedClock: Clock = {
  now: () => new Date("2026-06-15T10:20:00.000Z"),
};

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("scan-clean services", () => {
  test("scanProjectService resolves a project by name and persists scan items plus action log", async () => {
    const { repositories, close } = await makeRepositories();
    const projectPath = await makeProject();
    const project = repositories.projects.upsert({
      path: projectPath,
      name: "node-api",
      primaryRuntime: "node",
      runtimes: ["node"],
      status: "STALE",
    });

    try {
      const result = await scanProjectService({ target: "node-api", largestLimit: 5 }, repositories);
      const itemRows = repositories.db
        .query<{ path: string; safety: string }, [string]>("SELECT path, safety FROM scan_items WHERE scan_id = ?")
        .all(result.scan.id);

      expect(result.project.id).toBe(project.id);
      expect(result.summary.safeCleanupBytes).toBeGreaterThan(0);
      expect(result.items.some((item) => item.path === "node_modules" && item.classification === "safe")).toBe(true);
      expect(itemRows.some((row) => row.path === "node_modules" && row.safety === "safe")).toBe(true);
      expect(repositories.projects.findById(project.id)?.cleanableBytes).toBe(result.summary.safeCleanupBytes);
      expect(repositories.projects.findById(project.id)?.lastScannedAt).toBe("2026-06-15T10:20:00.000Z");
      expect(result.action.actionType).toBe("PROJECT_SCAN");
    } finally {
      close();
    }
  });

  test("cleanProjectService defaults to dry-run and leaves files in place", async () => {
    const { repositories, close } = await makeRepositories();
    const projectPath = await makeProject();
    repositories.projects.upsert({
      path: projectPath,
      name: "dry-run-project",
      primaryRuntime: "node",
      runtimes: ["node"],
    });

    try {
      await scanProjectService({ target: projectPath }, repositories);
      const result = await cleanProjectService({ target: "dry-run-project" }, repositories);

      expect(result.dryRun).toBe(true);
      expect(result.recoverableBytes).toBeGreaterThan(0);
      expect(result.deletedItems).toEqual([]);
      expect(result.action.actionType).toBe("CLEAN_DRY_RUN");
      expect(existsSync(path.join(projectPath, "node_modules"))).toBe(true);
      expect(existsSync(path.join(projectPath, ".env"))).toBe(true);
      expect(existsSync(path.join(projectPath, "reports"))).toBe(true);
    } finally {
      close();
    }
  });

  test("cleanProjectService apply deletes only safe generated artifacts from the latest scan", async () => {
    const { repositories, close } = await makeRepositories();
    const projectPath = await makeProject();
    repositories.projects.upsert({
      path: projectPath,
      name: "apply-project",
      primaryRuntime: "node",
      runtimes: ["node"],
    });

    try {
      await scanProjectService({ target: "apply-project" }, repositories);
      const result = await cleanProjectService({ target: "apply-project", apply: true }, repositories);

      expect(result.dryRun).toBe(false);
      expect(result.deletedItems.some((item) => item.path === "node_modules")).toBe(true);
      expect(result.action.actionType).toBe("CLEAN_APPLY");
      expect(existsSync(path.join(projectPath, "node_modules"))).toBe(false);
      expect(existsSync(path.join(projectPath, ".env"))).toBe(true);
      expect(existsSync(path.join(projectPath, "reports"))).toBe(true);
      expect(existsSync(path.join(projectPath, "src", "index.ts"))).toBe(true);
    } finally {
      close();
    }
  });

  test("cleanProjectService archives old project folders before applying cleanup", async () => {
    const { repositories, close } = await makeRepositories();
    const projectPath = await makeProject();
    const archiveRoot = await mkdtemp(path.join(tmpdir(), "kundol-archives-"));
    tempRoots.push(archiveRoot);
    repositories.projects.upsert({
      path: projectPath,
      name: "archive-project",
      primaryRuntime: "node",
      runtimes: ["node"],
    });

    try {
      await scanProjectService({ target: "archive-project" }, repositories);
      const oldDate = new Date("2026-05-01T10:20:00.000Z");
      await touchProjectRoot(projectPath, oldDate);
      const result = await cleanProjectService({
        target: "archive-project",
        apply: true,
        archiveBeforeCleanDays: 15,
        archiveRoot,
      }, repositories);

      expect(result.archive?.archivePath).toContain("archive-project");
      expect(result.archive?.archiveSizeBytes).toBeGreaterThan(0);
      expect(result.archivePlan.eligible).toBe(true);
      expect(existsSync(result.archive!.archivePath)).toBe(true);
      expect(existsSync(path.join(projectPath, "node_modules"))).toBe(false);
      expect(existsSync(path.join(projectPath, "src", "index.ts"))).toBe(true);
    } finally {
      close();
    }
  });
});

async function makeRepositories(): Promise<{ repositories: ScanCleanRepositories; close: () => void }> {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-scan-clean-db-"));
  tempRoots.push(root);
  const connection = openKundolDatabase({ databasePath: path.join(root, "kundol.db"), clock: fixedClock });
  return {
    repositories: {
      db: connection.db,
      projects: new ProjectRepository(connection.db, fixedClock),
      scans: new ScanRepository(connection.db, fixedClock),
      actions: new ActionRepository(connection.db, fixedClock),
    },
    close: connection.close,
  };
}

async function makeProject(): Promise<string> {
  const projectPath = await mkdtemp(path.join(tmpdir(), "kundol-scan-clean-project-"));
  tempRoots.push(projectPath);
  await writeFile(path.join(projectPath, "package.json"), "{}");
  await writeFile(path.join(projectPath, ".env"), "SECRET=1");
  await mkdir(path.join(projectPath, "src"));
  await writeFile(path.join(projectPath, "src", "index.ts"), "console.log('hello');");
  await mkdir(path.join(projectPath, "node_modules", "dep"), { recursive: true });
  await writeFile(path.join(projectPath, "node_modules", "dep", "index.js"), "x".repeat(256));
  await mkdir(path.join(projectPath, "reports"));
  await writeFile(path.join(projectPath, "reports", "summary.json"), "x".repeat(128));
  return projectPath;
}

async function touchProjectRoot(projectPath: string, date: Date): Promise<void> {
  await utimes(projectPath, date, date);
}
