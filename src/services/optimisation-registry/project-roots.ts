import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { OptimisationRegistry } from "../../core/optimisation-registry/schema";
import { matchesProjectMarkerEntries } from "./path-targets";

const PROTECTED_TRAVERSAL_NAMES = new Set([
  ".git", ".venv", "venv", "env", "assets", "asset", "uploads", "upload", "media", "migrations", "migration", "vendor",
]);
const TYPESCRIPT_BUILD_INFO_RULE_ID = "project.typescript.build_info";
const CMAKE_BUILD_RULE_ID = "project.cmake.build";
const JAVA_BUILD_OUTPUT_RULE_ID = "project.java.build_output";
const PYTHON_TEST_ENVS_RULE_ID = "project.python.test_envs";

function hasTypeScriptConfig(entries: readonly import("node:fs").Dirent[]): boolean {
  return entries.some((entry) => entry.isFile() && /^tsconfig(?:[._-][a-zA-Z0-9._-]+)?\.json$/.test(entry.name));
}

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
    rule.status === "published");
  const typeScriptBuildInfoEnabled = registry.rules.some((rule) => rule.id === TYPESCRIPT_BUILD_INFO_RULE_ID &&
    rule.scope === "workdir" && rule.selector.kind === "adapter" && rule.selector.adapterId === "typescript.build_info" &&
    rule.status === "published");
  const cmakeBuildEnabled = registry.rules.some((rule) => rule.id === CMAKE_BUILD_RULE_ID &&
    rule.scope === "workdir" && rule.selector.kind === "adapter" && rule.selector.adapterId === "cmake.verified_build_trees" &&
    rule.status === "published");
  const javaBuildOutputEnabled = registry.rules.some((rule) => rule.id === JAVA_BUILD_OUTPUT_RULE_ID &&
    rule.scope === "workdir" && rule.selector.kind === "adapter" && rule.selector.adapterId === "jvm.project_build_outputs" &&
    rule.status === "published");
  const pythonTestEnvsEnabled = registry.rules.some((rule) => rule.id === PYTHON_TEST_ENVS_RULE_ID &&
    rule.scope === "workdir" && rule.selector.kind === "adapter" && rule.selector.adapterId === "python.test_environments" &&
    rule.status === "published");
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
      if ((typeScriptBuildInfoEnabled && hasTypeScriptConfig(entries)) ||
        (cmakeBuildEnabled && entries.some((entry) => entry.isFile() && entry.name === "CMakeLists.txt")) ||
        (javaBuildOutputEnabled && (entries.some((entry) => entry.isFile() && entry.name === "pom.xml") ||
          (entries.some((entry) => entry.isFile() && (entry.name === "build.gradle" || entry.name === "build.gradle.kts")) &&
            entries.some((entry) => entry.isFile() && (entry.name === "settings.gradle" || entry.name === "settings.gradle.kts"))))) ||
        (pythonTestEnvsEnabled && entries.some((entry) => entry.isFile() &&
          (entry.name === "tox.ini" || entry.name === "noxfile.py"))) ||
        workdirRules.some((rule) =>
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
