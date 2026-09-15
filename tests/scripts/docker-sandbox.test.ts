import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFakeDockerCommand } from "../../scripts/fake-docker-cli";
import { createFakeStartupRunner } from "../../scripts/fake-startup-runner";
import { seedDockerSandbox } from "../../scripts/seed-docker-sandbox";

describe("disposable Docker sandbox fixtures", () => {
  test("seeds project, temp, Docker-like volume, and startup data; fake prune keeps protected fixtures", async () => {
    const root = await mkdtemp(join(tmpdir(), "kundol-docker-sandbox-test-"));
    try {
      await seedDockerSandbox(root);

      await expect(stat(join(root, "projects", "node-api-orders", "node_modules"))).resolves.toBeDefined();
      await expect(stat(join(root, "projects", "python-data-tools", "local.sqlite"))).resolves.toBeDefined();
      await expect(stat(join(root, "fake-docker", "volumes", "demo-database", "data.sqlite"))).resolves.toBeDefined();
      await expect(stat(join(root, "fake-docker", "pruneable", "build-cache", "layer.bin"))).resolves.toBeDefined();

      const oldTemp = await stat(join(root, "tmp", "old-demo-temp"));
      const freshTemp = await stat(join(root, "tmp", "fresh-demo-temp.txt"));
      expect(freshTemp.mtimeMs - oldTemp.mtimeMs).toBeGreaterThan(7 * 86_400_000);

      const protectedVolume = join(root, "fake-docker", "volumes", "demo-database", "data.sqlite");
      await symlink(protectedVolume, join(root, "fake-docker", "pruneable", "build-cache", "volume-link"));
      expect((await runFakeDockerCommand(["info"], root)).exitCode).toBe(0);
      const prune = await runFakeDockerCommand(["system", "prune", "--force"], root);
      expect(prune.exitCode).toBe(0);
      expect(prune.output).toContain("volumes were kept");
      await expect(stat(join(root, "fake-docker", "pruneable", "build-cache", "layer.bin"))).rejects.toThrow();
      await expect(stat(protectedVolume)).resolves.toBeDefined();
      await expect(stat(join(root, "fake-docker", "running-containers", "demo.json"))).resolves.toBeDefined();
      expect((await runFakeDockerCommand(["volume", "rm", "demo-database"], root)).exitCode).toBe(2);
      const escapedCategory = join(root, "fake-docker", "pruneable", "unused-networks");
      await rm(escapedCategory, { recursive: true });
      await symlink(join(root, "fake-docker", "volumes", "demo-database"), escapedCategory);
      expect((await runFakeDockerCommand(["system", "prune", "--force"], root)).exitCode).toBe(2);
      await expect(stat(protectedVolume)).resolves.toBeDefined();

      const runner = createFakeStartupRunner(root);
      const loginItems = await runner.run("osascript", ["-e", 'tell application "System Events" to get the name of every login item']);
      expect(loginItems.output).toContain("Demo Login App");
      const plist = join(root, "home", "Library", "LaunchAgents", "com.kundol.demo-indexer.plist");
      expect((await runner.run("launchctl", ["bootout", "gui/1000", plist])).exitCode).toBe(0);
      expect((await runner.run("launchctl", ["disable", "gui/1000/com.kundol.demo-indexer"])).exitCode).toBe(0);
      expect((await runner.run("launchctl", ["disable", "gui/1000/com.apple.demo-protected"])).exitCode).toBe(2);
      await expect(stat(plist)).resolves.toBeDefined();
      expect(await readFile(join(root, "fake-startup", "actions.log"), "utf8")).toContain("disable com.kundol.demo-indexer");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
