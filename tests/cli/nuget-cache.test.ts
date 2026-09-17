import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { RegistryProbeResult } from "../../src/services/optimisation-registry";
import type { NugetPinnedRunner } from "../../src/services/optimisation-registry/nuget-cache";
import type { Output } from "../../src/shared/output";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function registry() {
  const selected = structuredClone(catalogue);
  selected.rules = selected.rules.filter((rule) => ["store.nuget.http_cache", "store.nuget.global_packages"].includes(rule.id));
  for (const rule of selected.rules) rule.status = "published";
  return selected;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-nuget-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const http = path.join(home, "configured-http-cache");
  const packages = path.join(home, "configured-global-packages");
  const sibling = path.join(home, "unrelated-store");
  for (const store of [http, packages, sibling]) await mkdir(store, { recursive: true });
  for (const store of [http, packages, sibling]) {
    const entry = path.join(store, "cached-item");
    await writeFile(entry, `retained ${store}`);
    await utimes(entry, old, old);
    await utimes(store, old, old);
  }
  return { root, home, http, packages, sibling, databasePath: path.join(root, "audit.db") };
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; } catch { return false; }
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

function ownerRunner(
  f: Awaited<ReturnType<typeof fixture>>,
  calls: { argv: string; cwd: string; environment: Record<string, string> }[],
  failClear?: "http-cache" | "global-packages",
): NugetPinnedRunner {
  return async (argv, cwd, environment) => {
    const store = argv[3];
    const key = store === "http-cache" ? "NUGET_HTTP_CACHE_PATH" : "NUGET_PACKAGES";
    const expected = store === "http-cache" ? f.http : f.packages;
    const override = { ...environment } as Record<string, string>;
    calls.push({ argv: argv.join(" "), cwd, environment: override });
    if (argv[4] === "--list") {
      const pathFromOwner = override[key] ?? process.env[key];
      if (!pathFromOwner) return { exitCode: 1, stdout: "", stderr: "owner cache not configured" };
      return { exitCode: 0, stdout: `${store}: ${pathFromOwner}\n`, stderr: "" };
    }
    if (argv[4] !== "--clear" || override[key] !== expected || Object.keys(override).length !== 1) {
      return { exitCode: 1, stdout: "", stderr: "clear was not pinned to selected store" };
    }
    if (store === failClear) return { exitCode: 1, stdout: "", stderr: "owner clear failed" };
    await rm(path.join(expected, "cached-item"));
    return { exitCode: 0, stdout: `cleared ${store}\n`, stderr: "" };
  };
}

async function runStorage(
  f: Awaited<ReturnType<typeof fixture>>,
  runner: NugetPinnedRunner,
  options: { force?: boolean; select?: (plan: RegistryProbeResult) => Promise<readonly string[]> } = {},
) {
  const captured = capturedOutput();
  await createProgram({
    output: captured.output,
    registry: registry(),
    homeDir: f.home,
    databasePath: f.databasePath,
    registryNow: () => now,
    registryRunner: async () => { throw new Error("NuGet must use its pinned owner runner, not a generic command"); },
    nugetPinnedRunner: runner,
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "storage", ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

describe("published NuGet cache stores through optimise storage", () => {
  test("force previews both whole stores but cannot clear either review target", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const previousHttp = process.env.NUGET_HTTP_CACHE_PATH;
    const previousPackages = process.env.NUGET_PACKAGES;
    try {
      process.env.NUGET_HTTP_CACHE_PATH = f.http;
      process.env.NUGET_PACKAGES = f.packages;
      const captured = await runStorage(f, ownerRunner(f, calls), { force: true });
      const text = captured.lines.join("\n");
      expect(text).toContain("[review] NuGet HTTP cache");
      expect(text).toContain("[review] NuGet global packages");
      expect(text).toContain("Safe suggestions: 0");
      expect(text).toContain("Cancelled. No storage targets were removed.");
      expect(calls.some((call) => call.argv.endsWith("--clear"))).toBe(false);
      expect(await exists(path.join(f.http, "cached-item"))).toBe(true);
      expect(await exists(path.join(f.packages, "cached-item"))).toBe(true);
    } finally {
      if (previousHttp === undefined) delete process.env.NUGET_HTTP_CACHE_PATH;
      else process.env.NUGET_HTTP_CACHE_PATH = previousHttp;
      if (previousPackages === undefined) delete process.env.NUGET_PACKAGES;
      else process.env.NUGET_PACKAGES = previousPackages;
    }
  });

  test("explicit review binds each ambient custom path and preserves an unrelated sibling store", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const previousHttp = process.env.NUGET_HTTP_CACHE_PATH;
    const previousPackages = process.env.NUGET_PACKAGES;
    try {
      process.env.NUGET_HTTP_CACHE_PATH = f.http;
      process.env.NUGET_PACKAGES = f.packages;
      const captured = await runStorage(f, ownerRunner(f, calls), {
        select: async (plan) => plan.candidates.map((candidate) => candidate.id),
      });
      const text = captured.lines.join("\n");
      expect(text).toContain("Removed/optimised: 2");
      expect(calls.filter((call) => call.argv.endsWith("--clear")).map((call) => call.environment)).toEqual([
        { NUGET_PACKAGES: f.packages }, { NUGET_HTTP_CACHE_PATH: f.http },
      ]);
      expect(calls.filter((call) => call.argv.endsWith("--clear")).every((call) => call.cwd === path.resolve(process.cwd()))).toBe(true);
      expect(await exists(path.join(f.http, "cached-item"))).toBe(false);
      expect(await exists(path.join(f.packages, "cached-item"))).toBe(false);
      expect(await readFile(path.join(f.sibling, "cached-item"), "utf8")).toContain("retained");
    } finally {
      if (previousHttp === undefined) delete process.env.NUGET_HTTP_CACHE_PATH;
      else process.env.NUGET_HTTP_CACHE_PATH = previousHttp;
      if (previousPackages === undefined) delete process.env.NUGET_PACKAGES;
      else process.env.NUGET_PACKAGES = previousPackages;
    }
  });

  test("a selected owner clear failure on either store is reported without collateral cleanup", async () => {
    for (const failingStore of ["http-cache", "global-packages"] as const) {
      const f = await fixture();
      const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
      const previousHttp = process.env.NUGET_HTTP_CACHE_PATH;
      const previousPackages = process.env.NUGET_PACKAGES;
      const previousExitCode = process.exitCode;
      try {
        process.env.NUGET_HTTP_CACHE_PATH = f.http;
        process.env.NUGET_PACKAGES = f.packages;
        const selectedRule = failingStore === "http-cache" ? "store.nuget.http_cache" : "store.nuget.global_packages";
        const captured = await runStorage(f, ownerRunner(f, calls, failingStore), {
          select: async (plan) => plan.candidates.filter((candidate) => candidate.ruleId === selectedRule).map((candidate) => candidate.id),
        });
        const text = captured.lines.join("\n");
        expect(text).toContain("Removed/optimised: 0");
        expect(text).toContain("Failed: 1");
        expect(text).toContain("owner clear failed");
        expect(process.exitCode).toBe(70);
        expect(calls.filter((call) => call.argv.endsWith("--clear"))).toHaveLength(1);
        expect(await exists(path.join(f.http, "cached-item"))).toBe(true);
        expect(await exists(path.join(f.packages, "cached-item"))).toBe(true);
        expect(await exists(path.join(f.sibling, "cached-item"))).toBe(true);
      } finally {
        process.exitCode = previousExitCode ?? 0;
        if (previousHttp === undefined) delete process.env.NUGET_HTTP_CACHE_PATH;
        else process.env.NUGET_HTTP_CACHE_PATH = previousHttp;
        if (previousPackages === undefined) delete process.env.NUGET_PACKAGES;
        else process.env.NUGET_PACKAGES = previousPackages;
      }
    }
  });
});
