import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { RegistryProbeResult } from "../../src/services/optimisation-registry";
import type { Output } from "../../src/shared/output";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function dotnetRegistry() {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "project.dotnet.obj" || rule.id === "project.dotnet.bin");
  return registry;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-dotnet-obj-"));
  roots.push(root);
  const home = path.join(root, "home");
  const workdir = path.join(root, "projects");
  await mkdir(home);
  await mkdir(workdir);
  return { root, home, workdir, databasePath: path.join(root, "audit.db") };
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; } catch { return false; }
}

async function age(target: string, children: readonly string[] = []) {
  for (const child of children) await utimes(child, old, old);
  await utimes(target, old, old);
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

async function runProjects(
  f: Awaited<ReturnType<typeof fixture>>,
  options: { force?: boolean; select?: (plan: RegistryProbeResult) => Promise<readonly string[]> } = {},
) {
  const captured = capturedOutput();
  await createProgram({
    output: captured.output,
    registry: dotnetRegistry(),
    homeDir: f.home,
    databasePath: f.databasePath,
    registryNow: () => now,
    registryRunner: async () => { throw new Error("no owner command should run for generated .NET paths"); },
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "projects", f.workdir, ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

describe("published .NET obj intermediates", () => {
  test("force removes only idle project-local obj, leaving bin releases and protected files", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "app");
    await mkdir(project);
    await writeFile(path.join(project, "app.csproj"), "<Project />");
    await writeFile(path.join(project, ".env"), "keep secret");
    await mkdir(path.join(project, ".git"));
    const obj = path.join(project, "obj");
    const bin = path.join(project, "bin");
    await mkdir(obj);
    await mkdir(bin);
    await writeFile(path.join(obj, "app.assets.json"), "generated");
    await writeFile(path.join(bin, "app.dll"), "retained release");
    await age(obj, [path.join(obj, "app.assets.json")]);
    await age(bin, [path.join(bin, "app.dll")]);

    const captured = await runProjects(f, { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("[safe] .NET obj intermediates");
    expect(text).not.toContain("[review] .NET bin final output");
    expect(text).toContain("Safe suggestions: 1");
    expect(text).toContain("Removed/optimised: 1");
    expect(await exists(obj)).toBe(false);
    expect(await readFile(path.join(bin, "app.dll"), "utf8")).toBe("retained release");
    expect(await readFile(path.join(project, ".env"), "utf8")).toBe("keep secret");
    expect(await exists(path.join(project, ".git"))).toBe(true);
  });

  test("a solution-only obj folder is not treated as owned project output", async () => {
    const f = await fixture();
    const solution = path.join(f.workdir, "solution");
    await mkdir(solution);
    await writeFile(path.join(solution, "demo.sln"), "");
    const obj = path.join(solution, "obj");
    await mkdir(obj);
    await writeFile(path.join(obj, "keep.txt"), "user data");
    await age(obj, [path.join(obj, "keep.txt")]);

    const captured = await runProjects(f, { force: true });
    expect(captured.lines.join("\n")).toContain("Safe suggestions: 0");
    expect(await readFile(path.join(obj, "keep.txt"), "utf8")).toBe("user data");
  });

  test("recent obj content fails the quiet-period check before deletion", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "active");
    await mkdir(project);
    await writeFile(path.join(project, "active.csproj"), "<Project />");
    const obj = path.join(project, "obj");
    await mkdir(obj);
    const recent = path.join(obj, "recent.txt");
    await writeFile(recent, "still active");
    await utimes(obj, old, old);

    const captured = await runProjects(f, { force: true });
    expect(captured.lines.join("\n")).toContain("Targets: 0");
    expect(await readFile(recent, "utf8")).toBe("still active");
  });

  test("a reviewed obj replaced by a symlink cannot redirect removal", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "swapped");
    const outside = path.join(f.root, "outside");
    await mkdir(project);
    await mkdir(outside);
    await writeFile(path.join(project, "swapped.csproj"), "<Project />");
    await writeFile(path.join(outside, "keep.txt"), "outside data");
    const obj = path.join(project, "obj");
    await mkdir(obj);
    await age(obj);

    const captured = await runProjects(f, { select: async (plan) => {
      const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.dotnet.obj")!;
      await rm(obj, { recursive: true });
      await symlink(outside, obj);
      return [selected.id];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("outside data");
  });

  test("removing the csproj marker after review skips the selected obj", async () => {
    const f = await fixture();
    const project = path.join(f.workdir, "changed");
    await mkdir(project);
    const marker = path.join(project, "changed.csproj");
    await writeFile(marker, "<Project />");
    const obj = path.join(project, "obj");
    await mkdir(obj);
    await age(obj);

    const captured = await runProjects(f, { select: async (plan) => {
      const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.dotnet.obj")!;
      await rm(marker);
      return [selected.id];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await exists(obj)).toBe(true);
  });

  test("bounded nested discovery plans one obj per project without scanning bin", async () => {
    const f = await fixture();
    const targetCount = 8;
    const group = path.join(f.workdir, "nested-modules");
    for (let index = 0; index < targetCount; index++) {
      const project = path.join(group, `project-${index}`);
      const obj = path.join(project, "obj");
      const bin = path.join(project, "bin");
      await mkdir(obj, { recursive: true });
      await mkdir(bin);
      await writeFile(path.join(project, `project-${index}.csproj`), "<Project />");
      await writeFile(path.join(obj, "cache.bin"), "1234");
      await writeFile(path.join(bin, "release.dll"), "keep");
      await age(obj, [path.join(obj, "cache.bin")]);
      await age(bin, [path.join(bin, "release.dll")]);
    }

    const captured = await runProjects(f);
    const text = captured.lines.join("\n");
    expect(text).toContain(`Projects found: ${targetCount}`);
    expect(text).toContain(`Targets: ${targetCount}`);
    expect(text).toContain(`Safe suggestions: ${targetCount}`);
    expect(text).toContain("Known target footprint: 32 B");
    expect(text).toContain("Cancelled. No project targets were removed.");
    for (let index = 0; index < targetCount; index++) {
      expect(await exists(path.join(group, `project-${index}`, "obj"))).toBe(true);
      expect(await exists(path.join(group, `project-${index}`, "bin"))).toBe(true);
    }
  });
});
