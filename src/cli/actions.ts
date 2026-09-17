import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { homedir } from "node:os";
import path from "node:path";
import optimisationsJson from "../../registry/optimisations.json";
import { openKundolDatabase, type KundolDatabase, type OpenDatabaseOptions } from "../db/client";
import { ActionRepository } from "../db/repositories/action-repository";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../core/optimisation-registry/schema";
import { formatBytes } from "../shared/format-bytes";
import { recordSessionAudit } from "../services/audit/session-audit-log";
import {
  createCliRegistryEngine,
  discoverRegistryProjectRoots,
  OptimisationRegistryEngine,
  type RegistryApplyResult,
  type RegistryAuditEvent,
  type RegistryCandidate,
  type RegistryCommandRunner,
  type RegistryProbeResult,
  type RegistryProjectRootsResult,
} from "../services/optimisation-registry";
import { exitCodes, type ExitCode } from "../shared/exit-codes";
import { runRegistryCommand } from "../services/optimisation-registry/commands";
import { resolvePinnedDockerContextIdentity } from "../services/optimisation-registry/docker-context-identity";
import { createPinnedDockerRunner } from "../services/optimisation-registry/docker-pinned-runner";
import { createStoppedDockerContainerBinding, type DockerPinnedRunner } from "../services/optimisation-registry/docker-stopped-containers";
import { createProtectedDockerContextInventory } from "../services/optimisation-registry/docker-context-inventory";
import { createLocalHandlerBindings } from "../services/optimisation-registry/local-handler-bindings";
import { runCondaPinnedCommand, type CondaPinnedRunner } from "../services/optimisation-registry/conda-safe-cache";
import { runNugetPinnedCommand, type NugetPinnedRunner } from "../services/optimisation-registry/nuget-cache";
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
  databaseOpen?: (options: OpenDatabaseOptions) => KundolDatabase;
  homeDir?: string;
  registryCommandCwd?: string;
  registryUserRoots?: readonly string[];
  dockerPinnedRunnerFactory?: (contextName: string) => DockerPinnedRunner;
  nugetPinnedRunner?: NugetPinnedRunner;
  condaPinnedRunner?: CondaPinnedRunner;
}

export interface OptimiseRunOptions {
  force: boolean;
  allowBeta?: boolean;
}

export interface OptimiseAllOptions extends OptimiseRunOptions {
  workdir: string;
  dockerContext: string;
}

const ok: CommandResult = { exitCode: exitCodes.ok };

export function showWelcome(context: CommandContext): CommandResult {
  context.output.writeLine(formatWelcomeMessage());
  context.output.writeLine("Examples:");
  context.output.writeLine("  kundol optimise all --workdir ~/Projects --docker-context my-context");
  context.output.writeLine("  kundol optimise storage");
  context.output.writeLine("  kundol optimise storage -f");
  context.output.writeLine("  kundol optimise projects ~/Projects -f");
  context.output.writeLine("  kundol tools available");
  context.output.writeLine("  kundol tools request");
  context.output.writeLine("  kundol issue");
  return ok;
}

export async function optimiseStorage(context: CommandContext, options: OptimiseRunOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "STORAGE_SCAN" });
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const targetAudit = createActionRecorder(context);
  const engine = registryEngine(context, registry, [], targetAudit);
  const ruleIds = registry.rules.filter((rule) => rule.scope === "user").map((rule) => rule.id);
  const preview = await withSpinner("Scanning storage targets", () => engine.probe({ ruleIds, includeBeta: options.allowBeta ?? false }));
  recordAction(context, "STORAGE_SCAN", {
    allowBeta: options.allowBeta ?? false,
    candidateCount: preview.candidates.length,
    safeSelectedCount: safeRegistryCandidates(preview).length,
    knownReclaimableBytes: preview.knownBytes,
    registryFingerprint: engine.fingerprint,
  });

  writeRegistryPlan(context, "Storage", preview, registry);

  const selectedIds = await selectRegistryCandidates(context, preview, options.force);
  if (selectedIds.length === 0) {
    recordSessionAudit(context, { action: "STORAGE_CANCELLED" });
    recordAction(context, "STORAGE_CANCELLED", { candidateCount: preview.candidates.length });
    context.output.writeLine("Cancelled. No storage targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "STORAGE_OPTIMISE" });
  const review = engine.review(preview, options.force ? { force: true } : { force: false, confirmed: true, selectedIds });
  let applied: RegistryApplyResult;
  try {
    applied = await withSpinner("Optimising storage", () => engine.apply(review));
  } finally {
    targetAudit.close();
  }
  const result = recordRegistryOutcome(context, "STORAGE_OPTIMISE", summarizeRegistryResult(applied), applied);
  writeRegistryReport(context, "Storage", result, registry);
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseProjects(
  context: CommandContext,
  workdir: string,
  options: OptimiseRunOptions,
): Promise<CommandResult> {
  recordSessionAudit(context, { action: "PROJECTS_SCAN", projectName: workdir });
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const roots = await withSpinner("Discovering projects", () => discoverRegistryProjectRoots(workdir, registry, 7));
  const targetAudit = createActionRecorder(context);
  const engine = registryEngine(context, registry, roots.roots, targetAudit, roots.workdir);
  const ruleIds = registry.rules.filter((rule) => rule.scope === "workdir").map((rule) => rule.id);
  const plan = await withSpinner("Scanning project targets", () => engine.probe({ ruleIds, includeBeta: options.allowBeta ?? false }));
  recordAction(context, "PROJECTS_SCAN", {
    allowBeta: options.allowBeta ?? false,
    workdir: roots.workdir,
    maxDepth: roots.maxDepth,
    projectCount: roots.roots.length,
    candidateCount: plan.candidates.length,
    totalBytes: plan.knownBytes,
    warningCount: roots.warnings.length,
    registryFingerprint: engine.fingerprint,
  });

  writeRegistryPlan(context, "Project", plan, registry, roots);

  const selectedIds = await selectRegistryCandidates(context, plan, options.force);
  if (selectedIds.length === 0) {
    recordSessionAudit(context, { action: "PROJECTS_CANCELLED", projectName: roots.workdir });
    recordAction(context, "PROJECTS_CANCELLED", { workdir: roots.workdir, candidateCount: plan.candidates.length });
    context.output.writeLine("Cancelled. No project targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "PROJECTS_OPTIMISE", projectName: roots.workdir });
  const review = engine.review(plan, options.force ? { force: true } : { force: false, confirmed: true, selectedIds });
  let applied: RegistryApplyResult;
  try {
    applied = await withSpinner("Optimising projects", () => engine.apply(review));
  } finally {
    targetAudit.close();
  }
  const result = recordRegistryOutcome(context, "PROJECTS_OPTIMISE", { workdir: roots.workdir, ...summarizeRegistryResult(applied) }, applied);
  writeRegistryReport(context, "Project", result, registry);
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseDocker(context: CommandContext, contextName: string, options: { allowBeta?: boolean } = {}): Promise<CommandResult> {
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const targetAudit = createActionRecorder(context);
  const prepared = await withSpinner("Resolving Docker context", () => prepareDockerRegistry(context, registry, targetAudit, contextName));
  const { engine, identity } = prepared;
  const ruleIds = registry.rules.filter((rule) => rule.scope === "docker_context").map((rule) => rule.id);
  const plan = await withSpinner("Scanning selected Docker context", () => engine.probe({ ruleIds, includeBeta: options.allowBeta ?? false }));
  recordSessionAudit(context, { action: "DOCKER_SCAN" });
  recordAction(context, "DOCKER_SCAN", {
    allowBeta: options.allowBeta ?? false,
    contextName: identity.contextName, ownerId: identity.ownerId,
    candidateCount: plan.candidates.length, registryFingerprint: engine.fingerprint,
  });
  writeRegistryPlan(context, "Docker", plan, registry, undefined, {
    name: identity.contextName, endpoint: identity.displayEndpoint, ownerId: identity.ownerId,
  });
  const selectedIds = await selectRegistryCandidates(context, plan, false);
  if (selectedIds.length === 0) {
    targetAudit.close();
    context.output.writeLine("Cancelled. No Docker resources were removed.");
    return ok;
  }
  const review = engine.review(plan, { force: false, confirmed: true, selectedIds });
  let applied: RegistryApplyResult;
  try {
    applied = await withSpinner("Applying reviewed Docker targets", () => engine.apply(review));
  } finally {
    targetAudit.close();
  }
  const result = recordRegistryOutcome(context, "DOCKER_OPTIMISE", {
    contextName: identity.contextName, ownerId: identity.ownerId, ...summarizeRegistryResult(applied),
  }, applied);
  writeRegistryReport(context, "Docker", result, registry);
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

export async function optimiseAll(context: CommandContext, options: OptimiseAllOptions): Promise<CommandResult> {
  const registry = context.registry ?? parseOptimisationRegistry(optimisationsJson);
  const allowBeta = options.allowBeta ?? false;
  recordSessionAudit(context, { action: "ALL_SCAN", projectName: options.workdir });
  const targetAudit = createActionRecorder(context);
  let roots: RegistryProjectRootsResult;
  let docker: Awaited<ReturnType<typeof prepareDockerRegistry>>;
  try {
    [roots, docker] = await withSpinner("Resolving all optimisation scopes", () => Promise.all([
      discoverRegistryProjectRoots(options.workdir, registry, 7),
      prepareDockerRegistry(context, registry, targetAudit, options.dockerContext),
    ]));
  } catch (error) {
    targetAudit.close();
    throw error;
  }

  const storageEngine = registryEngine(context, registry, [], targetAudit);
  const projectEngine = registryEngine(context, registry, roots.roots, targetAudit, roots.workdir);
  const rules = (scope: "user" | "workdir" | "docker_context" | "system") =>
    registry.rules.filter((rule) => rule.scope === scope).map((rule) => rule.id);
  const [storagePlan, projectPlan, dockerPlan, systemPlan] = await withSpinner("Scanning all optimisation targets", () => Promise.all([
    storageEngine.probe({ ruleIds: rules("user"), includeBeta: allowBeta }),
    projectEngine.probe({ ruleIds: rules("workdir"), includeBeta: allowBeta }),
    docker.engine.probe({ ruleIds: rules("docker_context"), includeBeta: allowBeta }),
    storageEngine.probe({ ruleIds: rules("system"), includeBeta: allowBeta }),
  ]));
  const routes: readonly { name: string; engine: OptimisationRegistryEngine; plan: RegistryProbeResult }[] = [
    { name: "Storage", engine: storageEngine, plan: storagePlan },
    { name: "Project", engine: projectEngine, plan: projectPlan },
    { name: "Docker", engine: docker.engine, plan: dockerPlan },
    { name: "System", engine: storageEngine, plan: systemPlan },
  ];
  const combined = combineProbeResults(routes.map((route) => route.plan));
  recordAction(context, "ALL_SCAN", {
    allowBeta, workdir: roots.workdir, dockerContext: docker.identity.contextName, dockerOwnerId: docker.identity.ownerId,
    projectCount: roots.roots.length, candidateCount: combined.candidates.length,
    safeSelectedCount: safeRegistryCandidates(combined).length, knownReclaimableBytes: combined.knownBytes,
    unavailableCount: combined.skippedRules.filter((entry) => !entry.reason.startsWith("rule status ")).length,
    registryFingerprint: storageEngine.fingerprint,
  });
  writeRegistryPlan(context, "All", combined, registry, roots, {
    name: docker.identity.contextName, endpoint: docker.identity.displayEndpoint, ownerId: docker.identity.ownerId,
  });

  const selectedIds = await selectRegistryCandidates(context, combined, options.force);
  if (selectedIds.length === 0) {
    targetAudit.close();
    recordSessionAudit(context, { action: "ALL_CANCELLED", projectName: roots.workdir });
    recordAction(context, "ALL_CANCELLED", { candidateCount: combined.candidates.length });
    context.output.writeLine("Cancelled. No optimisation targets were removed.");
    return ok;
  }

  recordSessionAudit(context, { action: "ALL_OPTIMISE", projectName: roots.workdir });
  const wanted = new Set(selectedIds);
  const results: RegistryApplyResult[] = [];
  try {
    for (const route of routes) {
      const selected = route.plan.candidates.filter((candidate) => wanted.has(candidate.id));
      if (selected.length === 0) continue;
      const review = route.engine.review(route.plan, options.force
        ? { force: true }
        : { force: false, confirmed: true, selectedIds: selected.map((candidate) => candidate.id) });
      results.push(await withSpinner(`Optimising ${route.name.toLowerCase()} targets`, () => route.engine.apply(review)));
    }
  } finally {
    targetAudit.close();
  }
  const applied = mergeApplyResults(results);
  const result = recordRegistryOutcome(context, "ALL_OPTIMISE", {
    workdir: roots.workdir, dockerContext: docker.identity.contextName, dockerOwnerId: docker.identity.ownerId,
    ...summarizeRegistryResult(applied),
  }, applied);
  writeRegistryReport(context, "All", result, registry);
  return result.failed.length > 0 ? { exitCode: exitCodes.software } : ok;
}

function recordAction(context: CommandContext, actionType: string, details: Record<string, unknown>, status?: string): void {
  const recorder = createActionRecorder(context);
  try {
    recorder.record(actionType, details, status);
  } finally {
    recorder.close();
  }
}

interface ActionRecorder {
  record(actionType: string, details: Record<string, unknown>, status?: string): void;
  close(): void;
}

function createActionRecorder(context: CommandContext): ActionRecorder {
  let connection: KundolDatabase | null = null;
  let repository: ActionRepository | null = null;
  return {
    record(actionType, details, status) {
      if (!repository) {
        connection = (context.databaseOpen ?? openKundolDatabase)(dbOptions(context));
        repository = new ActionRepository(connection.db, { now: () => new Date() });
      }
      repository.record({ actionType, details, ...(status ? { status } : {}) });
    },
    close() {
      connection?.close();
      connection = null;
      repository = null;
    },
  };
}

function registryAuditSink(context: CommandContext, targetAudit: ActionRecorder) {
  return async (event: RegistryAuditEvent) => {
    targetAudit.record("REGISTRY_TARGET", {
      phase: event.phase,
      ruleId: event.ruleId,
      candidateId: event.candidateId,
      targetKey: event.targetKey,
      ...(event.reason ? { reason: event.reason } : {}),
    }, event.phase);
    recordSessionAudit(context, { action: `REGISTRY_${event.phase.toUpperCase()}`, projectName: event.targetKey });
  };
}

function registryEngine(
  context: CommandContext, registry: OptimisationRegistry, projectRoots: readonly string[],
  targetAudit: ActionRecorder, workdirRoot?: string,
) {
  const runner = context.registryRunner ?? runRegistryCommand;
  const now = context.registryNow ?? (() => new Date());
  const bindings = createLocalHandlerBindings({
    runner, nugetRunner: context.nugetPinnedRunner ?? runNugetPinnedCommand,
    condaRunner: context.condaPinnedRunner ?? runCondaPinnedCommand, now,
  });
  return createCliRegistryEngine({
    registry,
    context: {
      homeDir: context.homeDir ?? homedir(), projectRoots,
      ...(workdirRoot ? { workdirRoot } : {}),
      commandCwd: path.resolve(context.registryCommandCwd ?? process.cwd()),
      ...(context.registryUserRoots ? { userRoots: context.registryUserRoots } : {}),
    },
    runner,
    now,
    ...bindings,
    audit: registryAuditSink(context, targetAudit),
  });
}

async function prepareDockerRegistry(
  context: CommandContext,
  registry: OptimisationRegistry,
  targetAudit: ActionRecorder,
  contextName: string,
) {
  const pinnedRunner = (context.dockerPinnedRunnerFactory ?? createPinnedDockerRunner)(contextName);
  const identity = await resolvePinnedDockerContextIdentity(contextName, pinnedRunner);
  const protectedInventory = createProtectedDockerContextInventory({
    contextName, endpoint: identity.endpoint, daemonId: identity.daemonId, runner: pinnedRunner,
  });
  const stoppedContainers = createStoppedDockerContainerBinding({
    contextName, endpoint: identity.endpoint, daemonId: identity.daemonId, runner: pinnedRunner,
  });
  const pinnedProbeRunner: RegistryCommandRunner = async (argv) => {
    if (argv[0] !== "docker") return { exitCode: 1, stdout: "", stderr: "non-Docker command rejected in Docker context" };
    const result = await pinnedRunner(["docker", "--context", contextName, ...argv.slice(1)]);
    return { exitCode: result.exitCode, stdout: result.stdout.text, stderr: result.stderr, truncated: result.stdout.truncated };
  };
  const engine = createCliRegistryEngine({
    registry,
    context: { homeDir: context.homeDir ?? homedir(), projectRoots: [] },
    runner: pinnedProbeRunner,
    audit: registryAuditSink(context, targetAudit),
    selectorAdapters: {
      ...protectedInventory.selectorAdapters,
      "docker.containers.stopped": stoppedContainers.selector,
    },
    actionAdapters: {
      "docker.container.remove_selected": async (_rule, candidate) => stoppedContainers.remove(candidate),
    },
    ruleValidators: {
      "docker.container.stopped": {
        tool_available: async () => true,
        resource_still_unused: async (_rule, candidate) => stoppedContainers.isStillStopped(candidate.target),
        target_exists: async (_rule, candidate) => stoppedContainers.isStillStopped(candidate.target),
      },
    },
  });
  return { engine, identity };
}

function combineProbeResults(plans: readonly RegistryProbeResult[]): RegistryProbeResult {
  const candidates = plans.flatMap((plan) => [...plan.candidates]);
  const ids = new Set<string>();
  const resourceIds = new Map<string, string>();
  const pathRoot: CombinedPathTrieNode = { children: new Map() };
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) throw new Error(`duplicate candidate across optimisation scopes: ${candidate.id}`);
    ids.add(candidate.id);
    if (candidate.target.kind === "resource") {
      const existing = resourceIds.get(candidate.target.key);
      if (existing) throw new Error(`overlapping target across optimisation scopes: ${existing} and ${candidate.id}`);
      resourceIds.set(candidate.target.key, candidate.id);
      continue;
    }
    registerCombinedPath(pathRoot, candidate.target.realPath, candidate.id);
  }
  return {
    planId: `all:${plans.map((plan) => plan.planId).join(":")}`,
    candidates,
    skippedRules: plans.flatMap((plan) => [...plan.skippedRules]),
    knownBytes: plans.reduce((total, plan) => total + plan.knownBytes, 0),
  };
}

interface CombinedPathTrieNode {
  selectedCandidateId?: string;
  descendantCandidateId?: string;
  children: Map<string, CombinedPathTrieNode>;
}

function registerCombinedPath(root: CombinedPathTrieNode, realPath: string, candidateId: string): void {
  const ancestry = [root];
  let cursor = root;
  for (const segment of realPath.split(path.sep).filter(Boolean)) {
    if (cursor.selectedCandidateId) {
      throw new Error(`overlapping target across optimisation scopes: ${cursor.selectedCandidateId} and ${candidateId}`);
    }
    let child = cursor.children.get(segment);
    if (!child) {
      child = { children: new Map() };
      cursor.children.set(segment, child);
    }
    cursor = child;
    ancestry.push(cursor);
  }
  const existing = cursor.selectedCandidateId ?? cursor.descendantCandidateId;
  if (existing) throw new Error(`overlapping target across optimisation scopes: ${existing} and ${candidateId}`);
  cursor.selectedCandidateId = candidateId;
  for (const node of ancestry) node.descendantCandidateId ??= candidateId;
}

function mergeApplyResults(results: readonly RegistryApplyResult[]): RegistryApplyResult {
  return {
    applied: results.flatMap((result) => [...result.applied]),
    skipped: results.flatMap((result) => [...result.skipped]),
    failed: results.flatMap((result) => [...result.failed]),
    knownReclaimedBytes: results.reduce((total, result) => total + result.knownReclaimedBytes, 0),
    auditWarnings: results.flatMap((result) => [...result.auditWarnings]),
  };
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

function writeRegistryPlan(
  context: CommandContext, name: string, plan: RegistryProbeResult, registry: OptimisationRegistry,
  roots?: RegistryProjectRootsResult,
  dockerContext?: { name: string; endpoint: string; ownerId: string },
): void {
  context.output.writeLine(`${name} optimisation plan`);
  if (dockerContext) {
    context.output.writeLine(`Docker context: ${dockerContext.name}`);
    context.output.writeLine(`Endpoint: ${dockerContext.endpoint}`);
    context.output.writeLine(`Pinned owner: ${dockerContext.ownerId}`);
  }
  if (roots) {
    context.output.writeLine(`Workdir: ${roots.workdir}`);
    context.output.writeLine(`Max depth: ${roots.maxDepth}`);
    context.output.writeLine(`Projects found: ${roots.roots.length}`);
  }
  context.output.writeLine(`Targets: ${plan.candidates.length}`);
  context.output.writeLine(`Safe suggestions: ${safeRegistryCandidates(plan).length}`);
  context.output.writeLine(`Known target footprint: ${formatBytes(plan.knownBytes)}`);
  context.output.writeLine(name === "All"
    ? "Eligibility: paths must pass live ownership/activity checks; Docker resources must still belong to the pinned daemon."
    : dockerContext
      ? "Eligibility: each resource must still belong to this daemon and pass live owner-state checks."
      : "Eligibility: target and contents must show no changes in the last 7 days.");
  context.output.writeLine("");
  if (plan.candidates.length === 0) context.output.writeLine("  none");
  for (const [index, candidate] of plan.candidates.entries()) {
    const target = candidate.target.kind === "path" ? candidate.target.absolutePath : `${candidate.target.ownerId}/${candidate.target.resourceId}`;
    const size = candidate.target.sizeBytes === null ? "unknown" : formatBytes(candidate.target.sizeBytes);
    const action = candidate.action.kind === "command" ? candidate.action.argv.join(" ") :
      candidate.action.kind === "adapter" ? candidate.action.adapterId :
      candidate.action.kind === "remove_generated" ? "remove generated path" : "inventory only";
    const tier = candidate.status === "beta" ? `beta ${candidate.tier}` : candidate.tier;
    context.output.writeLine(`  ${index + 1}. [${tier}] ${candidate.label}  ${size}`);
    if (name === "All") context.output.writeLine(`     Scope: ${candidate.scope}`);
    context.output.writeLine(`     ${target}`);
    context.output.writeLine(`     ${renderRegistryTemplate(registry.messageTemplates.plan, { label: candidate.label, description: candidate.description })} Action: ${action}.`);
    for (const evidence of candidate.evidence) context.output.writeLine(`     Evidence: ${evidence}`);
    if (candidate.sources[0]) context.output.writeLine(`     Source: ${candidate.sources[0].url}`);
  }
  const unavailable = plan.skippedRules.filter((entry) => !entry.reason.startsWith("rule status ") &&
    entry.reason !== "beta rule requires explicit experimental opt-in");
  if (roots?.warnings.length || unavailable.length) {
    context.output.writeLine("");
    for (const warning of roots?.warnings ?? []) context.output.writeLine(`Warning: ${warning}`);
    for (const entry of unavailable) {
      const beta = registry.rules.find((rule) => rule.id === entry.ruleId)?.status === "beta" ? " [beta]" : "";
      context.output.writeLine(`Unavailable${beta} ${entry.ruleId}: ${entry.reason}`);
    }
  }
  if (plan.candidates.length > 0) context.output.writeLine(plan.candidates.every((candidate) => candidate.tier === "protected")
    ? "Inventory only: protected entries cannot be selected."
    : "Select y for safe suggestions or target numbers for explicit review. Protected entries cannot be selected.");
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

function dbOptions(context: CommandContext): { databasePath?: string; homeDir?: string } {
  return {
    ...(context.databasePath ? { databasePath: context.databasePath } : {}),
    ...(context.homeDir ? { homeDir: context.homeDir } : {}),
  };
}
