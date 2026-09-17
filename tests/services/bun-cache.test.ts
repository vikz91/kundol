import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, symlink, utimes, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine } from "../../src/services/optimisation-registry";
import {
  BUN_CACHE_ACTION_ADAPTER_ID,
  BUN_CACHE_SELECTOR_ADAPTER_ID,
  createBunCacheActionAdapter,
  createBunCacheSelectorAdapter,
} from "../../src/services/optimisation-registry/bun-cache";
import type { RegistryCommandResult, RegistryCommandRunner } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const temporaryRoots: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

function bunRule(): OptimisationRegistry {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "store.bun.cache");
  const rule = registry.rules[0]!;
  rule.status = "published";
  rule.selector = { kind: "adapter", adapterId: BUN_CACHE_SELECTOR_ADAPTER_ID };
  return registry;
}

async function fixture(custom = false): Promise<{ root: string; home: string; workspace: string; cache: string; allowedRoot: string }> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "kundol-bun-cache-")));
  temporaryRoots.push(root);
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  const allowedRoot = custom ? path.join(root, "custom") : home;
  const cache = path.join(allowedRoot, "bun-cache");
  await mkdir(home);
  await mkdir(workspace);
  if (custom) await mkdir(allowedRoot);
  await writeFile(path.join(workspace, "package.json"), "{}\n");
  await mkdir(cache);
  const entry = path.join(cache, "package.tgz");
  await writeFile(entry, "cached");
  const old = new Date(Date.now() - 10 * DAY_MS);
  await utimes(entry, old, old);
  await utimes(cache, old, old);
  return { root, home, workspace, cache, allowedRoot };
}

function mockRunner(cache: string, calls: string[], pathOverride?: () => string): RegistryCommandRunner {
  return async (argv, cwd): Promise<RegistryCommandResult> => {
    calls.push(`${cwd} :: ${argv.join(" ")}`);
    if (argv.join(" ") === "bun pm cache") return { exitCode: 0, stdout: `${pathOverride?.() ?? cache}\n`, stderr: "" };
    if (argv.join(" ") === "bun --version") return { exitCode: 0, stdout: "1.4.2\n", stderr: "" };
    if (argv.join(" ") === "bun pm cache rm") return { exitCode: 0, stdout: "cleared\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "unexpected command" };
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
    selectorAdapters: { [BUN_CACHE_SELECTOR_ADAPTER_ID]: createBunCacheSelectorAdapter(owner) },
    actionAdapters: { [BUN_CACHE_ACTION_ADAPTER_ID]: createBunCacheActionAdapter(owner) },
    validators: { tool_available: async () => true, tool_idle: async () => true, target_exists: async () => true },
    audit: async () => {},
  });
}

describe("Bun whole-cache owner adapter", () => {
  test("reviews one non-home cache through an explicit containing root and selected workspace", async () => {
    const item = await fixture(true);
    const calls: string[] = [];
    const runner = mockRunner(item.cache, calls);
    const engine = engineFor(bunRule(), item, runner, true);
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.target.kind).toBe("path");
    expect(plan.candidates[0]?.tier).toBe("review");
    expect(engine.review(plan, { force: true }).selected).toHaveLength(0);
    const review = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(review);
    expect(result.applied).toHaveLength(1);
    expect(result.knownReclaimedBytes).toBe(0);
    expect(calls.filter((call) => call.endsWith("bun pm cache rm"))).toEqual([`${item.workspace} :: bun pm cache rm`]);
  });

  test("rejects a custom cache unless its containing user root is explicitly approved", async () => {
    const item = await fixture(true);
    const calls: string[] = [];
    const engine = engineFor(bunRule(), item, mockRunner(item.cache, calls), false);
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules[0]?.reason).toContain("outside approved user roots");
    expect(calls.some((call) => call.endsWith("bun pm cache rm"))).toBe(false);
  });

  test("fails closed when the selected workspace has no package.json", async () => {
    const item = await fixture();
    await rm(path.join(item.workspace, "package.json"));
    const calls: string[] = [];
    const plan = await engineFor(bunRule(), item, mockRunner(item.cache, calls), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(calls.some((call) => call.includes("bun pm cache"))).toBe(false);
  });

  test("rechecks the owner-reported cache path before a whole-cache action", async () => {
    const item = await fixture();
    const second = path.join(item.home, "different-cache");
    await mkdir(second);
    let owner = item.cache;
    const calls: string[] = [];
    const runner = mockRunner(item.cache, calls, () => owner);
    const engine = engineFor(bunRule(), item, runner, false);
    const plan = await engine.probe();
    owner = second;
    const reviewed = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(reviewed);
    expect(result.skipped).toHaveLength(1);
    expect(calls.some((call) => call.endsWith("bun pm cache rm"))).toBe(false);
  });

  test("refuses a recent cache tree even when a caller's generic idle validator passes", async () => {
    const item = await fixture();
    await writeFile(path.join(item.cache, "new-entry"), "recent");
    const calls: string[] = [];
    const engine = engineFor(bunRule(), item, mockRunner(item.cache, calls), false);
    const plan = await engine.probe();
    const reviewed = engine.review(plan, { force: false, confirmed: true, selectedIds: [plan.candidates[0]!.id] });
    const result = await engine.apply(reviewed);
    expect(result.failed[0]?.error).toContain("changed within the last 7 days");
    expect(calls.some((call) => call.endsWith("bun pm cache rm"))).toBe(false);
  });

  test("rejects symlink cache ancestry before listing a reviewable target", async () => {
    const item = await fixture();
    const link = path.join(item.home, "cache-link");
    await symlink(item.cache, link);
    const calls: string[] = [];
    const plan = await engineFor(bunRule(), item, mockRunner(link, calls), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules[0]?.reason).toContain("unsafe");
  });
});
