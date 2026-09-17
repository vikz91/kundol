import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine } from "../../src/services/optimisation-registry";
import {
  CONDA_SAFE_ACTION_ADAPTER_ID, CONDA_SAFE_RULE_ID, CONDA_SAFE_SELECTOR_ADAPTER_ID,
  createCondaSafeCacheActionAdapter, createCondaSafeCacheSelectorAdapter, runCondaPinnedCommand,
  type CondaPinnedRunner,
} from "../../src/services/optimisation-registry/conda-safe-cache";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function safeRuleRegistry() {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => rule.id === "store.conda.cache");
  const rule = registry.rules[0]!;
  rule.id = CONDA_SAFE_RULE_ID;
  rule.status = "published";
  rule.selector = { kind: "adapter", adapterId: CONDA_SAFE_SELECTOR_ADAPTER_ID, variants: ["tarball", "index", "log"] };
  rule.action = { kind: "adapter", adapterId: CONDA_SAFE_ACTION_ADAPTER_ID };
  delete rule.probeCommands;
  return registry;
}

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "kundol-conda-safe-")));
  roots.push(root);
  const home = path.join(root, "home");
  const cache = path.join(home, "conda-pkgs");
  const sibling = path.join(root, "outside-sibling-cache");
  const env = path.join(home, "envs", "demo");
  await mkdir(path.join(cache, "cache"), { recursive: true });
  await mkdir(path.join(cache, ".logs"));
  await mkdir(path.join(sibling, "cache"), { recursive: true });
  await mkdir(path.join(sibling, ".logs"));
  await mkdir(env, { recursive: true });
  const tarball = path.join(cache, "fixture.conda");
  const index = path.join(cache, "cache");
  const logfile = path.join(cache, ".logs", "fixture.log");
  const siblingTarball = path.join(sibling, "sibling.conda");
  const siblingIndex = path.join(sibling, "cache", "index.json");
  const siblingLog = path.join(sibling, ".logs", "sibling.log");
  for (const entry of [path.join(cache, "urls.txt"), tarball, path.join(index, "index.json"), logfile,
    path.join(sibling, "urls.txt"), siblingTarball, siblingIndex, siblingLog]) {
    await writeFile(entry, "cached");
    await utimes(entry, old, old);
  }
  for (const directory of [index, path.join(cache, ".logs"), cache, sibling, path.join(sibling, "cache"),
    path.join(sibling, ".logs")]) await utimes(directory, old, old);
  return { root, home, cache, sibling, env, tarball, index, logfile, siblingTarball, siblingIndex, siblingLog };
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; } catch { return false; }
}

async function preview(f: Awaited<ReturnType<typeof fixture>>) {
  const tarballPresent = await exists(f.tarball);
  const indexPresent = await exists(f.index);
  const logPresent = await exists(f.logfile);
  const tarballSize = tarballPresent ? (await lstat(f.tarball)).size : 0;
  return {
    success: true,
    tarballs: {
      warnings: [], pkg_sizes: tarballPresent ? { [f.cache]: { "fixture.conda": tarballSize } } : {},
      pkgs_dirs: tarballPresent ? { [f.cache]: ["fixture.conda"] } : {}, total_size: tarballSize,
    },
    index_cache: { files: indexPresent ? [f.index] : [] },
    logfiles: logPresent ? [f.logfile] : [],
  };
}

function ownerRunner(
  f: Awaited<ReturnType<typeof fixture>>,
  calls: { argv: string; cwd: string; environment: Record<string, string> }[],
  options: { active?: boolean; symlinkEnv?: string; escapedPreview?: boolean; truncated?: boolean; failAction?: boolean } = {},
): CondaPinnedRunner {
  return async (argv, cwd, environment) => {
    const override = { ...environment } as Record<string, string>;
    calls.push({ argv: argv.join(" "), cwd, environment: override });
    const pinned = override.CONDA_PKGS_DIRS;
    if (argv[1] === "info") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          pkgs_dirs: pinned ? [pinned] : [f.cache, f.sibling],
          envs: [options.symlinkEnv ?? f.env], active_prefix: options.active ? f.env : null,
          envs_details: { [f.env]: { active: options.active ?? false } },
        }), stderr: "", truncated: options.truncated ?? false,
      };
    }
    const current = await preview(f);
    if (argv.includes("--dry-run")) {
      if (options.escapedPreview) current.logfiles = [path.join(f.sibling, ".logs", "sibling.log")];
      return { exitCode: 0, stdout: JSON.stringify(current), stderr: "", truncated: options.truncated ?? false };
    }
    if (options.failAction) return { exitCode: 1, stdout: "", stderr: "owner action failed" };
    if (!pinned || pinned !== f.cache || argv.includes("--all") || argv.includes("--packages")) {
      return { exitCode: 1, stdout: "", stderr: "unreviewed Conda clean" };
    }
    const category = argv.includes("--tarballs") ? "tarballs" : argv.includes("--index-cache") ? "index_cache" : "logfiles";
    if (category === "tarballs") await rm(f.tarball);
    else if (category === "index_cache") await rm(f.index, { recursive: true });
    else await rm(f.logfile);
    return { exitCode: 0, stdout: JSON.stringify({ success: true, [category]: current[category] }), stderr: "" };
  };
}

function engineFor(f: Awaited<ReturnType<typeof fixture>>, runner: CondaPinnedRunner) {
  const options = { runner, now: () => now };
  return new OptimisationRegistryEngine({
    registry: safeRuleRegistry(),
    context: { homeDir: f.home, projectRoots: [], commandCwd: f.home },
    selectorAdapters: { [CONDA_SAFE_SELECTOR_ADAPTER_ID]: createCondaSafeCacheSelectorAdapter(options) },
    actionAdapters: { [CONDA_SAFE_ACTION_ADAPTER_ID]: createCondaSafeCacheActionAdapter(options) },
    validators: {
      tool_available: async () => true, target_exists: async () => true,
      resource_still_unused: async () => true, symlink_env_checked: async () => true,
    },
    audit: async () => {},
  });
}

describe("separate Conda safe-cache category aggregates", () => {
  test("reviews three category aggregates and pins only a selected tarball clean to one approved root", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const engine = engineFor(f, ownerRunner(f, calls));
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(3);
    expect(plan.candidates.every((candidate) => candidate.tier === "review" && candidate.target.kind === "resource")).toBe(true);
    expect(engine.review(plan, { force: true }).selected).toHaveLength(0);
    const tarball = plan.candidates.find((candidate) => candidate.target.kind === "resource" && candidate.target.resourceId.startsWith("tarball:"))!;
    const applied = await engine.apply(engine.review(plan, { force: false, confirmed: true, selectedIds: [tarball.id] }));
    expect(applied.applied).toHaveLength(1);
    expect(calls.filter((call) => call.argv.includes("--yes"))).toEqual([{
      argv: "conda clean --tarballs --yes --json", cwd: f.home, environment: { CONDA_PKGS_DIRS: f.cache },
    }]);
    expect(calls.some((call) => call.argv.includes("--all") || call.argv.includes("--packages"))).toBe(false);
    expect(await exists(f.tarball)).toBe(false);
    for (const retained of [path.join(f.index, "index.json"), f.logfile, f.siblingTarball, f.siblingIndex, f.siblingLog]) {
      expect(await exists(retained)).toBe(true);
    }
  });

  test("pinned index and log actions affect only their reviewed categories", async () => {
    for (const selectedCategory of ["index:", "log:"]) {
      const f = await fixture();
      const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
      const engine = engineFor(f, ownerRunner(f, calls));
      const plan = await engine.probe();
      const selected = plan.candidates.find((candidate) => candidate.target.kind === "resource" &&
        candidate.target.resourceId.startsWith(selectedCategory))!;
      const applied = await engine.apply(engine.review(plan, { force: false, confirmed: true, selectedIds: [selected.id] }));
      expect(applied.applied).toHaveLength(1);
      expect(calls.filter((call) => call.argv.includes("--yes"))).toHaveLength(1);
      expect(await exists(selectedCategory === "index:" ? f.index : f.logfile)).toBe(false);
      expect(await exists(f.tarball)).toBe(true);
      for (const retained of [f.siblingTarball, f.siblingIndex, f.siblingLog]) expect(await exists(retained)).toBe(true);
    }
  });

  test("an active or symlinked known environment blocks every category before preview", async () => {
    const f = await fixture();
    const link = path.join(f.home, "linked-env");
    await symlink(f.env, link);
    for (const options of [{ active: true }, { symlinkEnv: link }]) {
      const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
      const plan = await engineFor(f, ownerRunner(f, calls, options)).probe();
      expect(plan.candidates).toHaveLength(0);
      expect(calls.every((call) => call.argv === "conda info --json")).toBe(true);
    }
  });

  test("escaped or truncated owner preview never creates a reviewable aggregate", async () => {
    const f = await fixture();
    for (const options of [{ escapedPreview: true }, { truncated: true }]) {
      const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
      const plan = await engineFor(f, ownerRunner(f, calls, options)).probe();
      expect(plan.candidates).toHaveLength(0);
      expect(calls.some((call) => call.argv.includes("--yes"))).toBe(false);
    }
  });

  test("recent data and an index symlink prevent their respective aggregates", async () => {
    const f = await fixture();
    await writeFile(f.tarball, "recent update");
    const link = path.join(f.index, "outside-link");
    await symlink(f.sibling, link);
    await utimes(f.index, old, old);
    const plan = await engineFor(f, ownerRunner(f, [])).probe();
    expect(plan.candidates.map((candidate) => candidate.target.kind === "resource" ? candidate.target.resourceId.split(":")[0] : "path")).toEqual(["log"]);
  });

  test("a changed aggregate or failed owner action never claims a successful clear", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const engine = engineFor(f, ownerRunner(f, calls));
    const plan = await engine.probe();
    const tarball = plan.candidates.find((candidate) => candidate.target.kind === "resource" && candidate.target.resourceId.startsWith("tarball:"))!;
    await writeFile(f.tarball, "modified");
    const changed = await engine.apply(engine.review(plan, { force: false, confirmed: true, selectedIds: [tarball.id] }));
    expect(changed.applied).toHaveLength(0);
    expect(calls.some((call) => call.argv.includes("--yes"))).toBe(false);
    const another = await fixture();
    const failing = engineFor(another, ownerRunner(another, [], { failAction: true }));
    const fresh = await failing.probe();
    const selected = fresh.candidates.find((candidate) => candidate.target.kind === "resource" && candidate.target.resourceId.startsWith("tarball:"))!;
    const result = await failing.apply(failing.review(fresh, { force: false, confirmed: true, selectedIds: [selected.id] }));
    expect(result.failed).toHaveLength(1);
    expect(await exists(another.tarball)).toBe(true);
  });

  test("default runner rejects aggregate --all, extracted packages, and unpinned clean without spawning Conda", async () => {
    for (const argv of [
      ["conda", "clean", "--all", "--yes", "--json"],
      ["conda", "clean", "--packages", "--yes", "--json"],
      ["conda", "clean", "--tarballs", "--yes", "--json"],
    ]) expect((await runCondaPinnedCommand(argv, "/tmp", {})).exitCode).toBe(1);
  });
});
