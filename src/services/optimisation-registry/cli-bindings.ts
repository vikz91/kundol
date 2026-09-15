import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { OptimisationRegistryEngine } from "./engine";
import { hasProjectMarker, isApprovedGeneratedSelector } from "./path-targets";
import type { RegistryAuditSink, RegistryCommandRunner, RegistryEngineContext, RegistryValidator } from "./types";

const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CHECKED_ENTRIES = 150_000;

export interface CliRegistryEngineOptions {
  registry: unknown;
  context: RegistryEngineContext;
  audit: RegistryAuditSink;
  runner?: RegistryCommandRunner;
  now?: () => Date;
}

async function hasRecentChanges(absolutePath: string, cutoffMs: number): Promise<boolean> {
  let checked = 0;
  async function visit(current: string): Promise<boolean> {
    if (++checked > MAX_CHECKED_ENTRIES) throw new Error("target has too many entries to verify activity");
    const info = await lstat(current);
    if (info.isSymbolicLink()) return false;
    if (info.mtimeMs > cutoffMs) return true;
    if (!info.isDirectory()) return false;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (await visit(path.join(current, entry.name))) return true;
    }
    return false;
  }
  return visit(absolutePath);
}

export function createCliRegistryEngine(options: CliRegistryEngineOptions): OptimisationRegistryEngine {
  const now = options.now ?? (() => new Date());
  const quiet: RegistryValidator = async (_rule, candidate) => {
    if (candidate.target.kind !== "path") return "activity check needs a physical path";
    try {
      const cutoffMs = now().getTime() - QUIET_PERIOD_MS;
      if (!Number.isFinite(cutoffMs)) return "activity check has an invalid clock";
      return await hasRecentChanges(candidate.target.absolutePath, cutoffMs)
        ? "target changed within the last 7 days"
        : true;
    } catch (error) {
      return `activity could not be verified: ${error instanceof Error ? error.message : String(error)}`;
    }
  };
  const validators: Record<string, RegistryValidator> = {
    target_not_active: quiet,
    tool_idle: quiet,
    tool_available: async (rule) => rule.selector.kind === "tool_cache" ? true : "tool availability handler is unavailable",
    owner_verified: async (rule, candidate) => {
      if (candidate.target.kind !== "path" || !isApprovedGeneratedSelector(rule) ||
        (rule.selector.kind !== "generated_path" && rule.selector.kind !== "generated_suffix")) {
        return "generated owner cannot be verified";
      }
      return await hasProjectMarker(candidate.target.scopeRoot, rule.selector.markers)
        ? true
        : "project owner marker no longer matches";
    },
  };
  return new OptimisationRegistryEngine({
    registry: options.registry,
    context: options.context,
    audit: options.audit,
    ...(options.runner ? { runner: options.runner } : {}),
    validators,
  });
}
