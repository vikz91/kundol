import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDockerSandbox } from "../../scripts/seed-docker-sandbox";

describe("disposable project sandbox", () => {
  test("seeds generated targets beside protected project data", async () => {
    const root = await mkdtemp(join(tmpdir(), "kundol-project-sandbox-test-"));
    try {
      await seedDockerSandbox(root);

      const project = join(root, "projects", "node-api-orders");
      await expect(stat(join(root, ".kundol-demo-sandbox"))).resolves.toBeDefined();
      await expect(stat(join(root, "home"))).resolves.toBeDefined();
      await expect(stat(join(project, "node_modules", "express", "index.js"))).resolves.toBeDefined();
      await expect(stat(join(project, ".git"))).resolves.toBeDefined();
      expect(await readFile(join(project, ".env"), "utf8")).toContain("DATABASE_URL=");
      await expect(stat(join(root, "projects", "python-data-tools", "local.sqlite"))).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects a system root as a sandbox destination", async () => {
    await expect(seedDockerSandbox("/")).rejects.toThrow("dedicated demo sandbox");
  });
});
