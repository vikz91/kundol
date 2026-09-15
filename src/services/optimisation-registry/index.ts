export { OptimisationRegistryEngine, type RegistryEngineOptions } from "./engine";
export { createCliRegistryEngine, type CliRegistryEngineOptions } from "./cli-bindings";
export { discoverRegistryProjectRoots, type RegistryProjectRootsResult } from "./project-roots";
export { isKnownActionCommand, isKnownProbeCommand, runRegistryCommand } from "./commands";
export type {
  RegistryActionAdapter,
  RegistryAdapterTarget,
  RegistryApplyResult,
  RegistryAuditEvent,
  RegistryAuditSink,
  RegistryCandidate,
  RegistryCommandResult,
  RegistryCommandRunner,
  RegistryEngineContext,
  RegistryPathTarget,
  RegistryProbeResult,
  RegistryResourceTarget,
  RegistryReviewResult,
  RegistryRule,
  RegistryRuleSkip,
  RegistrySelectorAdapter,
  RegistryTarget,
  RegistryValidator,
} from "./types";
