import { describe, expect, test } from "bun:test";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { betaExecutionReadiness } from "../../src/services/optimisation-registry/beta-execution";

const registry = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const rule = (id: string) => structuredClone(registry.rules.find((entry) => entry.id === id)!);

describe("code-owned beta executable approval", () => {
  test("admits Yarn Classic, two Linux Python reviews, and two protected Docker inventories", () => {
    expect(betaExecutionReadiness(rule("store.yarn.cache"))).toBe(true);
    for (const id of ["docker.network.unused", "docker.volume.unused"]) expect(betaExecutionReadiness(rule(id))).toBe(true);
    for (const id of ["project.python.virtual_envs", "project.python.test_envs"]) {
      expect(betaExecutionReadiness(rule(id))).toBe(process.platform === "linux" ? true : "beta Python process visibility is Linux-only");
    }
    expect(betaExecutionReadiness(rule("store.deno.cache"))).toBe("beta rule has no code-approved executable release");
  });

  test("rejects a changed Python action, missing live validator, or removable protected inventory", () => {
    const python = rule("project.python.virtual_envs");
    python.validators = python.validators.filter((id) => id !== "resource_still_unused");
    expect(betaExecutionReadiness(python)).not.toBe(true);

    const docker = rule("docker.volume.unused");
    docker.review.tier = "review";
    docker.review.selection = "explicit";
    docker.action = { kind: "adapter", adapterId: "docker.volume.remove" };
    expect(betaExecutionReadiness(docker)).toBe("beta Docker protected inventory binding changed");
  });
});
