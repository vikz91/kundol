import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine } from "../../src/services/optimisation-registry";
import {
  NUGET_HTTP_ACTION_ADAPTER_ID,
  NUGET_HTTP_SELECTOR_ADAPTER_ID,
  NUGET_PACKAGES_ACTION_ADAPTER_ID,
  NUGET_PACKAGES_SELECTOR_ADAPTER_ID,
  createNugetCacheActionAdapter,
  createNugetCacheSelectorAdapter,
  runNugetPinnedCommand,
  type NugetPinnedRunner,
} from "../../src/services/optimisation-registry/nuget-cache";
import type { RegistryCommandResult } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const temporaryRoots: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

function nugetRules(): OptimisationRegistry {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => ["store.nuget.http_cache", "store.nuget.global_packages"].includes(rule.id));
  for (const rule of registry.rules) rule.status = "published";
  return registry;
}

async function fixture(): Promise<{ root: string; home: string; external: string; http: string; packages: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-nuget-cache-"));
  temporaryRoots.push(root);
  const home = path.join(root, "home");
  const external = path.join(root, "external");
  const http = path.join(external, "http-cache");
  const packages = path.join(external, "global-packages");
  await mkdir(home);
  await mkdir(http, { recursive: true });
  await mkdir(packages);
  const old = new Date(Date.now() - 10 * DAY_MS);
  for (const store of [http, packages]) {
    const entry = path.join(store, "cached-item");
    await writeFile(entry, "cached");
    await utimes(entry, old, old);
    await utimes(store, old, old);
  }
  return { root, home, external, http, packages };
}

function mockRunner(
  item: { http: string; packages: string },
  calls: { argv: string; cwd: string; environment: Record<string, string> }[],
  ignoreOverride = false,
): NugetPinnedRunner {
  return async (argv, cwd, environment): Promise<RegistryCommandResult> => {
    const env = { ...environment } as Record<string, string>;
    calls.push({ argv: argv.join(" "), cwd, environment: env });
    const store = argv[3];
    const ownerPath = store === "http-cache" ? item.http : item.packages;
    const key = store === "http-cache" ? "NUGET_HTTP_CACHE_PATH" : "NUGET_PACKAGES";
    const selected = !ignoreOverride && env[key] ? env[key] : ownerPath;
    if (argv[4] === "--list") {
      const prefix = store === "http-cache" ? "info : " : "";
      return { exitCode: 0, stdout: `${prefix}${store}: ${selected}\n`, stderr: "" };
    }
    if (argv[4] === "--clear" && env[key] === ownerPath && Object.keys(env).length === 1) {
      return { exitCode: 0, stdout: `Clearing ${store}: ${ownerPath}\n`, stderr: "" };
    }
    return { exitCode: 1, stdout: "", stderr: "unbound owner clear" };
  };
}

function engineFor(
  item: { home: string; external: string }, runner: NugetPinnedRunner, approvedRoot: boolean,
) {
  const owner = { runner, now: () => new Date() };
  return new OptimisationRegistryEngine({
    registry: nugetRules(),
    context: { homeDir: item.home, projectRoots: [], ...(approvedRoot ? { userRoots: [item.external] } : {}) },
    selectorAdapters: {
      [NUGET_HTTP_SELECTOR_ADAPTER_ID]: createNugetCacheSelectorAdapter(owner),
      [NUGET_PACKAGES_SELECTOR_ADAPTER_ID]: createNugetCacheSelectorAdapter(owner),
    },
    actionAdapters: {
      [NUGET_HTTP_ACTION_ADAPTER_ID]: createNugetCacheActionAdapter(owner),
      [NUGET_PACKAGES_ACTION_ADAPTER_ID]: createNugetCacheActionAdapter(owner),
    },
    validators: { tool_available: async () => true, tool_idle: async () => true },
    audit: async () => {},
  });
}

describe("NuGet selected-store cache adapters", () => {
  test("parses both owner paths and pins each whole-store clear to exactly its reviewed path", async () => {
    const item = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const engine = engineFor(item, mockRunner(item, calls), true);
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(2);
    expect(plan.candidates.map((candidate) => candidate.tier)).toEqual(["review", "review"]);
    expect(engine.review(plan, { force: true }).selected).toHaveLength(0);
    const selected = engine.review(plan, { force: false, confirmed: true, selectedIds: plan.candidates.map((candidate) => candidate.id) });
    const applied = await engine.apply(selected);
    expect(applied.applied).toHaveLength(2);
    expect(applied.knownReclaimedBytes).toBe(0);
    expect(calls.filter((call) => call.argv.endsWith("--clear")).map((call) => call.environment)).toEqual([
      { NUGET_PACKAGES: item.packages },
      { NUGET_HTTP_CACHE_PATH: item.http },
    ]);
  });

  test("keeps non-home configured stores unreviewable without an explicit containing user root", async () => {
    const item = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const plan = await engineFor(item, mockRunner(item, calls), false).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules.every((skip) => skip.reason.includes("outside approved user roots"))).toBe(true);
    expect(calls.some((call) => call.argv.endsWith("--clear"))).toBe(false);
  });

  test("fails closed if the owner ignores the selected environment override", async () => {
    const item = await fixture();
    const changed = path.join(item.external, "different-http");
    await mkdir(changed);
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const ordinary = mockRunner(item, calls);
    const runner: NugetPinnedRunner = async (argv, cwd, environment) => {
      if (argv[3] === "http-cache" && argv[4] === "--list" && environment.NUGET_HTTP_CACHE_PATH) {
        calls.push({ argv: argv.join(" "), cwd, environment: { ...environment } });
        return { exitCode: 0, stdout: `http-cache: ${changed}\n`, stderr: "" };
      }
      return ordinary(argv, cwd, environment);
    };
    const engine = engineFor(item, runner, true);
    const plan = await engine.probe();
    expect(plan.candidates).toHaveLength(2);
    const http = plan.candidates.find((candidate) => candidate.ruleId === "store.nuget.http_cache")!;
    const selected = engine.review(plan, { force: false, confirmed: true, selectedIds: [http.id] });
    const result = await engine.apply(selected);
    expect(result.failed[0]?.error).toContain("path override did not bind the reviewed store");
    expect(calls.some((call) => call.argv === "dotnet nuget locals http-cache --clear")).toBe(false);
  });

  test("rejects an ambiguous owner list rather than selecting a guessed path", async () => {
    const item = await fixture();
    const malformed: NugetPinnedRunner = async (argv) => ({
      exitCode: 0, stdout: `${argv[3]}: ${item.http}\n${argv[3]}: ${item.packages}\n`, stderr: "",
    });
    const plan = await engineFor(item, malformed, true).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules.every((skip) => skip.reason.includes("one exact absolute owner path"))).toBe(true);
  });

  test("rejects truncated owner list output rather than reviewing a partial path", async () => {
    const item = await fixture();
    const truncated: NugetPinnedRunner = async (argv) => ({
      exitCode: 0, stdout: `${argv[3]}: ${item.http}\n`, stderr: "", truncated: true,
    });
    const plan = await engineFor(item, truncated, true).probe();
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skippedRules.every((skip) => skip.reason.includes("list output was truncated"))).toBe(true);
  });

  test("refuses symlink cache ancestry and a recently changed store", async () => {
    const item = await fixture();
    const link = path.join(item.external, "http-link");
    await symlink(item.http, link);
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const unsafe = await engineFor(item, mockRunner({ ...item, http: link }, calls), true).probe();
    expect(unsafe.candidates.some((candidate) => candidate.ruleId === "store.nuget.http_cache")).toBe(false);
    await writeFile(path.join(item.packages, "recent"), "new");
    const engine = engineFor(item, mockRunner(item, calls), true);
    const plan = await engine.probe();
    const packageCandidate = plan.candidates.find((candidate) => candidate.ruleId === "store.nuget.global_packages")!;
    const result = await engine.apply(engine.review(plan, { force: false, confirmed: true, selectedIds: [packageCandidate.id] }));
    expect(result.failed[0]?.error).toContain("changed within the last 7 days");
    expect(calls.some((call) => call.argv === "dotnet nuget locals global-packages --clear")).toBe(false);
  });

  test("the default command runner rejects unpinned or altered clear commands without spawning dotnet", async () => {
    expect((await runNugetPinnedCommand(["dotnet", "nuget", "locals", "http-cache", "--clear"], "/tmp", {})).exitCode).toBe(1);
    expect((await runNugetPinnedCommand(["dotnet", "nuget", "locals", "all", "--clear"], "/tmp", {})).exitCode).toBe(1);
  });

  test("default pinned runner drops unrelated ambient NuGet paths and reports oversized output", async () => {
    const item = await fixture();
    const bin = path.join(item.root, "bin");
    await mkdir(bin);
    const fakeDotnet = path.join(bin, "dotnet");
    await writeFile(fakeDotnet, "#!/bin/sh\nprintf 'http-cache: %s\\n' \"$NUGET_HTTP_CACHE_PATH\"\nprintf 'other=%s\\n' \"$NUGET_PACKAGES\" >&2\n");
    await chmod(fakeDotnet, 0o755);
    const previousPath = process.env.PATH;
    const previousHttp = process.env.NUGET_HTTP_CACHE_PATH;
    const previousPackages = process.env.NUGET_PACKAGES;
    try {
      process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ""}`;
      process.env.NUGET_HTTP_CACHE_PATH = item.http;
      process.env.NUGET_PACKAGES = item.packages;
      const argv = ["dotnet", "nuget", "locals", "http-cache", "--list"];
      const discovery = await runNugetPinnedCommand(argv, item.home, {});
      expect(discovery.stdout).toContain(item.http);
      const pinned = await runNugetPinnedCommand(argv, item.home, { NUGET_HTTP_CACHE_PATH: item.packages });
      expect(pinned.stdout).toContain(item.packages);
      expect(pinned.stderr).toContain("other=\n");
      await writeFile(fakeDotnet, `#!/bin/sh\nprintf '%s' '${"x".repeat(65_537)}'\n`);
      const oversized = await runNugetPinnedCommand(argv, item.home, {});
      expect(oversized.truncated).toBe(true);
      expect(oversized.stdout.length).toBeLessThan(65_537);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousHttp === undefined) delete process.env.NUGET_HTTP_CACHE_PATH;
      else process.env.NUGET_HTTP_CACHE_PATH = previousHttp;
      if (previousPackages === undefined) delete process.env.NUGET_PACKAGES;
      else process.env.NUGET_PACKAGES = previousPackages;
    }
  });
});
