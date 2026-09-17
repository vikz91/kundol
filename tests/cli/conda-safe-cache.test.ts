import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { RegistryProbeResult } from "../../src/services/optimisation-registry";
import type { CondaPinnedRunner } from "../../src/services/optimisation-registry/conda-safe-cache";
import type { Output } from "../../src/shared/output";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function condaRegistry() {
  const registry = structuredClone(catalogue);
  registry.rules = registry.rules.filter((rule) => ["store.conda.cache", "store.conda.safe_cache"].includes(rule.id));
  registry.rules.find((rule) => rule.id === "store.conda.safe_cache")!.status = "published";
  return registry;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-conda-cli-"));
  roots.push(root);
  const home = path.join(root, "home");
  const approvedRoot = path.join(root, "approved-cache-root");
  const cache = path.join(approvedRoot, "conda-pkgs");
  const sibling = path.join(root, "unapproved-sibling");
  const env = path.join(home, "envs", "demo");
  const index = path.join(cache, "cache");
  const logfile = path.join(cache, ".logs", "fixture.log");
  const tarball = path.join(cache, "fixture.conda");
  for (const directory of [home, env, index, path.join(cache, ".logs"), path.join(sibling, "cache"),
    path.join(sibling, ".logs")]) await mkdir(directory, { recursive: true });
  const retained = [path.join(sibling, "sibling.conda"), path.join(sibling, "cache", "index.json"),
    path.join(sibling, ".logs", "sibling.log")];
  for (const entry of [path.join(cache, "urls.txt"), tarball, path.join(index, "index.json"), logfile,
    path.join(sibling, "urls.txt"), ...retained]) {
    await writeFile(entry, "retained cached item");
    await utimes(entry, old, old);
  }
  for (const directory of [index, path.join(cache, ".logs"), cache, path.join(sibling, "cache"),
    path.join(sibling, ".logs"), sibling]) await utimes(directory, old, old);
  return { root, home, approvedRoot, cache, sibling, env, index, logfile, tarball, retained,
    databasePath: path.join(root, "audit.db") };
}

async function exists(target: string): Promise<boolean> {
  try { await lstat(target); return true; } catch { return false; }
}

function output() {
  const lines: string[] = [];
  const errors: string[] = [];
  const captured: Output = {
    writeLine(message = "") { lines.push(message); },
    writeError(message = "") { errors.push(message); },
  };
  return { captured, lines, errors };
}

async function preview(f: Awaited<ReturnType<typeof fixture>>) {
  const tarballPresent = await exists(f.tarball);
  const size = tarballPresent ? (await lstat(f.tarball)).size : 0;
  return {
    success: true,
    tarballs: {
      warnings: [], pkg_sizes: tarballPresent ? { [f.cache]: { "fixture.conda": size } } : {},
      pkgs_dirs: tarballPresent ? { [f.cache]: ["fixture.conda"] } : {}, total_size: size,
    },
    index_cache: { files: await exists(f.index) ? [f.index] : [] },
    logfiles: await exists(f.logfile) ? [f.logfile] : [],
  };
}

function condaRunner(
  f: Awaited<ReturnType<typeof fixture>>,
  calls: { argv: string; cwd: string; environment: Record<string, string> }[],
  options: { active?: boolean; failAction?: boolean } = {},
): CondaPinnedRunner {
  return async (argv, cwd, environment) => {
    const override = { ...environment } as Record<string, string>;
    calls.push({ argv: argv.join(" "), cwd, environment: override });
    if (argv[1] === "info") {
      return { exitCode: 0, stdout: JSON.stringify({
        pkgs_dirs: override.CONDA_PKGS_DIRS ? [override.CONDA_PKGS_DIRS] : [f.cache, f.sibling],
        envs: [f.env], active_prefix: options.active ? f.env : null,
        envs_details: { [f.env]: { active: options.active ?? false } },
      }), stderr: "" };
    }
    const current = await preview(f);
    if (argv.includes("--dry-run")) return { exitCode: 0, stdout: JSON.stringify(current), stderr: "" };
    if (override.CONDA_PKGS_DIRS !== f.cache || Object.keys(override).length !== 1 ||
      argv.includes("--all") || argv.includes("--packages")) {
      return { exitCode: 1, stdout: "", stderr: "unapproved Conda action" };
    }
    if (options.failAction) return { exitCode: 1, stdout: "", stderr: "owner clean failed" };
    const category = argv.includes("--tarballs") ? "tarballs" : argv.includes("--index-cache") ? "index_cache" : "logfiles";
    if (category === "tarballs") await rm(f.tarball);
    else if (category === "index_cache") await rm(f.index, { recursive: true });
    else await rm(f.logfile);
    return { exitCode: 0, stdout: JSON.stringify({ success: true, [category]: current[category] }), stderr: "" };
  };
}

async function runStorage(
  f: Awaited<ReturnType<typeof fixture>>, runner: CondaPinnedRunner,
  options: { force?: boolean; select?: (plan: RegistryProbeResult) => Promise<readonly string[]>; approveRoot?: boolean } = {},
) {
  const captured = output();
  await createProgram({
    output: captured.captured, registry: condaRegistry(), homeDir: f.home, databasePath: f.databasePath,
    registryCommandCwd: f.home, registryUserRoots: options.approveRoot === false ? [] : [f.approvedRoot],
    registryNow: () => now,
    registryRunner: async () => { throw new Error("Conda must use its pinned injected runner, not a generic owner command"); },
    condaPinnedRunner: runner,
    ...(options.select ? { registrySelect: options.select } : {}),
  }).parseAsync(["optimise", "storage", ...(options.force ? ["-f"] : [])], { from: "user" });
  return captured;
}

describe("Conda safe-category proposal through optimise storage", () => {
  test("force previews three explicit-review aggregates but cannot select any or expose the unsafe baseline", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const captured = await runStorage(f, condaRunner(f, calls), { force: true });
    const text = captured.lines.join("\n");
    expect(text).toContain("Targets: 3");
    expect(text).toContain("[review] Conda safe cache categories");
    expect(text).not.toContain("Conda cached packages and downloads");
    expect(text).toContain("Safe suggestions: 0");
    expect(text).toContain("Cancelled. No storage targets were removed.");
    expect(calls.some((call) => call.argv.includes("--yes") || call.argv.includes("--all") || call.argv.includes("--packages"))).toBe(false);
    for (const item of [f.tarball, path.join(f.index, "index.json"), f.logfile, ...f.retained]) expect(await exists(item)).toBe(true);
  });

  test("selecting only index runs one pinned owner category and preserves tarballs, logs, and a sibling cache", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const captured = await runStorage(f, condaRunner(f, calls), {
      select: async (plan) => plan.candidates.filter((candidate) => candidate.target.kind === "resource" &&
        candidate.target.resourceId.startsWith("index:")).map((candidate) => candidate.id),
    });
    expect(captured.lines.join("\n")).toContain("Removed/optimised: 1");
    expect(calls.filter((call) => call.argv.includes("--yes"))).toEqual([{
      argv: "conda clean --index-cache --yes --json", cwd: f.home,
      environment: { CONDA_PKGS_DIRS: f.cache },
    }]);
    expect(calls.length).toBeLessThanOrEqual(10);
    expect(calls.filter((call) => call.argv === "conda info --json" &&
      Object.keys(call.environment).length === 0)).toHaveLength(1);
    expect(await exists(f.index)).toBe(false);
    expect(await exists(f.tarball)).toBe(true);
    expect(await exists(f.logfile)).toBe(true);
    for (const item of f.retained) expect(await readFile(item, "utf8")).toBe("retained cached item");
  });

  test("without an explicitly approved custom cache root the CLI cannot review any category", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const captured = await runStorage(f, condaRunner(f, calls), { approveRoot: false, force: true });
    expect(captured.lines.join("\n")).toContain("Targets: 0");
    expect(calls.every((call) => call.argv === "conda info --json")).toBe(true);
    expect(await exists(f.tarball)).toBe(true);
  });

  test("a selected cache changed to contain an outside symlink is skipped before owner clean", async () => {
    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const captured = await runStorage(f, condaRunner(f, calls), {
      select: async (plan) => {
        const selected = plan.candidates.find((candidate) => candidate.target.kind === "resource" &&
          candidate.target.resourceId.startsWith("index:"))!;
        await symlink(f.sibling, path.join(f.index, "outside-link"));
        await utimes(f.index, old, old);
        return [selected.id];
      },
    });
    expect(captured.lines.join("\n")).toContain("Skipped: 1");
    expect(calls.some((call) => call.argv.includes("--yes"))).toBe(false);
    for (const item of f.retained) expect(await exists(item)).toBe(true);
  });

  test("active environments or failed category actions never claim success", async () => {
    const active = await fixture();
    const activeCalls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const blocked = await runStorage(active, condaRunner(active, activeCalls, { active: true }), { force: true });
    expect(blocked.lines.join("\n")).toContain("Targets: 0");
    expect(activeCalls.every((call) => call.argv === "conda info --json")).toBe(true);

    const f = await fixture();
    const calls: { argv: string; cwd: string; environment: Record<string, string> }[] = [];
    const previousExitCode = process.exitCode;
    try {
      const failed = await runStorage(f, condaRunner(f, calls, { failAction: true }), {
        select: async (plan) => plan.candidates.filter((candidate) => candidate.target.kind === "resource" &&
          candidate.target.resourceId.startsWith("log:")).map((candidate) => candidate.id),
      });
      const text = failed.lines.join("\n");
      expect(text).toContain("Removed/optimised: 0");
      expect(text).toContain("Failed: 1");
      expect(process.exitCode).toBe(70);
      expect(calls.filter((call) => call.argv.includes("--yes"))).toHaveLength(1);
      for (const item of [f.tarball, path.join(f.index, "index.json"), f.logfile, ...f.retained]) expect(await exists(item)).toBe(true);
    } finally { process.exitCode = previousExitCode ?? 0; }
  });
});
