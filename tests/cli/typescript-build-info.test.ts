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
  registry.rules = registry.rules.filter((rule) => rule.id === "project.typescript.build_info");
  registry.rules[0]!.status = "published";
  return registry;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-ts-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const workdir = path.join(root, "projects");
  await mkdir(home);
  await mkdir(workdir);
  return { root, home, workdir, databasePath: path.join(root, "audit.db") };
}

async function projectWithBuildInfo(workdir: string, name: string) {
  const project = path.join(workdir, name);
  await mkdir(project);
  const config = path.join(project, "tsconfig.json");
  const info = path.join(project, `${name}.tsbuildinfo`);
  await writeFile(config, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "${name}.tsbuildinfo" } }`);
  await writeFile(info, "generated metadata");
  await utimes(info, old, old);
  return { project, config, info };
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
    registryRunner: async () => { throw new Error("TypeScript path adapter must not invoke an owner tool"); },
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "projects", f.workdir, ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

describe("configured TypeScript build-info CLI", () => {
  test("discovers a tsconfig-only project and force-removes just generated metadata", async () => {
    const f = await fixture();
    const { project, config, info } = await projectWithBuildInfo(f.workdir, "app");
    const retained = path.join(project, "release.js");
    await writeFile(retained, "keep release");

    const captured = await runProjects(f, { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("Projects found: 1");
    expect(text).toContain("[safe] TypeScript incremental build info");
    expect(text).toContain("Safe suggestions: 1");
    expect(text).toContain("Removed/optimised: 1");
    await expect(readFile(info, "utf8")).rejects.toThrow();
    expect(await readFile(config, "utf8")).toContain("tsBuildInfoFile");
    expect(await readFile(retained, "utf8")).toBe("keep release");
  });

  test("config change during review skips action and preserves metadata", async () => {
    const f = await fixture();
    const { config, info } = await projectWithBuildInfo(f.workdir, "changed");
    const captured = await runProjects(f, { select: async (plan) => {
      const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.typescript.build_info")!;
      await writeFile(config, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "other.tsbuildinfo" } }`);
      return [selected.id];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(info, "utf8")).toBe("generated metadata");
  });

  test("selecting one of eight roots preserves every unselected build-info file", async () => {
    const f = await fixture();
    const projects: Awaited<ReturnType<typeof projectWithBuildInfo>>[] = [];
    for (let index = 0; index < 8; index++) projects.push(await projectWithBuildInfo(f.workdir, `project-${index}`));
    const captured = await runProjects(f, { select: async (plan) => {
      expect(plan.candidates).toHaveLength(projects.length);
      const selected = plan.candidates.find((candidate) => candidate.target.kind === "path" &&
        candidate.target.absolutePath === projects[3]!.info)!;
      return [selected.id];
    } });
    const text = captured.lines.join("\n");
    expect(text).toContain("Projects found: 8");
    expect(text).toContain("Removed/optimised: 1");
    for (let index = 0; index < projects.length; index++) {
      if (index === 3) await expect(readFile(projects[index]!.info, "utf8")).rejects.toThrow();
      else expect(await readFile(projects[index]!.info, "utf8")).toBe("generated metadata");
    }
  });
});
