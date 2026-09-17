import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { hasRecentChanges } from "./cli-bindings";
import { capturePathTarget, samePathIdentity } from "./path-targets";
import type {
  RegistryActionAdapter,
  RegistryAdapterPathTarget,
  RegistryCommandRunner,
  RegistryEngineContext,
  RegistryRule,
  RegistrySelectorAdapter,
  RegistryTarget,
} from "./types";

const BUN_CACHE_RULE_ID = "store.bun.cache";
export const BUN_CACHE_SELECTOR_ADAPTER_ID = "bun.cache";
export const BUN_CACHE_ACTION_ADAPTER_ID = "bun.cache.clear_from_workspace";
const BUN_CACHE_PROBE = ["bun", "pm", "cache"] as const;
const BUN_CACHE_REMOVE = ["bun", "pm", "cache", "rm"] as const;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface BunCacheActionOptions {
  runner: RegistryCommandRunner;
  now?: () => Date;
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function assertBunCacheRule(rule: RegistryRule): void {
  const approvedSelector = (rule.selector.kind === "tool_cache" && sameArgv(rule.selector.pathCommand.argv, BUN_CACHE_PROBE)) ||
    (rule.selector.kind === "adapter" && rule.selector.adapterId === BUN_CACHE_SELECTOR_ADAPTER_ID);
  if (rule.id !== BUN_CACHE_RULE_ID || rule.status !== "published" || rule.scope !== "user" ||
    !approvedSelector ||
    rule.action.kind !== "adapter" || rule.action.adapterId !== BUN_CACHE_ACTION_ADAPTER_ID ||
    rule.review.tier !== "review" || rule.review.selection !== "explicit" || rule.review.forceEligible) {
    throw new Error("Bun cache action is not bound to its approved explicit-review owner rule");
  }
}

async function assertBunWorkspace(commandCwd: string | undefined): Promise<string> {
  if (!commandCwd || !path.isAbsolute(commandCwd)) throw new Error("Bun cache action needs the selected package workspace");
  const cwd = path.resolve(commandCwd);
  if (await realpath(cwd) !== cwd) throw new Error("Bun workspace has a symlink in its path");
  const marker = await lstat(path.join(cwd, "package.json"));
  if (!marker.isFile() || marker.isSymbolicLink()) throw new Error("Bun workspace package.json is not a regular file");
  return cwd;
}

function ownerPath(stdout: string): string {
  const value = stdout.trim();
  if (!path.isAbsolute(value) || value.includes("\n") || value.includes("\r")) {
    throw new Error("Bun cache probe did not return one absolute path");
  }
  return path.resolve(value);
}

async function bunCachePath(rule: RegistryRule, context: RegistryEngineContext, runner: RegistryCommandRunner): Promise<RegistryAdapterPathTarget> {
  assertBunCacheRule(rule);
  const cwd = await assertBunWorkspace(context.commandCwd);
  const probe = await runner(BUN_CACHE_PROBE, cwd);
  if (probe.exitCode !== 0) throw new Error(probe.stderr || probe.stdout || "Bun cache path probe failed");
  if (probe.truncated) throw new Error("Bun cache path probe output was truncated");
  const absolutePath = ownerPath(probe.stdout);
  for (const root of [context.homeDir, ...(context.userRoots ?? [])]) {
    try {
      await capturePathTarget(absolutePath, root, "directory", false);
      return {
        kind: "path", absolutePath, scopeRoot: path.resolve(root), targetKind: "directory",
        evidence: ["Bun owner path: bun pm cache", `Bun workspace: ${cwd}`],
      };
    } catch {
      // A configured cache outside this root may still lie inside another explicit user root.
    }
  }
  throw new Error("Bun cache path lies outside approved user roots or is unsafe");
}

/** Constant-cost selected-path lookup; never enumerates individual package entries. */
export function createBunCacheSelectorAdapter(options: BunCacheActionOptions): RegistrySelectorAdapter {
  return {
    list: async (rule, context) => [await bunCachePath(rule, context, options.runner)],
    lookup: async (rule, reviewed: RegistryTarget, context) => {
      if (reviewed.kind !== "path") return null;
      const live = await bunCachePath(rule, context, options.runner);
      return live.absolutePath === reviewed.absolutePath && live.scopeRoot === reviewed.scopeRoot ? live : null;
    },
  };
}

/** Whole-cache owner action. The engine must issue and review one path target first. */
export function createBunCacheActionAdapter(options: BunCacheActionOptions): RegistryActionAdapter {
  const now = options.now ?? (() => new Date());
  return async (rule, candidate, context) => {
    assertBunCacheRule(rule);
    if (candidate.ruleId !== rule.id || candidate.scope !== "user" || candidate.tier !== "review" ||
      candidate.target.kind !== "path" || candidate.target.fileKind !== "directory") {
      throw new Error("Bun cache action needs an engine-reviewed whole-cache directory target");
    }
    const cwd = await assertBunWorkspace(context.commandCwd);
    const allowedRoots = [context.homeDir, ...(context.userRoots ?? [])].map((root) => path.resolve(root));
    if (!allowedRoots.includes(candidate.target.scopeRoot)) throw new Error("Bun cache target is outside approved user roots");

    const probe = await options.runner(BUN_CACHE_PROBE, cwd);
    if (probe.exitCode !== 0) throw new Error(probe.stderr || probe.stdout || "Bun cache path probe failed");
    if (probe.truncated) throw new Error("Bun cache path probe output was truncated");
    if (ownerPath(probe.stdout) !== candidate.target.absolutePath) throw new Error("Bun cache owner path changed since review");
    const live = await capturePathTarget(candidate.target.absolutePath, candidate.target.scopeRoot, "directory", false);
    if (!samePathIdentity(candidate.target, live)) throw new Error("Bun cache directory changed since review");
    const cutoff = now().getTime() - QUIET_PERIOD_MS;
    if (!Number.isFinite(cutoff)) throw new Error("Bun cache quiet check has an invalid clock");
    if (await hasRecentChanges(live.absolutePath, cutoff)) throw new Error("Bun cache changed within the last 7 days");

    const removed = await options.runner(BUN_CACHE_REMOVE, cwd);
    if (removed.exitCode !== 0) throw new Error(removed.stderr || removed.stdout || "Bun cache clear failed");
    // Shared cache files may be hardlinked or cloned into projects; footprint is not reclaimed bytes.
    return { reclaimedBytes: null };
  };
}
