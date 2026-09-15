import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { optimiseProjects } from "../../src/cli/actions";
import { openKundolDatabase, type KundolDatabase, type OpenDatabaseOptions } from "../../src/db/client";
import { ActionRepository } from "../../src/db/repositories/action-repository";
import type { Output } from "../../src/shared/output";

describe("CLI audit connection lifecycle", () => {
  test("opens a bounded number of databases across multiple targets and none during selection", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kundol-audit-connections-"));
    try {
      const homeDir = path.join(root, "home");
      const workdir = path.join(root, "projects");
      const databasePath = path.join(root, "kundol.db");
      const now = new Date("2026-09-15T07:00:00Z");
      const old = new Date("2026-09-01T07:00:00Z");
      await mkdir(homeDir);
      await mkdir(workdir);
      for (let index = 0; index < 6; index++) {
        const project = path.join(workdir, `project-${index}`);
        const generated = path.join(project, "node_modules");
        await mkdir(generated, { recursive: true });
        await writeFile(path.join(project, "package.json"), "{}");
        const moduleFile = path.join(generated, "index.js");
        await writeFile(moduleFile, "generated");
        await utimes(moduleFile, old, old);
        await utimes(generated, old, old);
      }

      let opens = 0;
      let active = 0;
      const databaseOpen = (options: OpenDatabaseOptions): KundolDatabase => {
        const connection = openKundolDatabase(options);
        opens++;
        active++;
        return {
          ...connection,
          close() {
            active--;
            connection.close();
          },
        };
      };
      const output: Output = { writeLine() {}, writeError() {} };
      const result = await optimiseProjects({
        output,
        homeDir,
        databasePath,
        databaseOpen,
        registryNow: () => now,
        registrySelect: async (probe) => {
          expect(active).toBe(0);
          return probe.candidates.filter((candidate) => candidate.tier === "safe").map((candidate) => candidate.id);
        },
      }, workdir, { force: false });

      expect(result.exitCode).toBe(0);
      expect(opens).toBe(3);
      expect(active).toBe(0);
      const audit = openKundolDatabase({ databasePath });
      try {
        const events = new ActionRepository(audit.db, { now: () => now }).list(100);
        expect(events.filter((event) => event.actionType === "REGISTRY_TARGET" && event.status === "attempt")).toHaveLength(6);
        expect(events.filter((event) => event.actionType === "REGISTRY_TARGET" && event.status === "applied")).toHaveLength(6);
        expect(events.some((event) => event.actionType === "PROJECTS_OPTIMISE")).toBe(true);
      } finally {
        audit.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
