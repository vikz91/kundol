import baselineJson from "../registry/baseline-75.json";
import optimisationsJson from "../registry/optimisations.json";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../src/core/optimisation-registry/schema";

export interface ProgrammeResult {
  baselineCount: number;
  missing: readonly string[];
  unpublished: readonly string[];
}

interface BaselineProgramme {
  baselineIds: readonly string[];
  replacements: Readonly<Record<string, readonly string[]>>;
}

/** Prevent a split proposal from vanishing without an explicit replacement ledger. */
export function checkRegistryProgramme(registry: OptimisationRegistry, baseline: BaselineProgramme, release: boolean): ProgrammeResult {
  const ids = baseline.baselineIds;
  if (ids.length !== 75 || new Set(ids).size !== ids.length || ids.some((id) => !/^[a-z0-9]+(?:[._][a-z0-9]+)*$/.test(id))) {
    throw new Error("the 75-rule baseline ledger is invalid");
  }
  const current = new Map(registry.rules.map((rule) => [rule.id, rule]));
  const missing: string[] = [];
  const unpublished: string[] = [];
  for (const id of ids) {
    const original = current.get(id);
    if (original) {
      if (release && original.status !== "published") unpublished.push(id);
      continue;
    }
    const replacements = baseline.replacements[id];
    if (!replacements?.length || new Set(replacements).size !== replacements.length || replacements.some((replacement) => !current.has(replacement))) {
      missing.push(id);
      continue;
    }
    if (release && replacements.some((replacement) => current.get(replacement)!.status !== "published")) unpublished.push(id);
  }
  return { baselineCount: ids.length, missing, unpublished };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--release")) {
    console.error("usage: bun run scripts/check-registry-programme.ts [--release]");
    process.exit(2);
  }
  const release = args[0] === "--release";
  const registry = parseOptimisationRegistry(optimisationsJson);
  const baseline: BaselineProgramme = {
    baselineIds: baselineJson.baselineIds,
    replacements: baselineJson.replacements,
  };
  const result = checkRegistryProgramme(registry, baseline, release);
  if (result.missing.length || result.unpublished.length) {
    console.error(`Programme gate failed: missing ${result.missing.length}; unpublished ${result.unpublished.length}.`);
    for (const id of result.missing) console.error(`Missing baseline rule or replacement: ${id}`);
    for (const id of result.unpublished) console.error(`Not published: ${id}`);
    process.exit(1);
  }
  console.log(`${release ? "Release" : "Presence"} gate passed: ${result.baselineCount} baseline rules accounted for.`);
}
