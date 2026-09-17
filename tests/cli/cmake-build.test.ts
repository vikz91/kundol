import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
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

function activeRegistry() {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "project.cmake.build");
  registry.rules[0]!.status = "published";
  return registry;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-cmake-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const workdir = path.join(root, "projects");
  const project = path.join(workdir, "demo");
  const build = path.join(project, "build");
  const marker = path.join(project, "CMakeLists.txt");
  const cache = path.join(build, "CMakeCache.txt");
  const object = path.join(build, "CMakeFiles", "app.dir", "main.o");
  await mkdir(home);
  await mkdir(path.dirname(object), { recursive: true });
  await writeFile(marker, "cmake_minimum_required(VERSION 3.20)\nproject(Demo)");
  await writeFile(cache, cacheText(project, build));
  await writeFile(object, "generated object");
  for (const item of [cache, object, path.dirname(object), path.join(build, "CMakeFiles"), build]) await utimes(item, old, old);
  return { root, home, workdir, project, build, marker, cache, object, databasePath: path.join(root, "audit.db") };
}

function cacheText(source: string, build: string) {
  return [
    `CMAKE_HOME_DIRECTORY:INTERNAL=${source}`,
    `CMAKE_CACHEFILE_DIR:INTERNAL=${build}`,
    "CMAKE_GENERATOR:INTERNAL=Ninja",
    "CMAKE_INSTALL_PREFIX:PATH=/usr/local",
  ].join("\n");
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
    output: captured.output, homeDir: f.home, databasePath: f.databasePath,
    registry: activeRegistry(), registryNow: () => now,
    registryRunner: async () => { throw new Error("CMake path adapter must not execute a project tool"); },
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "projects", f.workdir, ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

describe("verified CMake build CLI", () => {
  test("discovers a CMake-only project but force cannot select explicit-review builds", async () => {
    const f = await fixture();
    const captured = await runProjects(f, { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("Projects found: 1");
    expect(text).toContain("[review] CMake build directory");
    expect(text).toContain("Safe suggestions: 0");
    expect(text).toContain("Cancelled. No project targets were removed.");
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });

  test("explicit selection removes only the exact verified build tree", async () => {
    const f = await fixture();
    const retained = path.join(f.project, "release.pkg");
    await writeFile(retained, "keep outside build");
    const captured = await runProjects(f, { select: async (plan) => {
      const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.cmake.build")!;
      expect(selected.tier).toBe("review");
      return [selected.id];
    } });
    const text = captured.lines.join("\n");
    expect(text).toContain("Removed/optimised: 1");
    await expect(readFile(f.object, "utf8")).rejects.toThrow();
    expect(await readFile(retained, "utf8")).toBe("keep outside build");
    expect(await readFile(f.marker, "utf8")).toContain("project(Demo)");
  });

  test("changed cache ownership during review skips the selected build", async () => {
    const f = await fixture();
    const captured = await runProjects(f, { select: async (plan) => {
      const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.cmake.build")!;
      await writeFile(f.cache, cacheText(path.join(f.root, "other"), f.build));
      return [selected.id];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });

  test("a retained package inside build suppresses the review candidate", async () => {
    const f = await fixture();
    const retained = path.join(f.build, "release.zip");
    await writeFile(retained, "kept package");
    await utimes(retained, old, old);
    const captured = await runProjects(f, { force: true });
    expect(captured.lines.join("\n")).toContain("Targets: 0");
    expect(await readFile(retained, "utf8")).toBe("kept package");
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });
});
