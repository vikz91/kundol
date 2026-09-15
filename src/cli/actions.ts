import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import optimisationsJson from "../../registry/optimisations.json";
import { openKundolDatabase } from "../db/client";
import { ActionRepository } from "../db/repositories/action-repository";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../core/optimisation-registry/schema";
import { formatBytes } from "../core/registry/format";
import { recordSessionAudit } from "../services/audit/session-audit-log";
import {
  createCliRegistryEngine,
  discoverRegistryProjectRoots,
  type RegistryApplyResult,
  type RegistryAuditEvent,
  type RegistryCandidate,
  type RegistryCommandRunner,
  type RegistryProbeResult,
  type RegistryProjectRootsResult,
} from "../services/optimisation-registry";
import {
  applyStartupOptimisePlan,
  scanStartupOptimiseTargets,
  type StartupApplyResult,
  type StartupCandidate,
  type StartupCommandRunner,
  type StartupOptimisePlan,
} from "../services/startup-optimizer";
import { exitCodes, type ExitCode } from "../shared/exit-codes";
import type { Output } from "../shared/output";
import { formatWelcomeMessage } from "./welcome";

export interface CommandResult {
  exitCode: ExitCode;
}

export interface CommandContext {
  output: Output;
  registry?: OptimisationRegistry;
  registryRunner?: RegistryCommandRunner;
  registryNow?: () => Date;
  registrySelect?: (probe: RegistryProbeResult) => Promise<readonly string[]>;
  databasePath?: string;
  homeDir?: string;
  startupPlatform?: NodeJS.Platform;
  startupRunner?: StartupCommandRunner;
}

export interface OptimiseRunOptions {
  force: boolean;
  json: boolean;
}

export interface OptimiseProjectsOptions extends OptimiseRunOptions {
  maxDepth: number;
}

const ok: CommandResult = { exitCode: exitCodes.ok };

export function showWelcome(context: CommandContext): CommandResult {
  context.output.writeLine(formatWelcomeMessage());
  context.output.writeLine("Examples:");
  context.output.writeLine("  kundol optimise storage");
  context.output.writeLine("  kundol optimise storage -f");
  context.output.writeLine("  kundol optimise startup");
  context.output.writeLine("  kundol optimise projects ~/Projects -f");
  context.output.writeLine("  kundol tools available");
  context.output.writeLine("  kundol tools request");
  context.output.writeLine("  kundol issue");
  return ok;
}

export async function optimiseStorage(context: CommandContext, options: OptimiseRunOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "STORAGE_SCAN" });
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const engine = registryEngine(context, registry, []);
  const ruleIds = registry.rules.filter((rule) => rule.scope === "user").map((rule) => rule.id);
  const preview = await withSpinner("Scanning storage targets", () => engine.probe({ ruleIds }));
  recordAction(context, "STORAGE_SCAN", {
    candidateCount: preview.candidates.length,
    safeSelectedCount: safeRegistryCandidates(preview).length,
    knownReclaimableBytes: preview.knownBytes,
    registryFingerprint: engine.fingerprint,
  });

  if (options.json) {
    writeJson(context, preview);
  } else {
    writeRegistryPlan(context, "Storage", preview, registry);
  }

  const selectedIds = await selectRegistryCandidates(context, preview, options.force);
  if (selectedIds.length === 0) {
    recordSessionAudit(context, { action: "STORAGE_CANCELLED" });
    recordAction(context, "STORAGE_CANCELLED", { candidateCount: preview.candidates.length });
    if (!options.json) context.output.writeLine("Cancelled. No storage targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "STORAGE_OPTIMISE" });
  const review = engine.review(preview, options.force ? { force: true } : { force: false, confirmed: true, selectedIds });
  const applied = await withSpinner("Optimising storage", () => engine.apply(review));
  const result = recordRegistryOutcome(context, "STORAGE_OPTIMISE", summarizeRegistryResult(applied), applied);
  if (options.json) {
    writeJson(context, { preview, review, result });
  } else {
    writeRegistryReport(context, "Storage", result, registry);
  }
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseProjects(
  context: CommandContext,
  workdir: string,
  options: OptimiseProjectsOptions,
): Promise<CommandResult> {
  recordSessionAudit(context, { action: "PROJECTS_SCAN", projectName: workdir });
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const roots = await withSpinner("Discovering projects", () => discoverRegistryProjectRoots(workdir, registry, options.maxDepth));
  const engine = registryEngine(context, registry, roots.roots);
  const ruleIds = registry.rules.filter((rule) => rule.scope === "workdir").map((rule) => rule.id);
  const plan = await withSpinner("Scanning project targets", () => engine.probe({ ruleIds }));
  recordAction(context, "PROJECTS_SCAN", {
    workdir: roots.workdir,
    maxDepth: roots.maxDepth,
    projectCount: roots.roots.length,
    candidateCount: plan.candidates.length,
    totalBytes: plan.knownBytes,
    warningCount: roots.warnings.length,
    registryFingerprint: engine.fingerprint,
  });

  if (options.json) {
    writeJson(context, { roots, plan });
  } else {
    writeRegistryPlan(context, "Project", plan, registry, roots);
  }

  const selectedIds = await selectRegistryCandidates(context, plan, options.force);
  if (selectedIds.length === 0) {
    recordSessionAudit(context, { action: "PROJECTS_CANCELLED", projectName: roots.workdir });
    recordAction(context, "PROJECTS_CANCELLED", { workdir: roots.workdir, candidateCount: plan.candidates.length });
    if (!options.json) context.output.writeLine("Cancelled. No project targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "PROJECTS_OPTIMISE", projectName: roots.workdir });
  const review = engine.review(plan, options.force ? { force: true } : { force: false, confirmed: true, selectedIds });
  const applied = await withSpinner("Optimising projects", () => engine.apply(review));
  const result = recordRegistryOutcome(context, "PROJECTS_OPTIMISE", { workdir: roots.workdir, ...summarizeRegistryResult(applied) }, applied);
  if (options.json) {
    writeJson(context, { roots, plan, review, result });
  } else {
    writeRegistryReport(context, "Project", result, registry);
  }
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseStartup(context: CommandContext, options: OptimiseRunOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "STARTUP_SCAN" });
  const startupOptions = {
    ...dbOptions(context),
    ...(context.startupPlatform ? { platform: context.startupPlatform } : {}),
    ...(context.startupRunner ? { runner: context.startupRunner } : {}),
  };
  const plan = await withSpinner("Scanning startup targets", () => scanStartupOptimiseTargets(startupOptions));
  recordAction(context, "STARTUP_SCAN", {
    platform: plan.platform,
    candidateCount: plan.candidates.length,
    safeCount: plan.safeCount,
    reviewCount: plan.reviewCount,
    protectedCount: plan.protectedCount,
    warningCount: plan.warnings.length,
  });

  if (options.json) {
    writeJson(context, plan);
  } else {
    writeStartupPlan(context, plan);
  }

  const candidateIds = await selectStartupCandidates(context, plan, options.force);
  if (candidateIds.length === 0) {
    recordSessionAudit(context, { action: "STARTUP_CANCELLED" });
    recordAction(context, "STARTUP_CANCELLED", { candidateCount: plan.candidates.length });
    if (!options.json) context.output.writeLine("Cancelled. No startup items were disabled.");
    return ok;
  }

  recordSessionAudit(context, { action: "STARTUP_OPTIMISE" });
  const result = await withSpinner("Optimising startup", () => applyStartupOptimisePlan(plan, { ...startupOptions, candidateIds }));
  recordAction(context, "STARTUP_OPTIMISE", summarizeStartupResult(result));
  if (options.json) {
    writeJson(context, { plan, result });
  } else {
    writeStartupReport(context, result);
  }
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

function recordAction(context: CommandContext, actionType: string, details: Record<string, unknown>, status?: string): void {
  const connection = openKundolDatabase(dbOptions(context));
  try {
    new ActionRepository(connection.db, { now: () => new Date() }).record({ actionType, details, ...(status ? { status } : {}) });
  } finally {
    connection.close();
  }
}

function registryEngine(context: CommandContext, registry: OptimisationRegistry, projectRoots: readonly string[]) {
  return createCliRegistryEngine({
    registry,
    context: { homeDir: context.homeDir ?? homedir(), projectRoots },
    ...(context.registryRunner ? { runner: context.registryRunner } : {}),
    ...(context.registryNow ? { now: context.registryNow } : {}),
    audit: async (event: RegistryAuditEvent) => {
      recordAction(context, "REGISTRY_TARGET", {
        phase: event.phase,
        ruleId: event.ruleId,
        candidateId: event.candidateId,
        targetKey: event.targetKey,
        ...(event.reason ? { reason: event.reason } : {}),
      }, event.phase);
      recordSessionAudit(context, { action: `REGISTRY_${event.phase.toUpperCase()}`, projectName: event.targetKey });
    },
  });
}

function safeRegistryCandidates(probe: RegistryProbeResult): RegistryCandidate[] {
  return probe.candidates.filter((candidate) => candidate.tier === "safe" && candidate.forceEligible);
}

async function selectRegistryCandidates(context: CommandContext, probe: RegistryProbeResult, force: boolean): Promise<string[]> {
  if (force) return safeRegistryCandidates(probe).map((candidate) => candidate.id);
  if (probe.candidates.length === 0) return [];
  if (context.registrySelect) {
    const selected = await context.registrySelect(probe);
    return selected.filter((id) => probe.candidates.some((candidate) => candidate.id === id && candidate.tier !== "protected"));
  }
  if (!process.stdin.isTTY) {
    context.output.writeError("Selection requires an interactive terminal. Re-run with -f to apply only listed safe targets.");
    return [];
  }
  const reader = createInterface({ input, output });
  try {
    const answer = (await reader.question("Select targets: y for safe, numbers for explicit review, or blank to cancel: ")).trim().toLowerCase();
    if (answer === "y" || answer === "yes" || answer === "safe") return safeRegistryCandidates(probe).map((candidate) => candidate.id);
    if (!answer || answer === "n" || answer === "no") return [];
    if (!/^\d+(?:[,\s]+\d+)*$/.test(answer)) {
      context.output.writeError("Enter displayed target numbers, y, or leave blank to cancel.");
      return [];
    }
    const numbers = [...new Set(answer.split(/[,\s]+/).map(Number))];
    if (numbers.some((number) => !Number.isSafeInteger(number) || number < 1 || number > probe.candidates.length)) {
      context.output.writeError("A selected target number is outside the displayed plan.");
      return [];
    }
    const selected = numbers.map((number) => probe.candidates[number - 1]!);
    if (selected.some((candidate) => candidate.tier === "protected")) {
      context.output.writeError("Protected inventory targets cannot be selected.");
      return [];
    }
    return selected.map((candidate) => candidate.id);
  } finally {
    reader.close();
  }
}

async function selectStartupCandidates(context: CommandContext, plan: StartupOptimisePlan, force: boolean): Promise<string[]> {
  const safeCandidates = plan.candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected);
  if (force) return safeCandidates.map((candidate) => candidate.id);
  if (safeCandidates.length === 0) return [];
  if (!process.stdin.isTTY) {
    context.output.writeError("Startup selection requires an interactive terminal. Re-run with -f to disable all listed startup items.");
    return [];
  }
  const reader = createInterface({ input, output });
  try {
    const answer = await reader.question("Disable which startup items? Enter numbers, `all`, or blank to cancel: ");
    const value = answer.trim().toLowerCase();
    if (value === "") return [];
    if (value === "all" || value === "a") return safeCandidates.map((candidate) => candidate.id);
    const selected = new Set<string>();
    for (const token of value.split(/[,\s]+/).filter(Boolean)) {
      const index = Number.parseInt(token, 10);
      if (Number.isInteger(index) && index >= 1 && index <= safeCandidates.length) {
        selected.add(safeCandidates[index - 1]!.id);
      }
    }
    return [...selected];
  } finally {
    reader.close();
  }
}

async function withSpinner<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!process.stderr.isTTY) return run();
  const frames = ["|", "/", "-", "\\"];
  let index = 0;
  process.stderr.write(`${label} ${frames[index]}`);
  const timer = setInterval(() => {
    index = (index + 1) % frames.length;
    process.stderr.write(`\r${label} ${frames[index]}`);
  }, 90);
  try {
    return await run();
  } finally {
    clearInterval(timer);
    process.stderr.write(`\r${label} done\n`);
  }
}

function renderRegistryTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}

function writeRegistryPlan(context: CommandContext, name: string, plan: RegistryProbeResult, registry: OptimisationRegistry, roots?: RegistryProjectRootsResult): void {
  context.output.writeLine(`${name} optimisation plan`);
  if (roots) {
    context.output.writeLine(`Workdir: ${roots.workdir}`);
    context.output.writeLine(`Max depth: ${roots.maxDepth}`);
    context.output.writeLine(`Projects found: ${roots.roots.length}`);
  }
  context.output.writeLine(`Targets: ${plan.candidates.length}`);
  context.output.writeLine(`Safe suggestions: ${safeRegistryCandidates(plan).length}`);
  context.output.writeLine(`Known target footprint: ${formatBytes(plan.knownBytes)}`);
  context.output.writeLine("Eligibility: target and contents must show no changes in the last 7 days.");
  context.output.writeLine("");
  if (plan.candidates.length === 0) context.output.writeLine("  none");
  for (const [index, candidate] of plan.candidates.entries()) {
    const target = candidate.target.kind === "path" ? candidate.target.absolutePath : `${candidate.target.ownerId}/${candidate.target.resourceId}`;
    const size = candidate.target.sizeBytes === null ? "unknown" : formatBytes(candidate.target.sizeBytes);
    const action = candidate.action.kind === "command" ? candidate.action.argv.join(" ") :
      candidate.action.kind === "adapter" ? candidate.action.adapterId :
      candidate.action.kind === "remove_generated" ? "remove generated path" : "inventory only";
    context.output.writeLine(`  ${index + 1}. [${candidate.tier}] ${candidate.label}  ${size}`);
    context.output.writeLine(`     ${target}`);
    context.output.writeLine(`     ${renderRegistryTemplate(registry.messageTemplates.plan, { label: candidate.label, description: candidate.description })} Action: ${action}.`);
    if (candidate.sources[0]) context.output.writeLine(`     Source: ${candidate.sources[0].url}`);
  }
  const unavailable = plan.skippedRules.filter((entry) => !entry.reason.startsWith("rule status "));
  if (roots?.warnings.length || unavailable.length) {
    context.output.writeLine("");
    for (const warning of roots?.warnings ?? []) context.output.writeLine(`Warning: ${warning}`);
    for (const entry of unavailable) context.output.writeLine(`Unavailable ${entry.ruleId}: ${entry.reason}`);
  }
  if (plan.candidates.length > 0) context.output.writeLine("Select y for safe suggestions or target numbers for explicit review. Protected entries cannot be selected.");
}

function writeRegistryReport(context: CommandContext, name: string, result: RegistryApplyResult, registry: OptimisationRegistry): void {
  context.output.writeLine(`${name} optimisation report`);
  context.output.writeLine(`Removed/optimised: ${result.applied.length}`);
  context.output.writeLine(`Failed: ${result.failed.length}`);
  context.output.writeLine(`Skipped: ${result.skipped.length}`);
  context.output.writeLine(`Known reclaimed: ${formatBytes(result.knownReclaimedBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("Final cleanup targets:");
  if (result.applied.length === 0) context.output.writeLine("  none");
  for (const { candidate } of result.applied) {
    const target = candidate.target.kind === "path" ? candidate.target.absolutePath : `${candidate.target.ownerId}/${candidate.target.resourceId}`;
    context.output.writeLine(`  ${renderRegistryTemplate(registry.messageTemplates.success, { label: candidate.label })} ${target}`);
  }
  if (result.skipped.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Skipped:");
    for (const { candidate, reason } of result.skipped) context.output.writeLine(`  ${renderRegistryTemplate(registry.messageTemplates.skipped, { label: candidate.label, reason })}`);
  }
  if (result.failed.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Errors:");
    for (const { candidate, error } of result.failed) context.output.writeLine(`  ${renderRegistryTemplate(registry.messageTemplates.failure, { label: candidate.label, error })}`);
  }
  if (result.auditWarnings.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Audit warnings:");
    for (const warning of result.auditWarnings) context.output.writeLine(`  ${warning}`);
  }
}

function writeStartupPlan(context: CommandContext, plan: StartupOptimisePlan): void {
  const candidates = plan.candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected);
  context.output.writeLine("Startup optimisation plan");
  context.output.writeLine(`Platform: ${plan.platform}`);
  context.output.writeLine(`Startup items: ${candidates.length}`);
  context.output.writeLine("");
  context.output.writeLine("Will disable:");
  writeStartupCandidates(context, candidates, 60, true);
  if (plan.warnings.length > 0) {
    context.output.writeLine("");
    context.output.writeLine(`Warnings: ${plan.warnings.length}`);
  }
}

function writeStartupReport(context: CommandContext, result: StartupApplyResult): void {
  context.output.writeLine("Startup optimisation report");
  context.output.writeLine(`Disabled: ${result.disabled.length}`);
  context.output.writeLine(`Failed: ${result.failed.length}`);
  context.output.writeLine(`Skipped: ${result.skipped.length}`);
  context.output.writeLine("");
  context.output.writeLine("Final startup targets:");
  writeStartupCandidates(context, result.disabled, 80, false);
  if (result.skipped.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Skipped:");
    for (const skipped of result.skipped) {
      context.output.writeLine(`  ${skipped.candidate.name}: ${skipped.reason}`);
    }
  }
  if (result.failed.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Errors:");
    for (const failure of result.failed) {
      context.output.writeLine(`  ${failure.candidate.name}: ${failure.error}`);
    }
  }
}

function writeStartupCandidates(context: CommandContext, candidates: StartupCandidate[], limit: number, numbered: boolean): void {
  if (candidates.length === 0) {
    context.output.writeLine("  none");
    return;
  }
  for (const [index, candidate] of candidates.slice(0, limit).entries()) {
    const prefix = numbered ? `${index + 1}.` : "-";
    context.output.writeLine(`  ${prefix} ${candidate.displayName}  ${candidate.description}  ${candidate.command}`);
  }
  if (candidates.length > limit) context.output.writeLine(`  ... ${candidates.length - limit} more`);
}

function summarizeRegistryResult(result: RegistryApplyResult): Record<string, unknown> {
  return {
    applied: result.applied.map(({ candidate }) => ({ ruleId: candidate.ruleId, targetKey: candidate.target.key })),
    skipped: result.skipped.map(({ candidate, reason }) => ({ ruleId: candidate.ruleId, targetKey: candidate.target.key, reason })),
    failed: result.failed.map(({ candidate, error }) => ({ ruleId: candidate.ruleId, targetKey: candidate.target.key, error })),
    knownReclaimedBytes: result.knownReclaimedBytes,
    auditWarnings: result.auditWarnings,
  };
}

function recordRegistryOutcome(
  context: CommandContext,
  actionType: string,
  details: Record<string, unknown>,
  result: RegistryApplyResult,
): RegistryApplyResult {
  try {
    recordAction(context, actionType, details);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ...result, auditWarnings: [...result.auditWarnings, `${actionType} audit failed after apply: ${message}`] };
  }
}

function summarizeStartupResult(result: StartupApplyResult): Record<string, unknown> {
  return {
    disabled: result.disabled.map((candidate) => candidate.name),
    skipped: result.skipped.map((skipped) => ({ name: skipped.candidate.name, reason: skipped.reason })),
    failed: result.failed.map((failure) => ({ name: failure.candidate.name, error: failure.error })),
  };
}

function dbOptions(context: CommandContext): { databasePath?: string; homeDir?: string } {
  return {
    ...(context.databasePath ? { databasePath: context.databasePath } : {}),
    ...(context.homeDir ? { homeDir: context.homeDir } : {}),
  };
}

function writeJson(context: CommandContext, value: unknown): void {
  context.output.writeLine(JSON.stringify(value, null, 2));
}
