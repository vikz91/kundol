import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { RegistryProbeResult } from "../../src/services/optimisation-registry";
import type { Output } from "../../src/shared/output";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2000-01-01T00:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function activeRegistry() {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "project.java.build_output");
  registry.rules[0]!.status = "published";
  return registry;
}

async function ageTree(current: string): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const child = path.join(current, entry.name);
    if (entry.isDirectory()) await ageTree(child);
    else await utimes(child, old, old);
  }
  await utimes(current, old, old);
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-java-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const workdir = path.join(root, "projects");
  const maven = path.join(workdir, "maven-app");
  const gradle = path.join(workdir, "gradle-app");
  const target = path.join(maven, "target");
  const build = path.join(gradle, "build");
  const mavenClass = path.join(target, "classes", "App.class");
  const gradleClass = path.join(build, "classes", "java", "main", "App.class");
  const pom = path.join(maven, "pom.xml");
  const gradleScript = path.join(gradle, "build.gradle.kts");
  await mkdir(home);
  await mkdir(path.dirname(mavenClass), { recursive: true });
  await mkdir(path.dirname(gradleClass), { recursive: true });
  await writeFile(mavenClass, "compiled Maven class");
  await writeFile(gradleClass, "compiled Gradle class");
  await writeFile(pom, '<project><modelVersion>4.0.0</modelVersion><groupId>dev.example</groupId><artifactId>app</artifactId><version>1.0</version></project>');
  await writeFile(gradleScript, "plugins { java }");
  await writeFile(path.join(gradle, "settings.gradle.kts"), 'rootProject.name = "gradle-app"');
  await ageTree(target);
  await ageTree(build);
  return { root, home, workdir, maven, gradle, target, build, mavenClass, gradleClass, pom, gradleScript, databasePath: path.join(root, "audit.db") };
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
    registryRunner: async () => { throw new Error("Java path adapter must not execute Maven or Gradle"); },
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "projects", f.workdir, ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

function selectedJava(plan: RegistryProbeResult, absolutePath: string) {
  const selected = plan.candidates.find((candidate) => candidate.ruleId === "project.java.build_output" &&
    candidate.target.kind === "path" && candidate.target.absolutePath === absolutePath);
  if (!selected) throw new Error(`Java candidate ${absolutePath} missing`);
  expect(selected.tier).toBe("review");
  return selected.id;
}

describe("verified Maven and Gradle build-output CLI", () => {
  test("discovers both exact owners but force cannot select explicit-review output", async () => {
    const f = await fixture();
    const captured = await runProjects(f, { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("Projects found: 2");
    expect(text).toContain("[review] Java build output");
    expect(text).toContain("Safe suggestions: 0");
    expect(text).toContain("Cancelled. No project targets were removed.");
    expect(await readFile(f.mavenClass, "utf8")).toBe("compiled Maven class");
    expect(await readFile(f.gradleClass, "utf8")).toBe("compiled Gradle class");
  });

  test("selecting Maven target removes only that tree and retains Gradle plus pinned data", async () => {
    const f = await fixture();
    const pinned = path.join(f.maven, "dependency-lock.txt");
    await writeFile(pinned, "pinned");
    const captured = await runProjects(f, { select: async (plan) => [selectedJava(plan, f.target)] });
    expect(captured.lines.join("\n")).toContain("Removed/optimised: 1");
    await expect(readFile(f.mavenClass, "utf8")).rejects.toThrow();
    expect(await readFile(f.gradleClass, "utf8")).toBe("compiled Gradle class");
    expect(await readFile(pinned, "utf8")).toBe("pinned");
    expect(await readFile(f.pom, "utf8")).toContain("artifactId");
  });

  test("selecting Gradle build removes only that tree and retains Maven target", async () => {
    const f = await fixture();
    const captured = await runProjects(f, { select: async (plan) => [selectedJava(plan, f.build)] });
    expect(captured.lines.join("\n")).toContain("Removed/optimised: 1");
    await expect(readFile(f.gradleClass, "utf8")).rejects.toThrow();
    expect(await readFile(f.mavenClass, "utf8")).toBe("compiled Maven class");
    expect(await readFile(f.gradleScript, "utf8")).toBe("plugins { java }");
  });

  test("owner configuration changed during review skips the selected output", async () => {
    const f = await fixture();
    const captured = await runProjects(f, { select: async (plan) => {
      const selected = selectedJava(plan, f.target);
      await writeFile(f.pom, '<project><modelVersion>4.0.0</modelVersion><artifactId>app</artifactId><build><directory>other</directory></build></project>');
      return [selected];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(f.mavenClass, "utf8")).toBe("compiled Maven class");
  });

  test("a retained release JAR inside Gradle build suppresses only that review target", async () => {
    const f = await fixture();
    const retained = path.join(f.build, "libs", "app.jar");
    await mkdir(path.dirname(retained));
    await writeFile(retained, "retained release");
    await ageTree(f.build);
    const captured = await runProjects(f, { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("Targets: 1");
    expect(await readFile(retained, "utf8")).toBe("retained release");
    expect(await readFile(f.mavenClass, "utf8")).toBe("compiled Maven class");
  });

  test("a reviewed Maven target replaced with an outside symlink cannot redirect removal", async () => {
    const f = await fixture();
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep.txt"), "outside data");
    const captured = await runProjects(f, { select: async (plan) => {
      const selected = selectedJava(plan, f.target);
      await rm(f.target, { recursive: true });
      await symlink(outside, f.target);
      return [selected];
    } });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("outside data");
    expect(await readFile(f.gradleClass, "utf8")).toBe("compiled Gradle class");
  });
});
