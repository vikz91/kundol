import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bumpVersion } from "../../scripts/bump-version";

const script = resolve(import.meta.dir, "../../scripts/bump-version.ts");
const workspaces: string[] = [];

function run(command: string[], cwd: string, env = process.env) {
  const result = Bun.spawnSync(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "kundol-version-test-"));
  workspaces.push(dir);
  expect(run(["git", "init", "-q"], dir).exitCode).toBe(0);
  writeFileSync(join(dir, "package.json"), '{\n  "name": "kundol",\n  "version": "0.1.0",\n  "description": "fixture"\n}\n');
  writeFileSync(join(dir, "bun.lock"), '{ "workspaces": { "": { "name": "kundol" } } }\n');
  writeFileSync(join(dir, "feature.txt"), "new feature\n");
  expect(run(["git", "add", "--", "package.json", "bun.lock", "feature.txt"], dir).exitCode).toBe(0);
  return dir;
}

function bump(dir: string, choice?: string, extraEnv: Record<string, string> = {}) {
  const env = { ...process.env, ...extraEnv };
  if (choice === undefined) delete env.KUNDOL_VERSION_BUMP;
  else env.KUNDOL_VERSION_BUMP = choice;
  return run([process.execPath, script], dir, env);
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("version bump before Git writes a commit", () => {
  test("computes major, minor, and patch versions", () => {
    expect(bumpVersion("0.1.0", "major")).toBe("1.0.0");
    expect(bumpVersion("0.1.0", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(() => bumpVersion("0.1.0-beta", "patch")).toThrow();
  });

  test("stages the bump in the pending index without creating a commit or changing bun.lock", () => {
    const dir = workspace();
    const lock = readFileSync(join(dir, "bun.lock"), "utf8");
    const result = bump(dir, "minor");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("0.1.0 → 0.2.0");
    expect(JSON.parse(run(["git", "show", ":package.json"], dir).stdout).version).toBe("0.2.0");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version).toBe("0.2.0");
    expect(readFileSync(join(dir, "bun.lock"), "utf8")).toBe(lock);
    expect(run(["git", "rev-parse", "--verify", "HEAD"], dir).exitCode).not.toBe(0);
  });

  test("puts the bump and existing changes in one commit", () => {
    const dir = workspace();
    const hook = join(dir, ".git", "hooks", "pre-commit");
    writeFileSync(hook, `#!/bin/sh\nexec '${process.execPath}' '${script}'\n`);
    chmodSync(hook, 0o755);

    const result = run(
      ["git", "-c", "core.hooksPath=.git/hooks", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "feature"],
      dir,
      { ...process.env, KUNDOL_VERSION_BUMP: "patch" },
    );

    expect(result.exitCode).toBe(0);
    expect(run(["git", "rev-list", "--count", "HEAD"], dir).stdout.trim()).toBe("1");
    expect(JSON.parse(run(["git", "show", "HEAD:package.json"], dir).stdout).version).toBe("0.1.1");
    expect(run(["git", "show", "HEAD:feature.txt"], dir).stdout.trim()).toBe("new feature");
  });

  test("refuses to stage unrelated unstaged package edits", () => {
    const dir = workspace();
    writeFileSync(join(dir, "package.json"), readFileSync(join(dir, "package.json"), "utf8").replace("fixture", "unstaged edit"));
    const result = bump(dir, "patch");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unstaged edits");
    expect(JSON.parse(run(["git", "show", ":package.json"], dir).stdout).version).toBe("0.1.0");
    expect(readFileSync(join(dir, "package.json"), "utf8")).toContain("unstaged edit");
  });

  test("allows explicit skip and CI runs without changing the index", () => {
    const dir = workspace();
    writeFileSync(join(dir, "package.json"), readFileSync(join(dir, "package.json"), "utf8").replace("fixture", "unstaged edit"));
    expect(bump(dir, "skip").exitCode).toBe(0);
    const ci = bump(dir, undefined, { CI: "true" });
    expect(ci.exitCode).toBe(0);
    expect(ci.stderr).toContain("no terminal available");
    expect(JSON.parse(run(["git", "show", ":package.json"], dir).stdout).version).toBe("0.1.0");
  });

  test("rejects unknown choices and skips a merge", () => {
    const dir = workspace();
    expect(bump(dir, "feature").exitCode).toBe(1);
    writeFileSync(join(dir, ".git", "MERGE_HEAD"), "0000000000000000000000000000000000000000\n");
    const result = bump(dir, "major");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("MERGE_HEAD");
    expect(JSON.parse(run(["git", "show", ":package.json"], dir).stdout).version).toBe("0.1.0");
  });
});
