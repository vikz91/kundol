import type { RegistryRule } from "./types";

const LINUX_PYTHON_REVIEW: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["project.python.virtual_envs", ["python.project_virtual_environments", "python.virtual_environment.remove_selected"]],
  ["project.python.test_envs", ["python.test_environments", "python.test_environment.remove_selected"]],
] as const);
const DOCKER_PROTECTED_INVENTORY: ReadonlyMap<string, string> = new Map([
  ["docker.network.unused", "docker.networks.unused"],
  ["docker.volume.unused", "docker.volumes.unused"],
] as const);
const USER_REVIEW: ReadonlyMap<string, readonly [string, string]> = new Map([
  ["store.yarn.cache", ["yarn.cache_versioned", "yarn.cache.clean_versioned"]],
] as const);
const PYTHON_LIVE_VALIDATORS = [
  "target_exists", "path_in_scope", "not_symlink", "owner_verified", "target_not_active", "resource_still_unused",
] as const;

/** A beta JSON status never creates executable approval by itself. */
export function betaExecutionReadiness(rule: RegistryRule): true | string {
  const user = USER_REVIEW.get(rule.id);
  if (user) {
    return rule.scope === "user" && rule.selector.kind === "adapter" && rule.selector.adapterId === user[0] &&
      rule.action.kind === "adapter" && rule.action.adapterId === user[1] && rule.review.tier === "review" &&
      rule.review.selection === "explicit" && !rule.review.forceEligible &&
      ["tool_available", "target_exists", "tool_idle"].every((id) => rule.validators.includes(id))
      ? true : "beta user owner binding or live validators changed";
  }
  const python = LINUX_PYTHON_REVIEW.get(rule.id);
  if (python) {
    if (process.platform !== "linux") return "beta Python process visibility is Linux-only";
    if (rule.scope !== "workdir" || rule.selector.kind !== "adapter" || rule.selector.adapterId !== python[0] ||
      rule.action.kind !== "adapter" || rule.action.adapterId !== python[1] || rule.review.tier !== "review" ||
      rule.review.selection !== "explicit" || rule.review.forceEligible ||
      !PYTHON_LIVE_VALIDATORS.every((id) => rule.validators.includes(id))) {
      return "beta Python owner binding or live validators changed";
    }
    return true;
  }
  const dockerSelector = DOCKER_PROTECTED_INVENTORY.get(rule.id);
  if (dockerSelector) {
    return rule.scope === "docker_context" && rule.selector.kind === "adapter" && rule.selector.adapterId === dockerSelector &&
      rule.action.kind === "none" && rule.review.tier === "protected" && rule.review.selection === "none" && !rule.review.forceEligible
      ? true : "beta Docker protected inventory binding changed";
  }
  return "beta rule has no code-approved executable release";
}
