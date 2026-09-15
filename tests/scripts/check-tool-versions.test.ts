import { describe, expect, test } from "bun:test";
import { checkToolVersions } from "../../scripts/check-tool-versions";

describe("pre-commit tool version policy", () => {
  const ranges = { bun: ">=1.2.0", typescript: "^5.9.3" };

  test("accepts versions within the declared ranges", () => {
    expect(checkToolVersions({ bun: "1.4.0", typescript: "5.9.3" }, ranges)).toEqual([]);
  });

  test("rejects outdated Bun and incompatible TypeScript", () => {
    const problems = checkToolVersions({ bun: "1.1.9", typescript: "6.0.0" }, ranges);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("Bun 1.1.9");
    expect(problems[1]).toContain("TypeScript 6.0.0");
  });

  test("rejects missing policies and missing local TypeScript", () => {
    const problems = checkToolVersions({ bun: "1.4.0" }, {});
    expect(problems).toHaveLength(3);
    expect(problems).toContain("Local TypeScript is missing from node_modules; run bun install.");
  });
});
