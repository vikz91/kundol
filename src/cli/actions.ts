import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { openKundolDatabase } from "../db/client";
import { ActionRepository } from "../db/repositories/action-repository";
import { ProjectRepository, type Project } from "../db/repositories/project-repository";
import { formatBytes } from "../core/registry/format";
import { recordSessionAudit } from "../services/audit/session-audit-log";
import {
  applyStorageOptimization,
  previewStorageOptimization,
  type OptimizeApplyResult,
  type OptimizeCandidate,
  type OptimizePreview,
} from "../services/optimize";
import {
  applyProjectOptimisePlan,
  scanProjectOptimiseTargets,
  type ProjectOptimiseApplyResult,
  type ProjectOptimiseCandidate,
  type ProjectOptimisePlan,
} from "../services/project-optimizer";
import {
  applyStartupOptimisePlan,
  scanStartupOptimiseTargets,
  type StartupApplyResult,
  type StartupCandidate,
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
  databasePath?: string;
  homeDir?: string;
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
  return ok;
}

export async function optimiseStorage(context: CommandContext, options: OptimiseRunOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "STORAGE_SCAN" });
  const projects = readProjects(context);
  const preview = await withSpinner("Scanning storage targets", () => previewStorageOptimization(projects));
  recordAction(context, "STORAGE_SCAN", {
    candidateCount: preview.candidates.length,
    safeSelectedCount: preview.safeSelectedCount,
    knownReclaimableBytes: preview.knownReclaimableBytes,
  });

  if (options.json) {
    writeJson(context, preview);
  } else {
    writeStoragePlan(context, preview);
  }

  if (!(await shouldContinue(context, options.force, `Proceed with ${preview.safeSelectedCount} storage cleanup action(s)?`))) {
    recordSessionAudit(context, { action: "STORAGE_CANCELLED" });
    recordAction(context, "STORAGE_CANCELLED", { candidateCount: preview.candidates.length });
    if (!options.json) context.output.writeLine("Cancelled. No storage targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "STORAGE_OPTIMISE" });
  const connection = openKundolDatabase(dbOptions(context));
  try {
    const result = await withSpinner("Optimising storage", () => applyStorageOptimization(connection.db, preview));
    recordAction(context, "STORAGE_OPTIMISE", summarizeStorageResult(result));
    if (options.json) {
      writeJson(context, { preview, result });
    } else {
      writeStorageReport(context, result);
    }
    return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
  } finally {
    connection.close();
  }
}

export async function optimiseProjects(
  context: CommandContext,
  workdir: string,
  options: OptimiseProjectsOptions,
): Promise<CommandResult> {
  recordSessionAudit(context, { action: "PROJECTS_SCAN", projectName: workdir });
  const plan = await withSpinner("Scanning project targets", () =>
    scanProjectOptimiseTargets(workdir, { maxDepth: options.maxDepth }),
  );
  recordAction(context, "PROJECTS_SCAN", {
    workdir: plan.workdir,
    maxDepth: plan.maxDepth,
    projectCount: plan.projects.length,
    candidateCount: plan.candidates.length,
    totalBytes: plan.totalBytes,
    warningCount: plan.warnings.length,
  });

  if (options.json) {
    writeJson(context, plan);
  } else {
    writeProjectPlan(context, plan);
  }

  if (!(await shouldContinue(context, options.force, `Proceed with ${plan.candidates.length} project cleanup target(s)?`))) {
    recordSessionAudit(context, { action: "PROJECTS_CANCELLED", projectName: plan.workdir });
    recordAction(context, "PROJECTS_CANCELLED", { workdir: plan.workdir, candidateCount: plan.candidates.length });
    if (!options.json) context.output.writeLine("Cancelled. No project targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "PROJECTS_OPTIMISE", projectName: plan.workdir });
  const result = await withSpinner("Optimising projects", () => applyProjectOptimisePlan(plan));
  recordAction(context, "PROJECTS_OPTIMISE", summarizeProjectResult(result, plan));
  if (options.json) {
    writeJson(context, { plan, result });
  } else {
    writeProjectReport(context, result);
  }
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseStartup(context: CommandContext, options: OptimiseRunOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "STARTUP_SCAN" });
  const plan = await withSpinner("Scanning startup targets", () => scanStartupOptimiseTargets(dbOptions(context)));
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
  const result = await withSpinner("Optimising startup", () => applyStartupOptimisePlan(plan, { ...dbOptions(context), candidateIds }));
  recordAction(context, "STARTUP_OPTIMISE", summarizeStartupResult(result));
  if (options.json) {
    writeJson(context, { plan, result });
  } else {
    writeStartupReport(context, result);
  }
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

function readProjects(context: CommandContext): Project[] {
  const connection = openKundolDatabase({ ...dbOptions(context), readonly: false });
  try {
    return new ProjectRepository(connection.db, { now: () => new Date() }).list();
  } finally {
    connection.close();
  }
}

function recordAction(context: CommandContext, actionType: string, details: Record<string, unknown>): void {
  const connection = openKundolDatabase(dbOptions(context));
  try {
    new ActionRepository(connection.db, { now: () => new Date() }).record({ actionType, details });
  } finally {
    connection.close();
  }
}

async function shouldContinue(context: CommandContext, force: boolean, question: string): Promise<boolean> {
  if (force) return true;
  if (!process.stdin.isTTY) {
    context.output.writeError("Confirmation requires an interactive terminal. Re-run with -f to skip the prompt.");
    return false;
  }
  const reader = createInterface({ input, output });
  try {
    const answer = await reader.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
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

function writeStoragePlan(context: CommandContext, preview: OptimizePreview): void {
  const selected = preview.candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected);
  context.output.writeLine("Storage optimisation plan");
  context.output.writeLine(`Targets: ${selected.length}`);
  context.output.writeLine(`Known reclaimable: ${formatBytes(preview.knownReclaimableBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("Will remove or run:");
  writeStorageCandidates(context, selected, 40);
}

function writeStorageReport(context: CommandContext, result: OptimizeApplyResult): void {
  context.output.writeLine("Storage optimisation report");
  context.output.writeLine(`Removed/optimised: ${result.applied.length}`);
  context.output.writeLine(`Failed: ${result.failed.length}`);
  context.output.writeLine(`Skipped: ${result.skipped.length}`);
  context.output.writeLine("");
  context.output.writeLine("Final cleanup targets:");
  writeStorageCandidates(context, result.applied, 80);
  if (result.failed.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Errors:");
    for (const failure of result.failed) {
      context.output.writeLine(`  ${failure.candidate.label}: ${failure.error}`);
    }
  }
}

function writeProjectPlan(context: CommandContext, plan: ProjectOptimisePlan): void {
  context.output.writeLine("Project optimisation plan");
  context.output.writeLine(`Workdir: ${plan.workdir}`);
  context.output.writeLine(`Max depth: ${plan.maxDepth}`);
  context.output.writeLine(`Projects found: ${plan.projects.length}`);
  context.output.writeLine(`Cleanup targets: ${plan.candidates.length}`);
  context.output.writeLine(`Estimated reclaimable: ${formatBytes(plan.totalBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("Will remove:");
  writeProjectCandidates(context, plan.candidates, 80);
  if (plan.warnings.length > 0) {
    context.output.writeLine("");
    context.output.writeLine(`Warnings: ${plan.warnings.length}`);
  }
}

function writeProjectReport(context: CommandContext, result: ProjectOptimiseApplyResult): void {
  const removedBytes = result.removed.reduce((total, candidate) => total + candidate.sizeBytes, 0);
  context.output.writeLine("Project optimisation report");
  context.output.writeLine(`Removed: ${result.removed.length}`);
  context.output.writeLine(`Failed: ${result.failed.length}`);
  context.output.writeLine(`Skipped: ${result.skipped.length}`);
  context.output.writeLine(`Estimated reclaimed: ${formatBytes(removedBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("Final cleanup targets:");
  writeProjectCandidates(context, result.removed, 120);
  if (result.skipped.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Skipped:");
    for (const skipped of result.skipped) {
      context.output.writeLine(`  ${skipped.candidate.absolutePath}: ${skipped.reason}`);
    }
  }
  if (result.failed.length > 0) {
    context.output.writeLine("");
    context.output.writeLine("Errors:");
    for (const failure of result.failed) {
      context.output.writeLine(`  ${failure.candidate.absolutePath}: ${failure.error}`);
    }
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

function writeStorageCandidates(context: CommandContext, candidates: OptimizeCandidate[], limit: number): void {
  if (candidates.length === 0) {
    context.output.writeLine("  none");
    return;
  }
  for (const candidate of candidates.slice(0, limit)) {
    const size = candidate.sizeBytes === null ? "unknown" : formatBytes(candidate.sizeBytes);
    context.output.writeLine(`  ${candidate.label}  ${size}  ${candidate.command}`);
  }
  if (candidates.length > limit) context.output.writeLine(`  ... ${candidates.length - limit} more`);
}

function writeProjectCandidates(context: CommandContext, candidates: ProjectOptimiseCandidate[], limit: number): void {
  if (candidates.length === 0) {
    context.output.writeLine("  none");
    return;
  }
  for (const candidate of candidates.slice(0, limit)) {
    context.output.writeLine(`  ${formatBytes(candidate.sizeBytes)}  ${candidate.projectName}  ${candidate.absolutePath}`);
  }
  if (candidates.length > limit) context.output.writeLine(`  ... ${candidates.length - limit} more`);
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

function summarizeStorageResult(result: OptimizeApplyResult): Record<string, unknown> {
  return {
    applied: result.applied.map((candidate) => candidate.label),
    skipped: result.skipped.map((candidate) => candidate.label),
    failed: result.failed.map((failure) => ({ label: failure.candidate.label, error: failure.error })),
  };
}

function summarizeProjectResult(result: ProjectOptimiseApplyResult, plan: ProjectOptimisePlan): Record<string, unknown> {
  return {
    workdir: plan.workdir,
    removed: result.removed.map((candidate) => candidate.absolutePath),
    skipped: result.skipped.map((skipped) => ({ path: skipped.candidate.absolutePath, reason: skipped.reason })),
    failed: result.failed.map((failure) => ({ path: failure.candidate.absolutePath, error: failure.error })),
  };
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
