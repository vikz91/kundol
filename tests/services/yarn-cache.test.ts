import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine } from "../../src/services/optimisation-registry";
import {
  YARN_CACHE_ACTION_ADAPTER_ID,
  YARN_CACHE_SELECTOR_ADAPTER_ID,
  createYarnCacheActionAdapter,
  createYarnCacheSelectorAdapter,
} from "../../src/services/optimisation-registry/yarn-cache";
import type { RegistryCommandResult, RegistryCommandRunner } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const temporaryRoots: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

function yarnRule(status: "beta" | "published" = "published"): OptimisationRegistry {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "store.yarn.cache");
  registry.rules[0]!.status = status;
  return registry;
}

async function fixture(custom = false): Promise<{ root: string; home: string; workspace: string; cache: string; allowedRoot: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-yarn-cache-"));
  temporaryRoots.push(root);
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const allowedRoot = custom ? path.join(root, "custom") : home;
  const cache = path.join(allowedRoot, "yarn-v6-cache");
  await mkdir(home);
  await mkdir(workspace);
  if (custom) await mkdir(allowedRoot);
  await writeFile(path.join(workspace, "package.json"), "{}\n");
  await mkdir(cache);
  const entry = path.join(cache, "module.tgz");
  await writeFile(entry, "cached");
  const old = new Date(Date.now() - 10 * DAY_MS);
  await utimes(entry, old, old);
  await utimes(cache, old, old);
  return { root, home, workspace, cache, allowedRoot };
}

function mockRunner(cache: string, calls: string[], version = "1.22.22", pathOverride?: () => string): RegistryCommandRunner {
  return async (argv, cwd): Promise<RegistryCommandResult> => {
    calls.push(`${cwd} :: ${argv.join(" ")}`);
    if (argv.join(" ") === "yarn --version") return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
    if (argv.join(" ") === "yarn --silent cache dir") return { exitCode: 0, stdout: `\r${pathOverride?.() ?? cache}\n`, stderr: "" };
    if (argv.slice(0, 5).join(" ") === "yarn --silent cache clean --cache-folder" && argv[5] === cache) {
      return { exitCode: 0, stdout: "success Cleared cache.\n", stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected or unbound command" };
  };
}

function engineFor(
  registry: OptimisationRegistry,
  fixture: { home: string; workspace: string; allowedRoot: string },
  runner: RegistryCommandRunner,
  includeCustomRoot: boolean,
) {
  const owner = { runner, now: () => new Date() };
  return new OptimisationRegistryEngine({
    registry,
    context: {
      homeDir: fixture.home,
      projectRoots: [],
      commandCwd: fixture.workspace,
      ...(includeCustomRoot ? { userRoots: [fixture.allowedRoot] } : {}),
    },
    runner,
    selectorAdapters: { [YARN_CACHE_SELECTOR_ADAPTER_ID]: createYarnCacheSelectorAdapter(owner) },
    actionAdapters: { [YARN_CACHE_ACTION_ADAPTER_ID]: createYarnCacheActionAdapter(owner) },
    validators: { tool_available: async () => true, target_exists: async () => true, tool_idle: async () => true },
    audit: async () => {},
  });
}

describe("Yarn Classic exact-path cache adapter", () => {
  test("selects one Classic cache under an explicit custom root, never a whole home", async () => {
    const item = await fixture(true);
    const calls: string[] = [];
    const engine = engineFor(yarnRule(), item, mockRunner(item.cache, calls), true);
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.target.kind).toBe("path");
    expect(plan.candidates[0]?.tier).toBe("review");
    expect(engine.review(plan, { force: true }).selected).toHaveLength(0);
    const selected = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(selected);
    expect(result.applied).toHaveLength(1);
    expect(result.knownReclaimedBytes).toBe(0);
    expect(calls.filter((call) => call.includes("cache clean"))).toEqual([
      `${item.workspace} :: yarn --silent cache clean --cache-folder ${item.cache}`,
    ]);
  });

  test("beta rule requires opt-in and then keeps explicit-review semantics", async () => {
    const item = await fixture();
    const calls: string[] = [];
    const engine = engineFor(yarnRule("beta"), item, mockRunner(item.cache, calls), false);
    expect((await engine.probe()).candidates).toHaveLength(0);
    const plan = await engine.probe({ includeBeta: true });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.status).toBe("beta");
    expect(engine.review(plan, { force: true }).selected).toHaveLength(0);
    const review = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    expect((await engine.apply(review)).applied).toHaveLength(1);
  });

  test("skips Berry and later instead of assuming Classic cache flags", async () => {
    const item = await fixture();
    const calls: string[] = [];
    const plan = await engineFor(yarnRule(), item, mockRunner(item.cache, calls, "4.5.0"), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules[0]?.reason).toContain("Modern Yarn");
    expect(calls.some((call) => call.includes("cache clean"))).toBe(false);
  });

  test("refuses repository Yarn delegation before invoking owner commands", async () => {
    const item = await fixture();
    await writeFile(path.join(item.workspace, ".yarnrc.yml"), "yarnPath: .yarn/releases/custom.cjs\n");
    const calls: string[] = [];
    const plan = await engineFor(yarnRule(), item, mockRunner(item.cache, calls), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules[0]?.reason).toContain("delegated Yarn CLI");
    expect(calls).toHaveLength(0);
  });

  test("does not inventory a custom path outside approved user roots", async () => {
    const item = await fixture(true);
    const calls: string[] = [];
    const plan = await engineFor(yarnRule(), item, mockRunner(item.cache, calls), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules[0]?.reason).toContain("outside approved user roots");
  });

  test("skips a changed owner cache path before any action", async () => {
    const item = await fixture();
    const alternative = path.join(item.home, "other-cache");
    await mkdir(alternative);
    let reported = item.cache;
    const calls: string[] = [];
    const engine = engineFor(yarnRule(), item, mockRunner(item.cache, calls, "1.22.22", () => reported), false);
    const plan = await engine.probe();
    reported = alternative;
    const selected = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(selected);
    expect(result.skipped).toHaveLength(1);
    expect(calls.some((call) => call.includes("cache clean"))).toBe(false);
  });

  test("rejects recently changed cache contents even if generic idle validation passes", async () => {
    const item = await fixture();
    await writeFile(path.join(item.cache, "recent"), "new");
    const calls: string[] = [];
    const engine = engineFor(yarnRule(), item, mockRunner(item.cache, calls), false);
    const plan = await engine.probe();
    const selected = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(selected);
    expect(result.failed[0]?.error).toContain("changed within the last 7 days");
    expect(calls.some((call) => call.includes("cache clean"))).toBe(false);
  });
});
