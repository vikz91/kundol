import { describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { registerCli } from "../../scripts/register-cli";

async function fixture(run: (root: string, home: string) => Promise<void>): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "kundol-register-"));
  try {
    const root = join(temporary, "source with spaces");
    const home = join(temporary, "home with spaces");
    await mkdir(join(root, "dist"), { recursive: true });
    await mkdir(join(home, ".local", "bin"), { recursive: true });
    await run(root, home);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

describe("register:cli", () => {
  test("always installs, rebuilds, and replaces an existing binary on repeated runs", async () => {
    await fixture(async (repositoryRoot, homeDir) => {
      const destination = join(homeDir, ".local/bin/kundol");
      await writeFile(destination, "old installed binary");
      await writeFile(join(repositoryRoot, "dist/kundol-macos-universal"), "stale build");
      const calls: string[][] = [];
      let generation = 0;
      const runner = async (args: readonly string[], cwd: string) => {
        expect(cwd).toBe(repositoryRoot);
        calls.push([...args]);
        if (args[0] === "run") await writeFile(args[3]!, `new binary ${++generation}`);
      };
      const options = { repositoryRoot, homeDir, platform: "darwin" as const, runner };
      expect(await registerCli(options)).toBe(destination);
      expect(await readFile(destination, "utf8")).toBe("new binary 1");
      await registerCli(options);
      expect(await readFile(destination, "utf8")).toBe("new binary 2");
      expect(calls.map((args) => args[0])).toEqual(["install", "run", "install", "run"]);
      expect(calls[0]).toEqual(["install", "--frozen-lockfile", "--force"]);
      expect((await lstat(destination)).mode & 0o777).toBe(0o755);
      expect(await readdir(dirname(destination))).toEqual(["kundol"]);
    });
  });

  test("replaces an existing symlink without changing its target", async () => {
    await fixture(async (repositoryRoot, homeDir) => {
      const original = join(repositoryRoot, "original");
      await writeFile(original, "keep this file");
      const destination = join(homeDir, ".local/bin/kundol");
      await symlink(original, destination);
      await registerCli({ repositoryRoot, homeDir, platform: "darwin", runner: async (args) => {
        if (args[0] === "run") await writeFile(args[3]!, "new binary");
      } });
      expect((await lstat(destination)).isSymbolicLink()).toBe(false);
      expect(await readFile(original, "utf8")).toBe("keep this file");
      expect(await readFile(destination, "utf8")).toBe("new binary");
    });
  });

  for (const failingStage of ["install", "run"]) {
    test(`preserves installed binary when ${failingStage} fails`, async () => {
      await fixture(async (repositoryRoot, homeDir) => {
        const destination = join(homeDir, ".local/bin/kundol");
        await writeFile(destination, "working binary");
        await writeFile(join(repositoryRoot, "dist/kundol-macos-universal"), "stale build");
        const calls: string[] = [];
        await expect(registerCli({ repositoryRoot, homeDir, platform: "darwin", runner: async (args) => {
          calls.push(args[0]!);
          if (args[0] === failingStage) throw new Error("stage failed");
        } })).rejects.toThrow("stage failed");
        expect(calls).toEqual(failingStage === "install" ? ["install"] : ["install", "run"]);
        expect(await readFile(destination, "utf8")).toBe("working binary");
        expect(await readdir(dirname(destination))).toEqual(["kundol"]);
      });
    });
  }

  test("rejects unsupported platforms before running installation", async () => {
    await expect(registerCli({ platform: "linux", runner: async () => {
      throw new Error("must not run");
    } })).rejects.toThrow("requires macOS");
  });
});
