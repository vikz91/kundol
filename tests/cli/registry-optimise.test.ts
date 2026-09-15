import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { optimiseStorage } from "../../src/cli/actions";
import { createProgram } from "../../src/cli/program";
import { openKundolDatabase } from "../../src/db/client";
import { ActionRepository } from "../../src/db/repositories/action-repository";
import type { RegistryCommandResult } from "../../src/services/optimisation-registry";
import type { Output } from "../../src/shared/output";

const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-registry-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const workdir = path.join(root, "projects");
  const databasePath = path.join(root, "kundol.db");
  await mkdir(home);
  await mkdir(workdir);
  return { root, home, workdir, databasePath };
}

async function exists(absolutePath: string): Promise<boolean> {
  try { await lstat(absolutePath); return true; } catch { return false; }
}

function capturedOutput() {
  const lines: string[] = [];
  const errors: string[] = [];
  const output: Output = {
    writeLine(message = "") { lines.push(message); },
    writeError(message = "") { errors.push(message); },
  };
  return { output, lines, errors };
}

function actionRows(databasePath: string) {
  const connection = openKundolDatabase({ databasePath });
  try { return new ActionRepository(connection.db, { now: () => now }).list(); }
  finally { connection.close(); }
}

async function ageTarget(target: string, children: readonly string[] = []) {
  for (const child of children) await utimes(child, old, old);
  await utimes(target, old, old);
}

describe("registry-backed optimise CLI", () => {
  test("projects -f plans and applies only published safe generated paths", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "demo");
    await mkdir(project);
    await writeFile(path.join(project, "package.json"), "{}");
    await writeFile(path.join(project, "pyproject.toml"), "{}");
    await writeFile(path.join(project, "demo.sln"), "");
    await writeFile(path.join(project, ".env"), "keep secret");
    await mkdir(path.join(project, ".git"));
    const modules = path.join(project, "node_modules");
    const report = path.join(project, "htmlcov");
    const state = path.join(project, ".vs");
    await mkdir(modules);
    await writeFile(path.join(modules, "package.js"), "generated");
    await ageTarget(modules, [path.join(modules, "package.js")]);
    await mkdir(report);
    await ageTarget(report);
    await mkdir(state);
    await ageTarget(state);
    const captured = capturedOutput();
    await createProgram({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
    }).parseAsync(["optimise", "projects", f.workdir, "-f"], { from: "user" });
    const text = captured.lines.join("\n");
    expect(text).toContain("Project optimisation plan");
    expect(text).toContain("[safe] Project node_modules");
    expect(text).toContain("[review] coverage.py HTML report");
    expect(text).toContain("[protected] Visual Studio solution state");
    expect(text).toContain("Source: https://");
    expect(text).toContain("Removed/optimised: 1");
    expect(await exists(modules)).toBe(false);
    expect(await exists(report)).toBe(true);
    expect(await exists(state)).toBe(true);
    expect(await exists(path.join(project, ".git"))).toBe(true);
    expect(await readFile(path.join(project, ".env"), "utf8")).toBe("keep secret");
    const audit = actionRows(f.databasePath);
    expect(audit.some((row) => row.actionType === "REGISTRY_TARGET" && row.status === "attempt")).toBe(true);
    expect(audit.some((row) => row.actionType === "REGISTRY_TARGET" && row.status === "applied")).toBe(true);
    expect(audit.some((row) => row.actionType === "PROJECTS_OPTIMISE")).toBe(true);
  });

  test("explicit review can select a report while protected inventory stays", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "python");
    await mkdir(project);
    await writeFile(path.join(project, "pyproject.toml"), "{}");
    const report = path.join(project, "htmlcov");
    await mkdir(report);
    await ageTarget(report);
    const captured = capturedOutput();
    await createProgram({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
      registrySelect: async (probe) => [probe.candidates.find((candidate) => candidate.ruleId === "project.python.htmlcov")!.id],
    }).parseAsync(["optimise", "repos", f.workdir], { from: "user" });
    expect(captured.lines.join("\n")).toContain("Removed/optimised: 1");
    expect(await exists(report)).toBe(false);
  });

  test("storage uses approved owner commands and leaves old temp and Docker fixtures alone", async () => {
    const f = await fixture();
    const store = path.join(f.home, "pnpm-store");
    await mkdir(store);
    await writeFile(path.join(store, "cached.tgz"), "cached");
    await ageTarget(store, [path.join(store, "cached.tgz")]);
    const oldTemp = path.join(f.root, "old-temp");
    const fakeDocker = path.join(f.root, "fake-docker");
    await mkdir(oldTemp);
    await mkdir(fakeDocker);
    await ageTarget(oldTemp);
    const calls: string[] = [];
    const runner = async (argv: readonly string[]): Promise<RegistryCommandResult> => {
      const signature = argv.join(" ");
      calls.push(signature);
      if (signature === "pnpm store path") return { exitCode: 0, stdout: store, stderr: "" };
      if (signature === "pnpm --version" || signature === "pnpm store prune") return { exitCode: 0, stdout: "ok", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "fixture tool unavailable" };
    };
    const captured = capturedOutput();
    await createProgram({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath,
      registryRunner: runner, registryNow: () => now,
    }).parseAsync(["optimise", "storage", "-f"], { from: "user" });
    const text = captured.lines.join("\n");
    expect(text).toContain("Storage optimisation plan");
    expect(text).toContain("pnpm unreferenced store entries");
    expect(text).toContain("Removed/optimised: 1");
    expect(calls).toContain("pnpm store prune");
    expect(calls.some((call) => call.includes("docker") || call.includes("prune --force"))).toBe(false);
    expect(await exists(oldTemp)).toBe(true);
    expect(await exists(fakeDocker)).toBe(true);
  });

  test("a reviewed target replaced with an outside symlink is skipped", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "demo");
    await mkdir(project);
    await writeFile(path.join(project, "package.json"), "{}");
    const modules = path.join(project, "node_modules");
    const outside = path.join(f.root, "outside");
    await mkdir(modules);
    await ageTarget(modules);
    await mkdir(outside);
    await writeFile(path.join(outside, "keep.txt"), "outside data");
    const captured = capturedOutput();
    await createProgram({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
      registrySelect: async (probe) => {
        const id = probe.candidates.find((candidate) => candidate.ruleId === "project.node_modules")!.id;
        await rm(modules, { recursive: true });
        await symlink(outside, modules);
        return [id];
      },
    }).parseAsync(["optimise", "projects", f.workdir], { from: "user" });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("outside data");
    expect(actionRows(f.databasePath).some((row) => row.actionType === "REGISTRY_TARGET" && row.status === "attempt")).toBe(false);
  });

  test("recently changed generated content stays outside the force plan", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "demo");
    await mkdir(project);
    await writeFile(path.join(project, "package.json"), "{}");
    const modules = path.join(project, "node_modules");
    await mkdir(modules);
    const file = path.join(modules, "recent.js");
    await writeFile(file, "still in use");
    await utimes(modules, old, old);
    const captured = capturedOutput();
    await createProgram({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
    }).parseAsync(["optimise", "projects", f.workdir, "-f"], { from: "user" });
    expect(captured.lines.join("\n")).toContain("Targets: 0");
    expect(captured.lines.join("\n")).toContain("no changes in the last 7 days");
    expect(await readFile(file, "utf8")).toBe("still in use");
  });

  test("owner-command failure reports exit 70 and per-target failed audit", async () => {
    const f = await fixture();
    const store = path.join(f.home, "pnpm-store");
    await mkdir(store);
    await ageTarget(store);
    const captured = capturedOutput();
    const result = await optimiseStorage({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
      registryRunner: async (argv) => {
        const signature = argv.join(" ");
        if (signature === "pnpm store path") return { exitCode: 0, stdout: store, stderr: "" };
        if (signature === "pnpm --version") return { exitCode: 0, stdout: "ok", stderr: "" };
        if (signature === "pnpm store prune") return { exitCode: 1, stdout: "", stderr: "owner prune failed" };
        return { exitCode: 1, stdout: "", stderr: "unavailable" };
      },
    }, { force: true });
    expect(result.exitCode).toBe(70);
    expect(captured.lines.join("\n")).toContain("Failed: 1");
    expect(captured.lines.join("\n")).toContain("owner prune failed");
    expect(actionRows(f.databasePath).some((row) => row.actionType === "REGISTRY_TARGET" && row.status === "failed")).toBe(true);
  });

  test("reports a successful action even when outcome and run audit become unwritable", async () => {
    const f = await fixture();
    const store = path.join(f.home, "pnpm-store");
    await mkdir(store);
    await ageTarget(store);
    const captured = capturedOutput();
    const result = await optimiseStorage({
      output: captured.output, homeDir: f.home, databasePath: f.databasePath, registryNow: () => now,
      registryRunner: async (argv) => {
        const signature = argv.join(" ");
        if (signature === "pnpm store path") return { exitCode: 0, stdout: store, stderr: "" };
        if (signature === "pnpm --version") return { exitCode: 0, stdout: "ok", stderr: "" };
        if (signature === "pnpm store prune") {
          await rm(f.databasePath, { force: true });
          await mkdir(f.databasePath);
          return { exitCode: 0, stdout: "owner action succeeded", stderr: "" };
        }
        return { exitCode: 1, stdout: "", stderr: "unavailable" };
      },
    }, { force: true });
    expect(result.exitCode).toBe(0);
    const text = captured.lines.join("\n");
    expect(text).toContain("Removed/optimised: 1");
    expect(text).toContain("Audit warnings:");
    expect(text).toContain("STORAGE_OPTIMISE audit failed after apply");
  });
});
