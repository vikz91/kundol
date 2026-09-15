import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { OptimisationRegistry } from "../../core/optimisation-registry/schema";
import { matchesProjectMarkerEntries } from "./path-targets";

const PROTECTED_TRAVERSAL_NAMES = new Set([
  ".git", ".venv", "venv", "env", "assets", "asset", "uploads", "upload", "media", "migrations", "migration", "vendor",
]);

export interface RegistryProjectRootsResult {
  workdir: string;
  maxDepth: number;
  roots: readonly string[];
  warnings: readonly string[];
}

export async function discoverRegistryProjectRoots(
  workdir: string,
  registry: OptimisationRegistry,
  maxDepth = 7,
): Promise<RegistryProjectRootsResult> {
  const root = path.resolve(workdir);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("workdir must be a real directory");
  if (!Number.isInteger(maxDepth) || maxDepth < 0) throw new Error("maxDepth must be a non-negative integer");
  const workdirRules = registry.rules.filter((rule) => rule.scope === "workdir" && (rule.selector.kind === "generated_path" || rule.selector.kind === "generated_suffix") &&
    (rule.status === "published" || rule.status === "beta"));
  const skipNames = new Set(PROTECTED_TRAVERSAL_NAMES);
  for (const rule of registry.rules) {
    if (rule.scope === "workdir" && rule.selector.kind === "generated_path") {
      for (const name of rule.selector.names) skipNames.add(name);
    }
  }
  const roots: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  async function visit(current: string, depth: number): Promise<void> {
    try {
      const currentRealPath = await realpath(current);
      if (seen.has(currentRealPath)) return;
      seen.add(currentRealPath);
      const entries = await readdir(current, { withFileTypes: true });
      if (workdirRules.some((rule) =>
        (rule.selector.kind === "generated_path" || rule.selector.kind === "generated_suffix") &&
        matchesProjectMarkerEntries(entries, rule.selector.markers))) roots.push(current);
      if (depth >= maxDepth) return;
      for (const entry of entries) {
        if (!entry.isDirectory() || skipNames.has(entry.name)) continue;
        await visit(path.join(current, entry.name), depth + 1);
      }
    } catch (error) {
      if (current === root) throw error;
      warnings.push(`Skipped unreadable directory ${current}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await visit(root, 0);
  return { workdir: root, maxDepth, roots: roots.sort(), warnings };
}
