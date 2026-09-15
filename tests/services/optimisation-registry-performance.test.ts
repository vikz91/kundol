import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine, createCliRegistryEngine } from "../../src/services/optimisation-registry";
import { hasRecentChanges } from "../../src/services/optimisation-registry/cli-bindings";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-registry-performance-"));
  temporaryRoots.push(root);
  const home = path.join(root, "home");
  await mkdir(home);
  return { root, home };
}

function nodeModulesRegistry(): OptimisationRegistry {
  const registry = structuredClone(catalogue);
  registry.integration = "engine_ready";
  registry.rules = registry.rules.filter((rule) => rule.id === "project.node_modules");
  registry.rules[0]!.status = "published";
  return registry;
}

async function projectWithTarget(root: string, name: string): Promise<{ project: string; target: string }> {
  const project = path.join(root, name);
  const target = path.join(project, "node_modules");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(project, "package.json"), "{}");
  await writeFile(path.join(target, "generated.js"), "12345");
  return { project, target };
}

describe("registry probe and apply traversal costs", () => {
  test("checks activity on identity-only targets before measuring their trees", async () => {
    const { root, home } = await fixture();
    const { project } = await projectWithTarget(root, "busy-project");
    const seenSizes: (number | null)[] = [];
    const engine = new OptimisationRegistryEngine({
      registry: nodeModulesRegistry(),
      context: { homeDir: home, projectRoots: [project] },
      validators: {
        target_not_active: async (_rule, candidate) => {
          seenSizes.push(candidate.target.sizeBytes);
          return "target was recently active";
        },
      },
      audit: async () => {},
    });
    const probe = await engine.probe();
    expect(seenSizes).toEqual([null]);
    expect(probe.candidates).toHaveLength(0);

    const inactive = new OptimisationRegistryEngine({
      registry: nodeModulesRegistry(),
      context: { homeDir: home, projectRoots: [project] },
      validators: { target_not_active: async () => true },
      audit: async () => {},
    });
    const eligible = await inactive.probe();
    expect(eligible.candidates[0]?.target.sizeBytes).toBe(5);
    expect(eligible.knownBytes).toBe(5);
  });

  test("bounds size measurement and marks partial tree sizes as unknown", async () => {
    const { root } = await fixture();
    const { project, target } = await projectWithTarget(root, "large-project");
    await writeFile(path.join(target, "second.js"), "123");
    await writeFile(path.join(target, "third.js"), "12");
    const limited = await capturePathTarget(target, project, "directory", true, 2);
    expect(limited.sizeBytes).toBeNull();
    const complete = await capturePathTarget(target, project, "directory", true, 3);
    expect(complete.sizeBytes).toBe(10);
  });

  test("re-probes each selected generated path rather than every remaining project", async () => {
    const { root, home } = await fixture();
    const projects = await Promise.all(Array.from({ length: 8 }, (_, index) => projectWithTarget(root, `project-${index}`)));
    let activityChecks = 0;
    const engine = new OptimisationRegistryEngine({
      registry: nodeModulesRegistry(),
      context: { homeDir: home, projectRoots: projects.map(({ project }) => project) },
      validators: { target_not_active: async () => { activityChecks++; return true; } },
      audit: async () => {},
    });
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(projects.length);
    expect(plan.knownBytes).toBe(5 * projects.length);
    const result = await engine.apply(engine.review(plan, { force: true }));
    expect(result.applied).toHaveLength(projects.length);
    expect(result.failed).toHaveLength(0);
    expect(result.knownReclaimedBytes).toBe(5 * projects.length);
    expect(activityChecks).toBe(3 * projects.length);
  });

  test("CLI quiet-period rejection leaves recent generated directories out of the plan", async () => {
    const { root, home } = await fixture();
    const { project } = await projectWithTarget(root, "recent-project");
    const engine = createCliRegistryEngine({
      registry: nodeModulesRegistry(),
      context: { homeDir: home, projectRoots: [project] },
      now: () => new Date(),
      audit: async () => {},
    });
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.knownBytes).toBe(0);
  });

  test("streams activity checks and rejects trees beyond the entry limit", async () => {
    const { root } = await fixture();
    const target = path.join(root, "generated");
    await mkdir(target);
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    for (let index = 0; index < 3; index++) {
      const child = path.join(target, `artifact-${index}`);
      await writeFile(child, "generated");
      await utimes(child, old, old);
    }
    await utimes(target, old, old);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(await hasRecentChanges(target, cutoff, 4)).toBe(false);
    await expect(hasRecentChanges(target, cutoff, 3)).rejects.toThrow("target has too many entries to verify activity");
  });
});
