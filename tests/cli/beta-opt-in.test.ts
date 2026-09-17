import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import type { RegistryCommandResult } from "../../src/services/optimisation-registry";
import type { Output } from "../../src/shared/output";

const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function exists(absolutePath: string): Promise<boolean> {
  try { await lstat(absolutePath); return true; }
  catch { return false; }
}

function captured() {
  const lines: string[] = [];
  const output: Output = { writeLine: (message = "") => { lines.push(message); }, writeError: () => {} };
  return { output, lines };
}

describe("explicit beta optimisation opt-in", () => {
  test("storage attempts the beta Yarn Classic handler only with opt-in and explicit review", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "kundol-beta-yarn-cli-")));
    roots.push(root);
    const home = path.join(root, "home");
    const workspace = path.join(root, "workspace");
    const cache = path.join(home, "yarn-cache");
    const databasePath = path.join(root, "audit.db");
    await mkdir(home);
    await mkdir(workspace);
    await mkdir(cache);
    await writeFile(path.join(workspace, "package.json"), "{}\n");
    await writeFile(path.join(cache, "module.tgz"), "cached\n");
    await utimes(path.join(cache, "module.tgz"), old, old);
    await utimes(cache, old, old);
    const calls: string[] = [];
    const runner = async (argv: readonly string[]): Promise<RegistryCommandResult> => {
      const command = argv.join(" ");
      calls.push(command);
      if (command === "yarn --version") return { exitCode: 0, stdout: "1.22.22\n", stderr: "" };
      if (command === "yarn --silent cache dir") return { exitCode: 0, stdout: `${cache}\n`, stderr: "" };
      if (command === `yarn --silent cache clean --cache-folder ${cache}`) return { exitCode: 0, stdout: "cleared\n", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "fixture tool unavailable" };
    };

    const normal = captured();
    await createProgram({ output: normal.output, homeDir: home, databasePath, registryCommandCwd: workspace, registryRunner: runner, registryNow: () => now })
      .parseAsync(["optimise", "storage", "-f"], { from: "user" });
    expect(normal.lines.join("\n")).not.toContain("[beta review] Yarn Classic cache");

    const forced = captured();
    await createProgram({ output: forced.output, homeDir: home, databasePath, registryCommandCwd: workspace, registryRunner: runner, registryNow: () => now })
      .parseAsync(["optimise", "storage", "--allow-beta", "-f"], { from: "user" });
    const forcedPlan = forced.lines.join("\n");
    expect(forcedPlan).toContain("[beta review] Yarn Classic cache");
    expect(forcedPlan).toContain("Unavailable [beta] store.deno.cache: beta rule has no code-approved executable release");
    expect(forcedPlan).not.toContain("Beta catalogue-only:");
    expect(calls).not.toContain(`yarn --silent cache clean --cache-folder ${cache}`);

    const reviewed = captured();
    await createProgram({
      output: reviewed.output, homeDir: home, databasePath, registryCommandCwd: workspace, registryRunner: runner, registryNow: () => now,
      registrySelect: async (plan) => plan.candidates.filter((candidate) => candidate.ruleId === "store.yarn.cache").map((candidate) => candidate.id),
    }).parseAsync(["optimise", "storage", "--allow-beta"], { from: "user" });
    expect(reviewed.lines.join("\n")).toContain("Removed/optimised: 1");
    expect(calls).toContain(`yarn --silent cache clean --cache-folder ${cache}`);
  });

  test("Linux-only Python venv requires --allow-beta and explicit review; force never selects it", async () => {
    // Never exercise a proposed owner removal on this macOS host.
    if (process.platform !== "linux") return;
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "kundol-beta-cli-")));
    roots.push(root);
    const home = path.join(root, "home");
    const workdir = path.join(root, "projects");
    const project = path.join(workdir, "python");
    const venv = path.join(project, ".venv");
    const bin = path.join(venv, "bin");
    const databasePath = path.join(root, "audit.db");
    await mkdir(home);
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = 'fixture'\n");
    await writeFile(path.join(project, "KEEP.user-data"), "retained\n");
    await writeFile(path.join(venv, "pyvenv.cfg"), "home = /usr/bin\n");
    await writeFile(path.join(bin, "python"), "fixture executable\n");
    for (const target of [path.join(venv, "pyvenv.cfg"), path.join(bin, "python"), bin, venv]) {
      await utimes(target, old, old);
    }

    const normal = captured();
    await createProgram({ output: normal.output, homeDir: home, databasePath, registryNow: () => now })
      .parseAsync(["optimise", "projects", workdir, "-f"], { from: "user" });
    expect(normal.lines.join("\n")).not.toContain("[beta review] Python project virtual environment");
    expect(await exists(venv)).toBe(true);

    const forced = captured();
    await createProgram({ output: forced.output, homeDir: home, databasePath, registryNow: () => now })
      .parseAsync(["optimise", "projects", workdir, "--allow-beta", "-f"], { from: "user" });
    expect(forced.lines.join("\n")).toContain("[beta review] Python project virtual environment");
    expect(forced.lines.join("\n")).toContain("Safe suggestions: 0");
    expect(await exists(venv)).toBe(true);

    const reviewed = captured();
    await createProgram({
      output: reviewed.output, homeDir: home, databasePath, registryNow: () => now,
      registrySelect: async (plan) => plan.candidates.filter((candidate) => candidate.ruleId === "project.python.virtual_envs")
        .map((candidate) => candidate.id),
    }).parseAsync(["optimise", "projects", workdir, "--allow-beta"], { from: "user" });
    expect(reviewed.lines.join("\n")).toContain("Removed/optimised: 1");
    expect(await exists(venv)).toBe(false);
    expect(await exists(path.join(project, "KEEP.user-data"))).toBe(true);
  });

  test("beta tox session review removes only its pinned disposable environment", async () => {
    if (process.platform !== "linux") return;
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "kundol-beta-tox-cli-")));
    roots.push(root);
    const home = path.join(root, "home");
    const workdir = path.join(root, "projects");
    const project = path.join(workdir, "python-tests");
    const session = path.join(project, ".tox", "py312");
    const bin = path.join(session, "bin");
    await mkdir(home);
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = 'fixture'\n");
    await writeFile(path.join(project, "tox.ini"), "[tox]\nenv_list = py312\n[testenv]\ndeps = pytest==8.4.2\ncommands = python -m pytest\n");
    await writeFile(path.join(project, "KEEP.user-data"), "retained\n");
    await writeFile(path.join(session, "pyvenv.cfg"), "home = /usr/bin\n");
    await writeFile(path.join(bin, "python"), "fixture executable\n");
    for (const target of [path.join(session, "pyvenv.cfg"), path.join(bin, "python"), bin, session]) {
      await utimes(target, old, old);
    }
    const output = captured();
    await createProgram({
      output: output.output, homeDir: home, databasePath: path.join(root, "audit.db"), registryNow: () => now,
      registrySelect: async (plan) => plan.candidates.filter((candidate) => candidate.ruleId === "project.python.test_envs")
        .map((candidate) => candidate.id),
    }).parseAsync(["optimise", "repos", workdir, "--allow-beta"], { from: "user" });
    expect(output.lines.join("\n")).toContain("[beta review] tox and Nox test environments");
    expect(output.lines.join("\n")).toContain("Removed/optimised: 1");
    expect(await exists(session)).toBe(false);
    expect(await exists(path.join(project, "KEEP.user-data"))).toBe(true);
  });
});
