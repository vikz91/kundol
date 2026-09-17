import type { OptimisationRegistry } from "../../core/optimisation-registry/schema";

export type RegistryRule = OptimisationRegistry["rules"][number];
export type RegistryTier = RegistryRule["review"]["tier"];

export interface RegistryCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  truncated?: boolean;
}

export type RegistryCommandRunner = (argv: readonly string[], cwd: string) => Promise<RegistryCommandResult>;

export interface RegistryEngineContext {
  homeDir: string;
  projectRoots: readonly string[];
  workdirRoot?: string;
  userRoots?: readonly string[];
  commandCwd?: string;
}

export interface RegistryPathTarget {
  kind: "path";
  key: string;
  absolutePath: string;
  realPath: string;
  scopeRoot: string;
  fileKind: "file" | "directory";
  device: number;
  inode: number;
  sizeBytes: number | null;
}

export interface RegistryResourceTarget {
  kind: "resource";
  key: string;
  ownerId: string;
  resourceId: string;
  fingerprint: string;
  sizeBytes: number | null;
}

export type RegistryTarget = RegistryPathTarget | RegistryResourceTarget;

export interface RegistryCandidate {
  id: string;
  ruleId: string;
  categoryId: string;
  label: string;
  description: string;
  scope: RegistryRule["scope"];
  status: RegistryRule["status"];
  tier: RegistryTier;
  forceEligible: boolean;
  action: RegistryRule["action"];
  target: RegistryTarget;
  evidence: readonly string[];
  sources: readonly { title: string; url: string }[];
}

export interface RegistryRuleSkip {
  ruleId: string;
  reason: string;
}

export interface RegistryProbeResult {
  planId: string;
  candidates: readonly RegistryCandidate[];
  skippedRules: readonly RegistryRuleSkip[];
  knownBytes: number;
}

export interface RegistryReviewResult {
  planId: string;
  force: boolean;
  selected: readonly RegistryCandidate[];
  blocked: readonly { candidateId: string; reason: string }[];
}

export interface RegistryApplyResult {
  applied: readonly { candidate: RegistryCandidate; reclaimedBytes: number | null }[];
  skipped: readonly { candidate: RegistryCandidate; reason: string }[];
  failed: readonly { candidate: RegistryCandidate; error: string }[];
  knownReclaimedBytes: number;
  auditWarnings: readonly string[];
}

export interface RegistryAdapterResourceTarget {
  kind?: "resource";
  ownerId: string;
  resourceId: string;
  fingerprint: string;
  sizeBytes?: number | null;
  evidence?: readonly string[];
}

export interface RegistryAdapterPathTarget {
  kind: "path";
  absolutePath: string;
  scopeRoot: string;
  targetKind: "file" | "directory" | "either";
  evidence?: readonly string[];
}

export type RegistryAdapterTarget = RegistryAdapterResourceTarget | RegistryAdapterPathTarget;
export type RegistrySelectorList = (rule: RegistryRule, context: RegistryEngineContext) => Promise<readonly RegistryAdapterTarget[]>;
export type RegistrySelectorLookup = (rule: RegistryRule, reviewed: RegistryTarget, context: RegistryEngineContext) => Promise<RegistryAdapterTarget | null>;
export type RegistrySelectorAdapter = RegistrySelectorList | { list: RegistrySelectorList; lookup: RegistrySelectorLookup };
export type RegistryActionAdapter = (rule: RegistryRule, candidate: RegistryCandidate, context: RegistryEngineContext) => Promise<{ reclaimedBytes?: number | null } | void>;
export type RegistryValidator = (rule: RegistryRule, candidate: RegistryCandidate, context: RegistryEngineContext) => Promise<true | string>;

export interface RegistryAuditEvent {
  phase: "attempt" | "applied" | "skipped" | "failed";
  ruleId: string;
  candidateId: string;
  targetKey: string;
  reason?: string;
}

export type RegistryAuditSink = (event: RegistryAuditEvent) => Promise<void>;
