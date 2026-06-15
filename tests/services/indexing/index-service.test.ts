import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveKundolConfig } from "../../../src/config";
import { openKundolDatabase } from "../../../src/db/client";
import { ActionRepository, ProjectRepository } from "../../../src/db/repositories";
import { runWorkspaceIndex, WorkspaceIndexError } from "../../../src/services/indexing";
import type { Clock } from "../../../src/platform/clock";

const fixedDate = new Date("2026-06-15T10:30:00.000Z");
const fixedClock: Clock = {
  now: () => fixedDate,
};
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workspace index persistence service", () => {
  test("fails clearly before init config has a workspace", async () => {
    const databasePath = await tempDatabasePath();

    await expect(runWorkspaceIndex({ databasePath, clock: fixedClock })).rejects.toEqual(
      new WorkspaceIndexError("NOT_INITIALIZED", "kundol is not initialized yet. Run `kundol init` to choose workspace folders."),
    );
  });

  test("indexes configured workspaces, persists project metadata, and records an INDEX action", async () => {
    const databasePath = await tempDatabasePath();
    const workspace = await tempDir("kundol-index-workspace-");
    const app = join(workspace, "app");
    await mkdir(join(app, ".git"), { recursive: true });
    await Promise.all([
      writeFile(join(app, "package.json"), JSON.stringify({ packageManager: "bun@1.2.0" })),
      writeFile(join(app, ".git", "HEAD"), "ref: refs/heads/main\n"),
      writeFile(join(app, ".git", "config"), '[remote "origin"]\n\turl = git@example.com:demo/app.git\n'),
    ]);
    saveKundolConfig({ workspaces: [{ path: workspace }] }, { databasePath, clock: fixedClock });

    const result = await runWorkspaceIndex({
      databasePath,
      clock: fixedClock,
      now: () => fixedDate,
      processRunner: {
        async run() {
          return { exitCode: 0, stdout: "", stderr: "" };
        },
      },
    });

    expect(result.projectsFound).toBe(1);
    expect(result.newProjects).toBe(1);
    expect(result.updatedProjects).toBe(0);
    expect(result.missingProjects).toBe(0);

    const connection = openKundolDatabase({ databasePath, clock: fixedClock });
    try {
      const projects = new ProjectRepository(connection.db, fixedClock);
      const actions = new ActionRepository(connection.db, fixedClock);
      const project = projects.findByPath(app);
      expect(project?.status).toBe("NEW");
      expect(project?.primaryRuntime).toBe("bun");
      expect(project?.runtimes).toContain("node");
      expect(project?.gitRemoteUrl).toBe("git@example.com:demo/app.git");
      expect(project?.gitBranch).toBe("main");
      expect(project?.gitDirty).toBe(false);
      expect(project?.lastIndexedAt).toBe("2026-06-15T10:30:00.000Z");

      const action = actions.findById(result.actionId);
      expect(action?.actionType).toBe("INDEX");
      expect(action?.details).toMatchObject({
        projectsFound: 1,
        newProjects: 1,
        updatedProjects: 0,
        missingProjects: 0,
      });
    } finally {
      connection.close();
    }
  });

  test("marks previously indexed projects as deleted when missing from an indexed workspace", async () => {
    const databasePath = await tempDatabasePath();
    const workspace = await tempDir("kundol-index-missing-");
    const app = join(workspace, "old-app");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "package.json"), "{}");
    saveKundolConfig({ workspaces: [{ path: workspace }] }, { databasePath, clock: fixedClock });

    await runWorkspaceIndex({ databasePath, clock: fixedClock, now: () => fixedDate });
    await rm(app, { recursive: true, force: true });

    const result = await runWorkspaceIndex({ databasePath, clock: fixedClock, now: () => fixedDate });

    expect(result.projectsFound).toBe(0);
    expect(result.missingProjects).toBe(1);
    expect(result.missing.at(0)?.status).toBe("DELETED");
  });
});

async function tempDatabasePath(): Promise<string> {
  const root = await tempDir("kundol-index-db-");
  return join(root, "nested", "kundol.db");
}

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
