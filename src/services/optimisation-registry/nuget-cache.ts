import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { hasRecentChanges } from "./cli-bindings";
import { capturePathTarget, samePathIdentity } from "./path-targets";
import type {
  RegistryActionAdapter,
  RegistryAdapterPathTarget,
  RegistryCommandResult,
  RegistryEngineContext,
  RegistryRule,
  RegistrySelectorAdapter,
  RegistryTarget,
} from "./types";

const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const LIST_TIMEOUT_MS = 15_000;
const CLEAR_TIMEOUT_MS = 120_000;

export const NUGET_HTTP_SELECTOR_ADAPTER_ID = "nuget.http_cache";
export const NUGET_PACKAGES_SELECTOR_ADAPTER_ID = "nuget.global_packages";
export const NUGET_HTTP_ACTION_ADAPTER_ID = "nuget.http_cache.clear_selected";
export const NUGET_PACKAGES_ACTION_ADAPTER_ID = "nuget.global_packages.clear_selected";

type Store = "http-cache" | "global-packages";
type OverrideKey = "NUGET_HTTP_CACHE_PATH" | "NUGET_PACKAGES";
export type NugetPinnedRunner = (
  argv: readonly string[],
  cwd: string,
  environment: Readonly<Partial<Record<OverrideKey, string>>>,
) => Promise<RegistryCommandResult>;

export interface NugetCacheAdapterOptions {
  runner: NugetPinnedRunner;
  now?: () => Date;
}

function identity(rule: RegistryRule): { store: Store; override: OverrideKey; selectorId: string; actionId: string } {
  if (rule.id === "store.nuget.http_cache") {
    return { store: "http-cache", override: "NUGET_HTTP_CACHE_PATH", selectorId: NUGET_HTTP_SELECTOR_ADAPTER_ID, actionId: NUGET_HTTP_ACTION_ADAPTER_ID };
  }
  if (rule.id === "store.nuget.global_packages") {
    return { store: "global-packages", override: "NUGET_PACKAGES", selectorId: NUGET_PACKAGES_SELECTOR_ADAPTER_ID, actionId: NUGET_PACKAGES_ACTION_ADAPTER_ID };
  }
  throw new Error("NuGet cache adapter is not bound to an approved owner rule");
}

function assertNugetRule(rule: RegistryRule): ReturnType<typeof identity> {
  const owner = identity(rule);
  if (rule.status !== "published" || rule.scope !== "user" ||
    rule.selector.kind !== "adapter" || rule.selector.adapterId !== owner.selectorId ||
    rule.action.kind !== "adapter" || rule.action.adapterId !== owner.actionId ||
    rule.review.tier !== "review" || rule.review.selection !== "explicit" || rule.review.forceEligible) {
    throw new Error("NuGet cache adapter needs its approved explicit-review owner rule");
  }
  return owner;
}

function ownerCommand(store: Store, action: "--list" | "--clear"): readonly string[] {
  return ["dotnet", "nuget", "locals", store, action];
}

async function ownerCwd(context: RegistryEngineContext): Promise<string> {
  const cwd = path.resolve(context.commandCwd ?? context.homeDir);
  if (await realpath(cwd) !== cwd || !(await lstat(cwd)).isDirectory()) {
    throw new Error("NuGet owner cwd is not a regular directory path");
  }
  return cwd;
}

function parseOwnerPath(stdout: string, store: Store): string {
  const clean = stdout.replace(/\r/g, "").trim();
  const match = /^(?:info\s*:\s*)?(http-cache|global-packages)\s*:\s*(.+)$/i.exec(clean);
  if (!match || match[1] !== store || clean.includes("\n") || !path.isAbsolute(match[2]!)) {
    throw new Error(`NuGet ${store} list did not return one exact absolute owner path`);
  }
  return path.resolve(match[2]!);
}

async function listOwnerPath(
  owner: ReturnType<typeof identity>, cwd: string, runner: NugetPinnedRunner,
  environment: Readonly<Partial<Record<OverrideKey, string>>> = {},
): Promise<string> {
  const result = await runner(ownerCommand(owner.store, "--list"), cwd, environment);
  if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `NuGet ${owner.store} list failed`);
  if (result.truncated) throw new Error(`NuGet ${owner.store} list output was truncated`);
  return parseOwnerPath(result.stdout, owner.store);
}

async function nugetCachePath(rule: RegistryRule, context: RegistryEngineContext, runner: NugetPinnedRunner): Promise<RegistryAdapterPathTarget> {
  const owner = assertNugetRule(rule);
  const cwd = await ownerCwd(context);
  const absolutePath = await listOwnerPath(owner, cwd, runner);
  for (const root of [context.homeDir, ...(context.userRoots ?? [])]) {
    try {
      await capturePathTarget(absolutePath, root, "directory", false);
      return {
        kind: "path", absolutePath, scopeRoot: path.resolve(root), targetKind: "directory",
        evidence: [`NuGet owner store: ${owner.store}`, `Owner path: dotnet nuget locals ${owner.store} --list`, `Owner cwd: ${cwd}`],
      };
    } catch {
      // A configured store may still lie inside another explicitly approved user root.
    }
  }
  throw new Error(`NuGet ${owner.store} lies outside approved user roots or is unsafe`);
}

export function createNugetCacheSelectorAdapter(options: NugetCacheAdapterOptions): RegistrySelectorAdapter {
  return {
    list: async (rule, context) => [await nugetCachePath(rule, context, options.runner)],
    lookup: async (rule, reviewed: RegistryTarget, context) => {
      if (reviewed.kind !== "path") return null;
      const live = await nugetCachePath(rule, context, options.runner);
      return live.absolutePath === reviewed.absolutePath && live.scopeRoot === reviewed.scopeRoot ? live : null;
    },
  };
}

export function createNugetCacheActionAdapter(options: NugetCacheAdapterOptions): RegistryActionAdapter {
  const now = options.now ?? (() => new Date());
  return async (rule, candidate, context) => {
    const owner = assertNugetRule(rule);
    if (candidate.ruleId !== rule.id || candidate.scope !== "user" || candidate.status !== "published" ||
      candidate.tier !== "review" || candidate.action.kind !== "adapter" || candidate.action.adapterId !== owner.actionId ||
      candidate.target.kind !== "path" || candidate.target.fileKind !== "directory") {
      throw new Error("NuGet clear needs an engine-reviewed whole-store directory target");
    }
    const allowedRoots = [context.homeDir, ...(context.userRoots ?? [])].map((root) => path.resolve(root));
    if (!allowedRoots.includes(candidate.target.scopeRoot)) throw new Error("NuGet target is outside approved user roots");
    const cwd = await ownerCwd(context);
    const live = await capturePathTarget(candidate.target.absolutePath, candidate.target.scopeRoot, "directory", false);
    if (!samePathIdentity(candidate.target, live)) throw new Error("NuGet store directory changed since review");
    const cutoff = now().getTime() - QUIET_PERIOD_MS;
    if (!Number.isFinite(cutoff)) throw new Error("NuGet quiet check has an invalid clock");
    if (await hasRecentChanges(live.absolutePath, cutoff)) throw new Error("NuGet store changed within the last 7 days");

    const pinned = { [owner.override]: live.absolutePath } as Readonly<Partial<Record<OverrideKey, string>>>;
    if (await listOwnerPath(owner, cwd, options.runner, pinned) !== live.absolutePath) {
      throw new Error(`NuGet ${owner.store} path override did not bind the reviewed store`);
    }
    const cleared = await options.runner(ownerCommand(owner.store, "--clear"), cwd, pinned);
    if (cleared.exitCode !== 0) throw new Error(cleared.stderr || cleared.stdout || `NuGet ${owner.store} clear failed`);
    if (cleared.truncated) throw new Error(`NuGet ${owner.store} clear output was truncated`);
    // Store footprint can include files referenced or linked elsewhere; do not claim exact reclaimed bytes.
    return { reclaimedBytes: null };
  };
}

function knownOwnerArgv(argv: readonly string[]): "list" | "clear" | null {
  if (argv.length !== 5 || argv[0] !== "dotnet" || argv[1] !== "nuget" || argv[2] !== "locals" ||
    !["http-cache", "global-packages"].includes(argv[3]!)) return null;
  return argv[4] === "--list" ? "list" : argv[4] === "--clear" ? "clear" : null;
}

async function readBounded(stream: ReadableStream<Uint8Array> | null): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let remaining = MAX_OUTPUT_BYTES;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (remaining > 0) {
        const selected = value.subarray(0, remaining);
        output += decoder.decode(selected, { stream: true });
        remaining -= selected.byteLength;
        if (selected.byteLength < value.byteLength) truncated = true;
      } else {
        truncated = true;
      }
    }
    output += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text: output, truncated };
}

/** Fixed NuGet owner commands with a selected-store environment override. */
export const runNugetPinnedCommand: NugetPinnedRunner = async (argv, cwd, environment) => {
  const mode = knownOwnerArgv(argv);
  if (!mode) return { exitCode: 1, stdout: "", stderr: "NuGet command is not code-approved" };
  const requiredKey: OverrideKey = argv[3] === "http-cache" ? "NUGET_HTTP_CACHE_PATH" : "NUGET_PACKAGES";
  if (mode === "clear" && (!environment[requiredKey] || Object.keys(environment).length !== 1)) {
    return { exitCode: 1, stdout: "", stderr: "NuGet clear requires one pinned selected-store path" };
  }
  for (const [key, value] of Object.entries(environment)) {
    if (key !== requiredKey || !value || !path.isAbsolute(value)) {
      return { exitCode: 1, stdout: "", stderr: "NuGet environment override is not code-approved" };
    }
  }
  try {
    const ownerEnvironment = { ...process.env };
    // The first unpinned list discovers ambient NuGet configuration. Once the
    // reviewed store is pinned, neither ambient NuGet path can redirect it.
    if (Object.keys(environment).length > 0) {
      delete ownerEnvironment.NUGET_HTTP_CACHE_PATH;
      delete ownerEnvironment.NUGET_PACKAGES;
    }
    const proc = Bun.spawn([...argv], { cwd, env: { ...ownerEnvironment, ...environment }, stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, mode === "list" ? LIST_TIMEOUT_MS : CLEAR_TIMEOUT_MS);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([readBounded(proc.stdout), readBounded(proc.stderr), proc.exited]);
      return {
        exitCode: timedOut ? 124 : exitCode,
        stdout: stdout.text,
        stderr: timedOut ? `${stderr.text}\nNuGet command timed out` : stderr.text,
        truncated: stdout.truncated || stderr.truncated,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
};
