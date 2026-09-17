import { lstat, readFile, realpath } from "node:fs/promises";
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

export const YARN_CACHE_SELECTOR_ADAPTER_ID = "yarn.cache_versioned";
export const YARN_CACHE_ACTION_ADAPTER_ID = "yarn.cache.clean_versioned";
const YARN_RULE_ID = "store.yarn.cache";
const VERSION_COMMAND = ["yarn", "--version"] as const;
const CLASSIC_CACHE_DIR = ["yarn", "--silent", "cache", "dir"] as const;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONFIG_BYTES = 64 * 1024;

export interface YarnCacheAdapterOptions {
  runner: RegistryCommandRunner;
  now?: () => Date;
}

function assertYarnRule(rule: RegistryRule): void {
  if (rule.id !== YARN_RULE_ID || (rule.status !== "published" && rule.status !== "beta") || rule.scope !== "user" ||
    rule.selector.kind !== "adapter" || rule.selector.adapterId !== YARN_CACHE_SELECTOR_ADAPTER_ID ||
    rule.action.kind !== "adapter" || rule.action.adapterId !== YARN_CACHE_ACTION_ADAPTER_ID ||
    rule.review.tier !== "review" || rule.review.selection !== "explicit" || rule.review.forceEligible) {
    throw new Error("Yarn cache adapter is not bound to its approved explicit-review owner rule");
  }
}

async function assertYarnWorkspace(commandCwd: string | undefined): Promise<string> {
  if (!commandCwd || !path.isAbsolute(commandCwd)) throw new Error("Yarn cache scan needs a selected package workspace");
  const cwd = path.resolve(commandCwd);
  if (await realpath(cwd) !== cwd) throw new Error("Yarn workspace has a symlink in its path");
  const marker = await lstat(path.join(cwd, "package.json"));
  if (!marker.isFile() || marker.isSymbolicLink()) throw new Error("Yarn workspace package.json is not a regular file");

  // Yarn can delegate its CLI to repository-local code. Never execute such a path
  // while a storage scan is merely inventorying the workspace's cache configuration.
  let directory = cwd;
  while (true) {
    for (const name of [".yarnrc", ".yarnrc.yml"]) {
      const configPath = path.join(directory, name);
      const info = await lstat(configPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (!info) continue;
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_CONFIG_BYTES) {
        throw new Error("Yarn configuration is not a bounded regular file");
      }
      const configuration = await readFile(configPath, "utf8");
      if (/\byarnPath\b|\byarn-path\b|\bplugins\b/i.test(configuration)) {
        throw new Error("delegated Yarn CLI or plugins are unsupported for cache cleanup");
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return cwd;
}

async function assertClassicYarn(runner: RegistryCommandRunner, cwd: string): Promise<void> {
  const version = await runner(VERSION_COMMAND, cwd);
  if (version.exitCode !== 0) throw new Error(version.stderr || version.stdout || "Yarn version probe failed");
  const value = version.stdout.trim();
  const match = /^(\d+)\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.exec(value);
  if (!match) throw new Error("Yarn version probe did not return one semver version");
  if (Number(match[1]) !== 1) {
    throw new Error("Modern Yarn local/global caches need a separate pinned-config adapter; this rule currently supports Classic only");
  }
}

function ownerPath(stdout: string): string {
  const value = stdout.trim();
  if (!path.isAbsolute(value) || value.includes("\n") || value.includes("\r")) {
    throw new Error("Yarn Classic cache probe did not return one absolute path");
  }
  return path.resolve(value);
}

async function classicCachePath(rule: RegistryRule, context: RegistryEngineContext, runner: RegistryCommandRunner): Promise<RegistryAdapterPathTarget> {
  assertYarnRule(rule);
  const cwd = await assertYarnWorkspace(context.commandCwd);
  await assertClassicYarn(runner, cwd);
  const probe = await runner(CLASSIC_CACHE_DIR, cwd);
  if (probe.exitCode !== 0) throw new Error(probe.stderr || probe.stdout || "Yarn Classic cache path probe failed");
  const absolutePath = ownerPath(probe.stdout);
  for (const root of [context.homeDir, ...(context.userRoots ?? [])]) {
    try {
      await capturePathTarget(absolutePath, root, "directory", false);
      return {
        kind: "path", absolutePath, scopeRoot: path.resolve(root), targetKind: "directory",
        evidence: ["Yarn Classic 1.x", "Owner path: yarn --silent cache dir", `Selected workspace: ${cwd}`],
      };
    } catch {
      // A custom Classic cache may live in another explicitly approved user root.
    }
  }
  throw new Error("Yarn Classic cache lies outside approved user roots or is unsafe");
}

export function createYarnCacheSelectorAdapter(options: YarnCacheAdapterOptions): RegistrySelectorAdapter {
  return {
    list: async (rule, context) => [await classicCachePath(rule, context, options.runner)],
    lookup: async (rule, reviewed: RegistryTarget, context) => {
      if (reviewed.kind !== "path") return null;
      const live = await classicCachePath(rule, context, options.runner);
      return live.absolutePath === reviewed.absolutePath && live.scopeRoot === reviewed.scopeRoot ? live : null;
    },
  };
}

/** Classic only: --cache-folder pins cleanup to the engine-reviewed cache path. */
export function createYarnCacheActionAdapter(options: YarnCacheAdapterOptions): RegistryActionAdapter {
  const now = options.now ?? (() => new Date());
  return async (rule, candidate, context) => {
    assertYarnRule(rule);
    if (candidate.ruleId !== rule.id || candidate.scope !== "user" || candidate.status !== rule.status ||
      candidate.tier !== "review" || candidate.action.kind !== "adapter" ||
      candidate.action.adapterId !== YARN_CACHE_ACTION_ADAPTER_ID || candidate.target.kind !== "path" ||
      candidate.target.fileKind !== "directory") {
      throw new Error("Yarn cache action needs an engine-reviewed whole-cache directory target");
    }
    const cwd = await assertYarnWorkspace(context.commandCwd);
    const allowedRoots = [context.homeDir, ...(context.userRoots ?? [])].map((root) => path.resolve(root));
    if (!allowedRoots.includes(candidate.target.scopeRoot)) throw new Error("Yarn cache target is outside approved user roots");
    await assertClassicYarn(options.runner, cwd);
    const probe = await options.runner(CLASSIC_CACHE_DIR, cwd);
    if (probe.exitCode !== 0) throw new Error(probe.stderr || probe.stdout || "Yarn Classic cache path probe failed");
    if (ownerPath(probe.stdout) !== candidate.target.absolutePath) throw new Error("Yarn Classic cache path changed since review");
    const live = await capturePathTarget(candidate.target.absolutePath, candidate.target.scopeRoot, "directory", false);
    if (!samePathIdentity(candidate.target, live)) throw new Error("Yarn Classic cache directory changed since review");
    const cutoff = now().getTime() - QUIET_PERIOD_MS;
    if (!Number.isFinite(cutoff)) throw new Error("Yarn cache quiet check has an invalid clock");
    if (await hasRecentChanges(live.absolutePath, cutoff)) throw new Error("Yarn cache changed within the last 7 days");
    const action = ["yarn", "--silent", "cache", "clean", "--cache-folder", live.absolutePath] as const;
    const cleaned = await options.runner(action, cwd);
    if (cleaned.exitCode !== 0) throw new Error(cleaned.stderr || cleaned.stdout || "Yarn Classic cache clean failed");
    return { reclaimedBytes: null };
  };
}
