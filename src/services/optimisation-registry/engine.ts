import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../core/optimisation-registry/schema";
import { isApprovedOwnerCommandRule, isKnownActionCommand, isKnownProbeCommand, runRegistryCommand } from "./commands";
import { capturePathTarget, findGeneratedTargets, hasProjectMarker, isApprovedGeneratedSelector, removeGeneratedPath, samePathIdentity } from "./path-targets";
import type {
  RegistryActionAdapter,
  RegistryApplyResult,
  RegistryAuditSink,
  RegistryCandidate,
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

const BUILTIN_VALIDATORS = new Set(["target_exists", "path_in_scope", "not_symlink", "project_marker"]);
const REQUIRED_GENERATED_VALIDATORS = ["target_exists", "path_in_scope", "not_symlink", "project_marker", "target_not_active"];
const TIER_PRIORITY = { safe: 0, review: 1, protected: 2 } as const;

export interface RegistryEngineOptions {
  registry: unknown;
  context: RegistryEngineContext;
  runner?: RegistryCommandRunner;
  selectorAdapters?: Readonly<Record<string, RegistrySelectorAdapter>>;
  actionAdapters?: Readonly<Record<string, RegistryActionAdapter>>;
  validators?: Readonly<Record<string, RegistryValidator>>;
  audit: RegistryAuditSink;
}

interface StoredReview {
  force: boolean;
  selected: readonly RegistryCandidate[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function targetId(ruleId: string, target: RegistryTarget): string {
  return `${ruleId}@${target.key}`;
}

function isOverlappingTarget(left: RegistryTarget, right: RegistryTarget): boolean {
  if (left.key === right.key) return true;
  if (left.kind !== "path" || right.kind !== "path") return false;
  const leftToRight = path.relative(left.realPath, right.realPath);
  const rightToLeft = path.relative(right.realPath, left.realPath);
  return (leftToRight !== "" && !leftToRight.startsWith("..") && !path.isAbsolute(leftToRight)) ||
    (rightToLeft !== "" && !rightToLeft.startsWith("..") && !path.isAbsolute(rightToLeft));
}

function preferCandidate(left: RegistryCandidate, right: RegistryCandidate): RegistryCandidate {
  const tierDifference = TIER_PRIORITY[left.tier] - TIER_PRIORITY[right.tier];
  if (tierDifference !== 0) return tierDifference > 0 ? left : right;
  if (left.target.kind === "path" && right.target.kind === "path") {
    const depthDifference = left.target.realPath.split(path.sep).length - right.target.realPath.split(path.sep).length;
    if (depthDifference !== 0) return depthDifference < 0 ? left : right;
  }
  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

function deduplicate(candidates: readonly RegistryCandidate[]): RegistryCandidate[] {
  const unique: RegistryCandidate[] = [];
  for (const candidate of [...candidates].sort((left, right) => left.id.localeCompare(right.id))) {
    const overlapIndex = unique.findIndex((existing) => isOverlappingTarget(existing.target, candidate.target));
    if (overlapIndex < 0) unique.push(candidate);
    else unique[overlapIndex] = preferCandidate(unique[overlapIndex]!, candidate);
  }
  return unique.sort((left, right) => left.id.localeCompare(right.id));
}

export class OptimisationRegistryEngine {
  readonly registry: OptimisationRegistry;
  readonly context: RegistryEngineContext;
  readonly fingerprint: string;
  private readonly runner: RegistryCommandRunner;
  private readonly selectorAdapters: Readonly<Record<string, RegistrySelectorAdapter>>;
  private readonly actionAdapters: Readonly<Record<string, RegistryActionAdapter>>;
  private readonly validators: Readonly<Record<string, RegistryValidator>>;
  private readonly audit: RegistryAuditSink;
  private readonly probes = new Map<string, RegistryProbeResult>();
  private readonly reviews = new Map<string, StoredReview>();

  constructor(options: RegistryEngineOptions) {
    this.registry = deepFreeze(parseOptimisationRegistry(options.registry));
    this.context = deepFreeze({
      homeDir: path.resolve(options.context.homeDir),
      projectRoots: options.context.projectRoots.map((root) => path.resolve(root)),
      ...(options.context.userRoots ? { userRoots: options.context.userRoots.map((root) => path.resolve(root)) } : {}),
      ...(options.context.commandCwd ? { commandCwd: path.resolve(options.context.commandCwd) } : {}),
    });
    this.fingerprint = createHash("sha256").update(JSON.stringify(this.registry)).digest("hex");
    this.runner = options.runner ?? runRegistryCommand;
    this.selectorAdapters = options.selectorAdapters ?? {};
    this.actionAdapters = options.actionAdapters ?? {};
    this.validators = options.validators ?? {};
    this.audit = options.audit;
  }

  async probe(options: { includeBeta?: boolean; ruleIds?: readonly string[] } = {}): Promise<RegistryProbeResult> {
    const candidates: RegistryCandidate[] = [];
    const skippedRules: RegistryRuleSkip[] = [];
    const requested = options.ruleIds ? new Set(options.ruleIds) : null;
    for (const rule of this.registry.rules) {
      if (requested && !requested.has(rule.id)) continue;
      const readiness = this.ruleReadiness(rule, options.includeBeta ?? false);
      if (readiness !== true) {
        skippedRules.push({ ruleId: rule.id, reason: readiness });
        continue;
      }
      try {
        const found = await this.probeRule(rule);
        candidates.push(...found);
      } catch (error) {
        skippedRules.push({ ruleId: rule.id, reason: errorMessage(error) });
      }
    }
    const unique = deduplicate(candidates);
    const result: RegistryProbeResult = deepFreeze({
      planId: randomUUID(),
      candidates: unique,
      skippedRules,
      knownBytes: unique.reduce((total, candidate) => total + (candidate.target.sizeBytes ?? 0), 0),
    });
    this.probes.set(result.planId, result);
    return result;
  }

  review(probe: RegistryProbeResult, input: { force: boolean; confirmed?: boolean; selectedIds?: readonly string[] }): RegistryReviewResult {
    if (this.probes.get(probe.planId) !== probe) throw new Error("probe plan was not issued by this engine");
    const selected: RegistryCandidate[] = [];
    const blocked: { candidateId: string; reason: string }[] = [];
    const wanted = new Set(input.selectedIds ?? []);
    for (const candidate of probe.candidates) {
      if (input.force) {
        if (candidate.tier === "safe" && candidate.forceEligible) selected.push(candidate);
        continue;
      }
      if (!wanted.has(candidate.id)) continue;
      if (candidate.tier === "protected") blocked.push({ candidateId: candidate.id, reason: "protected inventory cannot be selected" });
      else if (!input.confirmed) blocked.push({ candidateId: candidate.id, reason: "selection requires confirmed review" });
      else selected.push(candidate);
    }
    for (const id of wanted) {
      if (!probe.candidates.some((candidate) => candidate.id === id)) blocked.push({ candidateId: id, reason: "candidate was not in probe plan" });
    }
    const result: RegistryReviewResult = deepFreeze({ planId: probe.planId, force: input.force, selected, blocked });
    this.reviews.set(probe.planId, { force: input.force, selected: [...selected] });
    return result;
  }

  async apply(review: RegistryReviewResult): Promise<RegistryApplyResult> {
    const stored = this.reviews.get(review.planId);
    if (!stored || stored.force !== review.force || stored.selected.length !== review.selected.length ||
      stored.selected.some((candidate, index) => candidate !== review.selected[index])) {
      throw new Error("review plan was not issued by this engine");
    }
    this.reviews.delete(review.planId);
    this.probes.delete(review.planId);
    const applied: { candidate: RegistryCandidate; reclaimedBytes: number | null }[] = [];
    const skipped: { candidate: RegistryCandidate; reason: string }[] = [];
    const failed: { candidate: RegistryCandidate; error: string }[] = [];
    const auditWarnings: string[] = [];
    for (const candidate of stored.selected) {
      const rule = this.registry.rules.find((entry) => entry.id === candidate.ruleId);
      if (!rule || (rule.status !== "published" && rule.status !== "beta") || this.registry.integration !== "engine_ready") {
        const reason = "rule is no longer executable";
        skipped.push({ candidate, reason });
        await this.safeAudit({ phase: "skipped", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key, reason }, auditWarnings);
        continue;
      }
      try {
        const live = (await this.probeRule(rule)).find((entry) => entry.id === candidate.id);
        if (!live || !this.sameTargetIdentity(candidate.target, live.target)) {
          const reason = "target changed or disappeared since review";
          skipped.push({ candidate, reason });
          await this.safeAudit({ phase: "skipped", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key, reason }, auditWarnings);
          continue;
        }
        const validation = await this.checkValidators(rule, live);
        if (validation !== true) {
          skipped.push({ candidate, reason: validation });
          await this.safeAudit({ phase: "skipped", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key, reason: validation }, auditWarnings);
          continue;
        }
        await this.audit({ phase: "attempt", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key });
        const finalValidation = await this.checkValidators(rule, live);
        if (finalValidation !== true) {
          skipped.push({ candidate, reason: finalValidation });
          await this.safeAudit({ phase: "skipped", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key, reason: finalValidation }, auditWarnings);
          continue;
        }
        const reclaimedBytes = await this.execute(rule, live);
        applied.push({ candidate, reclaimedBytes });
        await this.safeAudit({ phase: "applied", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key }, auditWarnings);
      } catch (error) {
        const message = errorMessage(error);
        failed.push({ candidate, error: message });
        await this.safeAudit({ phase: "failed", ruleId: candidate.ruleId, candidateId: candidate.id, targetKey: candidate.target.key, reason: message }, auditWarnings);
      }
    }
    return {
      applied,
      skipped,
      failed,
      knownReclaimedBytes: applied.reduce((total, entry) => total + (entry.reclaimedBytes ?? 0), 0),
      auditWarnings,
    };
  }

  private ruleReadiness(rule: RegistryRule, includeBeta: boolean): true | string {
    if (this.registry.integration !== "engine_ready") return "registry is catalogue-only";
    if (rule.status === "proposed" || rule.status === "wip") return `rule status ${rule.status} is not executable`;
    if (rule.status === "beta" && !includeBeta) return "beta rule requires explicit experimental opt-in";
    if (rule.selector.kind === "adapter" && !this.selectorAdapters[rule.selector.adapterId]) return `selector adapter unavailable: ${rule.selector.adapterId}`;
    if (rule.action.kind === "adapter" && !this.actionAdapters[rule.action.adapterId]) return `action adapter unavailable: ${rule.action.adapterId}`;
    if (rule.action.kind === "command" && !isKnownActionCommand(rule.action.argv)) return "command action is not code-approved";
    if (rule.action.kind === "command" && !isApprovedOwnerCommandRule(rule)) return "command action does not match its code-approved owner selector";
    if (rule.selector.kind === "tool_cache" && !isKnownProbeCommand(rule.selector.pathCommand.argv)) return "cache path command is not code-approved";
    if (rule.probeCommands?.some((command) => !isKnownProbeCommand(command.argv))) return "probe command is not code-approved";
    if (rule.action.kind === "remove_generated" && !REQUIRED_GENERATED_VALIDATORS.every((validator) => rule.validators.includes(validator))) {
      return "generated removal lacks mandatory live validators";
    }
    if (rule.action.kind === "remove_generated" && !isApprovedGeneratedSelector(rule)) return "generated selector is not code-approved";
    if (rule.action.kind === "remove_generated" && rule.selector.kind === "generated_suffix" && !rule.validators.includes("owner_verified")) {
      return "suffix removal requires owner verification";
    }
    for (const validator of rule.validators) {
      if (!BUILTIN_VALIDATORS.has(validator) && !this.validators[validator]) return `validator unavailable: ${validator}`;
    }
    return true;
  }

  private async probeRule(rule: RegistryRule): Promise<RegistryCandidate[]> {
    const cwd = this.context.commandCwd ?? this.context.homeDir;
    for (const command of rule.probeCommands ?? []) {
      const result = await this.runner(command.argv, cwd);
      if (result.exitCode !== 0) throw new Error(`probe failed: ${result.stderr || result.stdout || command.argv.join(" ")}`);
    }
    let targets: { target: RegistryTarget; evidence: readonly string[] }[];
    if (rule.selector.kind === "generated_path" || rule.selector.kind === "generated_suffix") {
      const markers = rule.selector.markers;
      targets = (await findGeneratedTargets(rule, this.context)).map((target) => ({ target, evidence: [`project marker: ${markers.join(" or ")}`] }));
    } else if (rule.selector.kind === "tool_cache") {
      const result = await this.runner(rule.selector.pathCommand.argv, cwd);
      if (result.exitCode !== 0) throw new Error(`cache path probe failed: ${result.stderr || result.stdout}`);
      const rawPath = result.stdout.trim();
      if (!path.isAbsolute(rawPath) || rawPath.includes("\n") || rawPath.includes("\r")) throw new Error("cache path probe did not return one absolute path");
      const allowedRoots = [this.context.homeDir, ...(this.context.userRoots ?? [])];
      let target: RegistryPathTarget | null = null;
      for (const root of allowedRoots) {
        try {
          target = await capturePathTarget(rawPath, root, "directory");
          break;
        } catch {
          continue;
        }
      }
      if (!target) throw new Error("cache path lies outside approved user roots or is unsafe");
      targets = [{ target, evidence: [`owner path command: ${rule.selector.pathCommand.argv.join(" ")}`] }];
    } else {
      const adapter = this.selectorAdapters[rule.selector.adapterId];
      if (!adapter) throw new Error(`selector adapter unavailable: ${rule.selector.adapterId}`);
      targets = (await adapter(rule, this.context)).map((found) => {
        if (!found.ownerId || !found.resourceId || !found.fingerprint ||
          (found.sizeBytes !== undefined && found.sizeBytes !== null && (!Number.isFinite(found.sizeBytes) || found.sizeBytes < 0))) {
          throw new Error("selector adapter returned an incomplete resource identity");
        }
        return {
          target: {
            kind: "resource",
            key: `resource:${JSON.stringify([rule.scope, found.ownerId, found.resourceId])}`,
            ownerId: found.ownerId,
            resourceId: found.resourceId,
            fingerprint: found.fingerprint,
            sizeBytes: found.sizeBytes ?? null,
          } satisfies RegistryResourceTarget,
          evidence: found.evidence ?? [],
        };
      });
    }
    const candidates: RegistryCandidate[] = [];
    for (const { target, evidence } of targets) {
      const candidate: RegistryCandidate = {
        id: targetId(rule.id, target),
        ruleId: rule.id,
        categoryId: rule.categoryId,
        label: rule.label,
        description: rule.description,
        scope: rule.scope,
        status: rule.status,
        tier: rule.review.tier,
        forceEligible: rule.review.forceEligible,
        action: rule.action,
        target,
        evidence,
        sources: rule.sourceRefs.map((reference) => this.registry.sources[reference]!),
      };
      if (await this.checkValidators(rule, candidate) === true) candidates.push(candidate);
    }
    return candidates;
  }

  private async checkValidators(rule: RegistryRule, candidate: RegistryCandidate): Promise<true | string> {
    for (const validatorId of rule.validators) {
      const custom = this.validators[validatorId];
      if (custom && (candidate.target.kind === "resource" || !BUILTIN_VALIDATORS.has(validatorId))) {
        const result = await custom(rule, candidate, this.context);
        if (result !== true) return result;
        continue;
      }
      if (!BUILTIN_VALIDATORS.has(validatorId)) return `validator unavailable: ${validatorId}`;
      if (candidate.target.kind !== "path") return `${validatorId} requires a path target or code-owned validator`;
      if (validatorId === "project_marker") {
        if ((rule.selector.kind !== "generated_path" && rule.selector.kind !== "generated_suffix") ||
          !(await hasProjectMarker(candidate.target.scopeRoot, rule.selector.markers))) return "project marker no longer matches";
      } else {
        try {
          await capturePathTarget(candidate.target.absolutePath, candidate.target.scopeRoot, candidate.target.fileKind, false);
        } catch (error) {
          return `${validatorId}: ${errorMessage(error)}`;
        }
      }
    }
    return true;
  }

  private sameTargetIdentity(left: RegistryTarget, right: RegistryTarget): boolean {
    if (left.kind !== right.kind) return false;
    if (left.kind === "path" && right.kind === "path") return samePathIdentity(left, right);
    if (left.kind === "resource" && right.kind === "resource") {
      return left.key === right.key && left.ownerId === right.ownerId && left.resourceId === right.resourceId && left.fingerprint === right.fingerprint;
    }
    return false;
  }

  private async execute(rule: RegistryRule, candidate: RegistryCandidate): Promise<number | null> {
    if (rule.action.kind === "none") throw new Error("inventory-only rule cannot execute");
    if (rule.action.kind === "remove_generated") {
      if (candidate.target.kind !== "path") throw new Error("generated action requires a path target");
      const live = await capturePathTarget(candidate.target.absolutePath, candidate.target.scopeRoot, candidate.target.fileKind, false);
      if (!samePathIdentity(candidate.target, live)) throw new Error("target changed before removal");
      await removeGeneratedPath(live);
      return candidate.target.sizeBytes;
    }
    if (rule.action.kind === "command") {
      if (!isKnownActionCommand(rule.action.argv)) throw new Error("command action is not code-approved");
      const result = await this.runner(rule.action.argv, this.context.commandCwd ?? this.context.homeDir);
      if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `command exited ${result.exitCode}`);
      return null;
    }
    const adapter = this.actionAdapters[rule.action.adapterId];
    if (!adapter) throw new Error(`action adapter unavailable: ${rule.action.adapterId}`);
    const result = await adapter(rule, candidate, this.context);
    return result?.reclaimedBytes ?? null;
  }

  private async safeAudit(event: Parameters<RegistryAuditSink>[0], warnings: string[]): Promise<void> {
    try {
      await this.audit(event);
    } catch (error) {
      warnings.push(`audit ${event.phase} failed for ${event.candidateId}: ${errorMessage(error)}`);
    }
  }
}
