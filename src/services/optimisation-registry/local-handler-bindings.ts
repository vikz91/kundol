import {
  BUN_CACHE_ACTION_ADAPTER_ID, BUN_CACHE_SELECTOR_ADAPTER_ID,
  createBunCacheActionAdapter, createBunCacheSelectorAdapter,
} from "./bun-cache";
import { cmakeBuildAction, cmakeBuildOwnerVerified, cmakeBuildProjectMarker, cmakeBuildSelector } from "./cmake-build";
import {
  CONDA_SAFE_ACTION_ADAPTER_ID, CONDA_SAFE_SELECTOR_ADAPTER_ID,
  condaSafeCacheOwnerVerified, createCondaSafeCacheActionAdapter,
  createCondaSafeCacheSelectorAdapter, type CondaPinnedRunner,
} from "./conda-safe-cache";
import {
  javaBuildOutputAction, javaBuildOutputOwnerVerified,
  javaBuildOutputProjectMarker, javaBuildOutputSelector,
} from "./java-build-output";
import {
  NUGET_HTTP_ACTION_ADAPTER_ID, NUGET_HTTP_SELECTOR_ADAPTER_ID,
  NUGET_PACKAGES_ACTION_ADAPTER_ID, NUGET_PACKAGES_SELECTOR_ADAPTER_ID,
  createNugetCacheActionAdapter, createNugetCacheSelectorAdapter, type NugetPinnedRunner,
} from "./nuget-cache";
import { pythonVirtualEnvBindings } from "./python-virtual-env";
import { pythonTestEnvironmentBindings } from "./python-test-environments";
import {
  typescriptBuildInfoAction, typescriptBuildInfoOwnerVerified,
  typescriptBuildInfoProjectMarker, typescriptBuildInfoSelector,
} from "./typescript-build-info";
import {
  YARN_CACHE_ACTION_ADAPTER_ID, YARN_CACHE_SELECTOR_ADAPTER_ID,
  createYarnCacheActionAdapter, createYarnCacheSelectorAdapter,
} from "./yarn-cache";
import type { RegistryActionAdapter, RegistryCommandRunner, RegistrySelectorAdapter, RegistryValidator } from "./types";

export interface LocalHandlerOptions {
  runner: RegistryCommandRunner;
  nugetRunner: NugetPinnedRunner;
  condaRunner: CondaPinnedRunner;
  now: () => Date;
}

export interface LocalHandlerBindings {
  selectorAdapters: Readonly<Record<string, RegistrySelectorAdapter>>;
  actionAdapters: Readonly<Record<string, RegistryActionAdapter>>;
  ruleValidators: Readonly<Record<string, Readonly<Record<string, RegistryValidator>>>>;
}

interface HandlerManifest {
  ruleId: string;
  selectorId: string;
  selector: RegistrySelectorAdapter;
  actionId: string;
  action: RegistryActionAdapter;
  validators?: Readonly<Record<string, RegistryValidator>>;
}

function exactSelectorAvailable(expectedId: string, owner: string): RegistryValidator {
  return async (rule) => rule.selector.kind === "adapter" && rule.selector.adapterId === expectedId
    ? true : `${owner} owner selector changed`;
}

/** One code-owned manifest per implemented rule; JSON cannot invent a handler. */
export function createLocalHandlerBindings(options: LocalHandlerOptions): LocalHandlerBindings {
  const owner = { runner: options.runner, now: options.now };
  const nuget = { runner: options.nugetRunner, now: options.now };
  const conda = { runner: options.condaRunner, now: options.now };
  const manifests: readonly HandlerManifest[] = [
    {
      ruleId: "store.bun.cache", selectorId: BUN_CACHE_SELECTOR_ADAPTER_ID,
      selector: createBunCacheSelectorAdapter(owner), actionId: BUN_CACHE_ACTION_ADAPTER_ID,
      action: createBunCacheActionAdapter(owner),
      validators: { tool_available: exactSelectorAvailable(BUN_CACHE_SELECTOR_ADAPTER_ID, "Bun") },
    },
    {
      ruleId: "store.yarn.cache", selectorId: YARN_CACHE_SELECTOR_ADAPTER_ID,
      selector: createYarnCacheSelectorAdapter(owner), actionId: YARN_CACHE_ACTION_ADAPTER_ID,
      action: createYarnCacheActionAdapter(owner),
      validators: { tool_available: exactSelectorAvailable(YARN_CACHE_SELECTOR_ADAPTER_ID, "Yarn") },
    },
    {
      ruleId: "store.nuget.http_cache", selectorId: NUGET_HTTP_SELECTOR_ADAPTER_ID,
      selector: createNugetCacheSelectorAdapter(nuget), actionId: NUGET_HTTP_ACTION_ADAPTER_ID,
      action: createNugetCacheActionAdapter(nuget),
      validators: { tool_available: exactSelectorAvailable(NUGET_HTTP_SELECTOR_ADAPTER_ID, "NuGet HTTP") },
    },
    {
      ruleId: "store.nuget.global_packages", selectorId: NUGET_PACKAGES_SELECTOR_ADAPTER_ID,
      selector: createNugetCacheSelectorAdapter(nuget), actionId: NUGET_PACKAGES_ACTION_ADAPTER_ID,
      action: createNugetCacheActionAdapter(nuget),
      validators: { tool_available: exactSelectorAvailable(NUGET_PACKAGES_SELECTOR_ADAPTER_ID, "NuGet packages") },
    },
    {
      ruleId: "store.conda.safe_cache", selectorId: CONDA_SAFE_SELECTOR_ADAPTER_ID,
      selector: createCondaSafeCacheSelectorAdapter(conda), actionId: CONDA_SAFE_ACTION_ADAPTER_ID,
      action: createCondaSafeCacheActionAdapter(conda),
      validators: {
        tool_available: exactSelectorAvailable(CONDA_SAFE_SELECTOR_ADAPTER_ID, "Conda"),
        owner_verified: condaSafeCacheOwnerVerified,
      },
    },
    {
      ruleId: "project.typescript.build_info", selectorId: "typescript.build_info",
      selector: typescriptBuildInfoSelector, actionId: "typescript.build_info.remove",
      action: typescriptBuildInfoAction,
      validators: { project_marker: typescriptBuildInfoProjectMarker, owner_verified: typescriptBuildInfoOwnerVerified },
    },
    {
      ruleId: "project.cmake.build", selectorId: "cmake.verified_build_trees",
      selector: cmakeBuildSelector, actionId: "cmake.build.remove", action: cmakeBuildAction,
      validators: { project_marker: cmakeBuildProjectMarker, owner_verified: cmakeBuildOwnerVerified },
    },
    {
      ruleId: "project.java.build_output", selectorId: "jvm.project_build_outputs",
      selector: javaBuildOutputSelector, actionId: "jvm.project_build.remove_verified",
      action: javaBuildOutputAction,
      validators: { project_marker: javaBuildOutputProjectMarker, owner_verified: javaBuildOutputOwnerVerified },
    },
    {
      ruleId: "project.python.virtual_envs", selectorId: "python.project_virtual_environments",
      selector: pythonVirtualEnvBindings.selector, actionId: "python.virtual_environment.remove_selected",
      action: pythonVirtualEnvBindings.action,
      validators: {
        owner_verified: pythonVirtualEnvBindings.ownerVerified,
        resource_still_unused: pythonVirtualEnvBindings.processUnused,
      },
    },
    {
      ruleId: "project.python.test_envs", selectorId: "python.test_environments",
      selector: pythonTestEnvironmentBindings.selector,
      actionId: "python.test_environment.remove_selected", action: pythonTestEnvironmentBindings.action,
      validators: {
        owner_verified: pythonTestEnvironmentBindings.ownerVerified,
        project_marker: pythonTestEnvironmentBindings.projectMarker,
        resource_still_unused: pythonTestEnvironmentBindings.processUnused,
      },
    },
  ];
  const selectorAdapters: Record<string, RegistrySelectorAdapter> = Object.create(null) as Record<string, RegistrySelectorAdapter>;
  const actionAdapters: Record<string, RegistryActionAdapter> = Object.create(null) as Record<string, RegistryActionAdapter>;
  const ruleValidators: Record<string, Readonly<Record<string, RegistryValidator>>> = Object.create(null) as Record<string, Readonly<Record<string, RegistryValidator>>>;
  for (const manifest of manifests) {
    if (selectorAdapters[manifest.selectorId] || actionAdapters[manifest.actionId] || ruleValidators[manifest.ruleId]) {
      throw new Error(`duplicate code-owned handler manifest: ${manifest.ruleId}`);
    }
    selectorAdapters[manifest.selectorId] = manifest.selector;
    actionAdapters[manifest.actionId] = manifest.action;
    ruleValidators[manifest.ruleId] = manifest.validators ?? {};
  }
  return { selectorAdapters, actionAdapters, ruleValidators };
}
