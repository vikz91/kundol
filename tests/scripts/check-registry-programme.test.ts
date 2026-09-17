import { describe, expect, test } from "bun:test";
import baselineJson from "../../registry/baseline-75.json";
import optimisationsJson from "../../registry/optimisations.json";
import { checkRegistryProgramme } from "../../scripts/check-registry-programme";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";

const registry = parseOptimisationRegistry(optimisationsJson);

describe("75-rule programme release ledger", () => {
  test("accounts for every baseline rule or an exact split replacement", () => {
    const result = checkRegistryProgramme(registry, baselineJson, false);
    expect(result.baselineCount).toBe(75);
    expect(result.missing).toEqual([]);
  });

  test("cannot pass the release gate when a baseline rule is unpublished", () => {
    const fixture = structuredClone(optimisationsJson);
    const bunCache = fixture.rules.find((rule) => rule.id === "store.bun.cache");
    if (!bunCache) throw new Error("missing baseline fixture");
    bunCache.status = "proposed";
    const result = checkRegistryProgramme(parseOptimisationRegistry(fixture), baselineJson, true);
    expect(result.missing).toEqual([]);
    expect(result.unpublished).toContain("store.bun.cache");
  });

  test("a removed baseline rule needs every mapped replacement", () => {
    const result = checkRegistryProgramme(registry, {
      baselineIds: baselineJson.baselineIds,
      replacements: { "project.dotnet.bin_obj": ["project.dotnet.obj", "missing.final.output"] },
    }, false);
    expect(result.missing).toEqual(["project.dotnet.bin_obj"]);
  });
});
