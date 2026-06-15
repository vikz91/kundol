import { rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { loadKundolConfig } from "../config/load-config";
import { getKundolHomePath } from "../config/paths";
import { saveKundolConfig } from "../config/save-config";
import { archiveBeforeCleanDaysKey, readTypedSettings } from "../config/settings";
import { openKundolDatabase } from "../db/client";
import { ActionRepository } from "../db/repositories/action-repository";
import { ProjectRepository, type Project } from "../db/repositories/project-repository";
import { ScanRepository } from "../db/repositories/scan-repository";
import { analyzeProjectCleanup } from "../core/analysis/analyzer";
import type { ScanItem } from "../core/analysis/cleanable-item";
import { runIndexWorker } from "../core/workers/index-worker";
import type { RuntimeFamily } from "../core/safety/types";
import { exitCodes, type ExitCode } from "../shared/exit-codes";
import type { Output } from "../shared/output";
import { canRunOpenTuiDashboard, runOpenTuiDashboard } from "../tui/opentui-dashboard";
import { recordSessionAudit } from "../services/audit/session-audit-log";
import { archiveProjectFolder, getProjectArchivePlan } from "../services/archive/project-archive-service";
import { formatWelcomeMessage } from "./welcome";

const DASHBOARD_TOP_PROJECT_LIMIT = 8;

export interface CommandResult {
  exitCode: ExitCode;
}

export interface CommandContext {
  output: Output;
  databasePath?: string;
  homeDir?: string;
}

export interface InitOptions {
  workspace?: string[];
  index: boolean;
}

export interface IndexOptions {
  workspace?: string;
  all: boolean;
  json: boolean;
}

export interface DashboardOptions {
  json: boolean;
}

export interface ListOptions {
  status?: string;
  runtime?: string;
  tag?: string;
  search?: string;
  scanned?: boolean;
  sort?: string;
  json: boolean;
}

export interface JsonOptions {
  json: boolean;
}

export interface ConfigOptions extends JsonOptions {
  archiveBeforeCleanDays?: number;
}

export interface ScanOptions {
  json: boolean;
  largest: boolean;
}

export interface CleanOptions {
  dryRun: boolean;
  apply: boolean;
  only?: string;
}

type MaybePromiseResult = CommandResult | Promise<CommandResult>;

const ok: CommandResult = { exitCode: exitCodes.ok };

export async function openDefaultTui(context: CommandContext): Promise<CommandResult> {
  if (canRunOpenTuiDashboard()) {
    try {
      recordSessionAudit(context, { action: "TUI_OPEN" });
      const demoMs = readOpenTuiDemoMs();
      await runOpenTuiDashboard(context, demoMs ? { demoMs } : {});
      recordSessionAudit(context, { action: "TUI_CLOSE" });
      return ok;
    } catch (error) {
      context.output.writeError(`OpenTUI unavailable; falling back to text dashboard. ${formatError(error)}`);
    }
  }

  context.output.writeLine(formatWelcomeMessage());
  return showDashboard(context, { json: false });
}

export async function initProject(context: CommandContext, options: InitOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "INIT" });
  const workspaces = (options.workspace ?? []).map((workspace) => resolve(workspace));

  if (workspaces.length === 0) {
    context.output.writeError("Provide at least one workspace: kundol init --workspace ~/Projects");
    return { exitCode: exitCodes.usage };
  }

  const config = saveKundolConfig({ workspaces: workspaces.map((path) => ({ path })) }, dbOptions(context));
  context.output.writeLine(`Initialized kundol at ${config.databasePath}`);
  for (const workspace of config.workspaces) {
    context.output.writeLine(`Workspace: ${workspace.path}`);
  }

  if (options.index) {
    context.output.writeLine("");
    return indexWorkspaces(context, { all: true, json: false });
  }

  return ok;
}

export async function indexWorkspaces(context: CommandContext, options: IndexOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: "INDEX" });
  const config = loadKundolConfig(dbOptions(context));
  const workspaceRoots = options.workspace
    ? [resolve(options.workspace)]
    : config.workspaces.filter((workspace) => workspace.enabled).map((workspace) => workspace.path);

  if (workspaceRoots.length === 0) {
    context.output.writeError("No workspace configured. Run `kundol init --workspace <path>` first.");
    return { exitCode: exitCodes.usage };
  }

  const result = await runIndexWorker({
    workspaceRoots,
    excludedPaths: config.excludedPaths.map((excludedPath) => excludedPath.path),
  });

  const connection = openKundolDatabase(dbOptions(context));
  try {
    const projects = new ProjectRepository(connection.db, { now: () => new Date() });
    const actions = new ActionRepository(connection.db, { now: () => new Date() });
    const indexedAt = new Date().toISOString();

    for (const project of result.projects) {
      const existing = projects.findByPath(project.path);
      const status = inferLifecycleStatus({
        ...(existing?.status ? { existingStatus: existing.status } : {}),
        lastModifiedAt: project.lastModifiedAt,
        now: new Date(),
      });

      projects.upsert({
        path: project.path,
        name: project.name,
        primaryRuntime: project.type.primaryRuntime,
        runtimes: project.type.runtimes,
        status,
        sizeBytes: project.sizeBytes,
        gitRemoteUrl: project.git.remoteUrl,
        gitBranch: project.git.branch,
        gitDirty: project.git.dirty ?? false,
        lastIndexedAt: indexedAt,
      });
    }

    actions.record({
      actionType: "INDEX",
      details: {
        workspaceRoots,
        projectCount: result.projects.length,
        warningCount: result.warnings.length,
        elapsedMs: result.elapsedMs,
      },
    });
  } finally {
    connection.close();
  }

  if (options.json) {
    writeJson(context, result);
    return ok;
  }

  context.output.writeLine(`Indexed ${result.projects.length} project(s) across ${result.workspacesIndexed} workspace(s).`);
  context.output.writeLine(`Skipped ${result.skippedDirectories} generated/internal directorie(s).`);
  if (result.warnings.length > 0) {
    context.output.writeLine(`Warnings: ${result.warnings.length}`);
  }
  return ok;
}

export function showDashboard(context: CommandContext, options: DashboardOptions): CommandResult {
  recordSessionAudit(context, { action: options.json ? "DASHBOARD_JSON" : "DASHBOARD" });
  const projects = readProjects(context);
  const counts = countBy(projects, (project) => project.status);
  const totalSizeBytes = sum(projects.map((project) => project.sizeBytes));
  const cleanableBytes = sum(projects.map((project) => project.cleanableBytes));
  const topProjects = [...projects].sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, DASHBOARD_TOP_PROJECT_LIMIT);
  const payload = { projectCount: projects.length, counts, totalSizeBytes, cleanableBytes, topProjects };

  if (options.json) {
    writeJson(context, payload);
    return ok;
  }

  context.output.writeLine("kundol dashboard");
  context.output.writeLine(`Projects: ${projects.length}`);
  context.output.writeLine(`Total size: ${formatBytes(totalSizeBytes)}`);
  context.output.writeLine(`Safe cleanup preview: ${formatBytes(cleanableBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("By status:");
  for (const [status, count] of Object.entries(counts).sort()) {
    context.output.writeLine(`  ${status}: ${count}`);
  }
  context.output.writeLine("");
  context.output.writeLine("Top space consumers:");
  for (const project of topProjects) {
    context.output.writeLine(`  ${project.name}  ${formatBytes(project.sizeBytes)}  ${project.path}`);
  }
  return ok;
}

export function listProjects(context: CommandContext, options: ListOptions): CommandResult {
  recordSessionAudit(context, { action: options.json ? "LIST_JSON" : "LIST" });
  let projects = readProjects(context);

  if (options.status) {
    projects = projects.filter((project) => project.status.toLowerCase() === options.status!.toLowerCase());
  }
  if (options.runtime) {
    projects = projects.filter((project) => project.runtimes.some((runtime) => runtime.toLowerCase() === options.runtime!.toLowerCase()));
  }
  if (options.search) {
    const query = options.search.toLowerCase();
    projects = projects.filter((project) =>
      [project.name, project.path, project.notes ?? "", project.gitRemoteUrl ?? ""].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }
  if (options.scanned) {
    projects = projects.filter((project) => project.lastScannedAt !== null);
  }
  if (options.tag) {
    context.output.writeError("Tag filtering is not available until tag write workflows are implemented.");
    return { exitCode: exitCodes.usage };
  }

  projects = sortProjects(projects, options.sort);

  if (options.json) {
    writeJson(context, projects);
    return ok;
  }

  if (projects.length === 0) {
    context.output.writeLine("No projects found. Run `kundol index` after configuring a workspace.");
    return ok;
  }

  context.output.writeLine(formatProjectTable(projects));
  return ok;
}

export function showProject(context: CommandContext, project: string, options: JsonOptions): CommandResult {
  const found = findProject(context, project);
  if (!found) {
    context.output.writeError(`Project not found: ${project}`);
    return { exitCode: exitCodes.usage };
  }
  recordSessionAudit(context, { action: options.json ? "SHOW_JSON" : "SHOW", projectName: found.name });

  if (options.json) {
    writeJson(context, found);
    return ok;
  }

  context.output.writeLine(found.name);
  context.output.writeLine(`Path: ${found.path}`);
  context.output.writeLine(`Status: ${found.status}`);
  context.output.writeLine(`Runtime: ${found.primaryRuntime ?? "unknown"} (${found.runtimes.join(", ") || "none"})`);
  context.output.writeLine(`Size: ${formatBytes(found.sizeBytes)}`);
  context.output.writeLine(`Cleanable: ${formatBytes(found.cleanableBytes)}`);
  context.output.writeLine(`Git: ${found.gitBranch ?? "-"} ${found.gitDirty ? "(dirty)" : "(clean)"}`);
  if (found.gitRemoteUrl) context.output.writeLine(`Remote: ${found.gitRemoteUrl}`);
  context.output.writeLine(`Last indexed: ${found.lastIndexedAt ?? "-"}`);
  context.output.writeLine(`Last scanned: ${found.lastScannedAt ?? "-"}`);
  return ok;
}

export async function scanProject(context: CommandContext, project: string, options: ScanOptions): Promise<CommandResult> {
  const found = findProject(context, project);
  if (!found) {
    context.output.writeError(`Project not found: ${project}`);
    return { exitCode: exitCodes.usage };
  }
  recordSessionAudit(context, { action: options.json ? "PROJECT_SCAN_JSON" : "PROJECT_SCAN", projectName: found.name });

  const result = await analyzeProjectCleanup({
    projectPath: found.path,
    projectId: found.id,
    projectName: found.name,
    runtimes: toRuntimeFamilies(found.runtimes),
    status: found.status,
    largestLimit: options.largest ? 20 : 5,
  });

  const connection = openKundolDatabase(dbOptions(context));
  try {
    const scans = new ScanRepository(connection.db, { now: () => new Date() });
    const actions = new ActionRepository(connection.db, { now: () => new Date() });
    const scan = scans.create({
      projectId: found.id,
      totalSizeBytes: result.summary.totalSizeBytes,
      cleanableBytes: result.summary.safeCleanupBytes,
      itemCount: result.items.length,
      recommendationCount: result.recommendations.length,
      details: {
        warnings: result.warnings,
        recommendations: result.recommendations,
      },
    });

    for (const item of result.items) {
      scans.createItem({
        scanId: scan.id,
        projectId: found.id,
        path: item.path,
        kind: item.kind,
        safety: item.classification,
        sizeBytes: item.sizeBytes,
        reason: item.reason,
        metadata: {
          absolutePath: item.absolutePath,
          ruleId: item.ruleId,
          canAutoClean: item.canAutoClean,
        },
      });
    }

    actions.record({
      projectId: found.id,
      actionType: "PROJECT_SCAN",
      details: {
        scanId: scan.id,
        cleanableBytes: result.summary.safeCleanupBytes,
        itemCount: result.items.length,
      },
    });
  } finally {
    connection.close();
  }

  if (options.json) {
    writeJson(context, result);
    return ok;
  }

  context.output.writeLine(`Scanned ${found.name}`);
  context.output.writeLine(`Total size: ${formatBytes(result.summary.totalSizeBytes)}`);
  context.output.writeLine(`Safe cleanup: ${formatBytes(result.summary.safeCleanupBytes)}`);
  context.output.writeLine(`Caution: ${formatBytes(result.summary.cautionBytes)}`);
  context.output.writeLine(`Protected: ${formatBytes(result.summary.protectedBytes)}`);
  context.output.writeLine("");
  context.output.writeLine("Recommendations:");
  for (const recommendation of result.recommendations) {
    context.output.writeLine(`  [${recommendation.priority}] ${recommendation.message}`);
  }
  if (options.largest) {
    context.output.writeLine("");
    context.output.writeLine("Largest detected items:");
    for (const item of result.largestItems) {
      context.output.writeLine(`  ${formatBytes(item.sizeBytes)}  ${item.classification}  ${item.path}`);
    }
  }
  return ok;
}

export async function cleanProject(context: CommandContext, project: string, options: CleanOptions): Promise<CommandResult> {
  const found = findProject(context, project);
  if (!found) {
    context.output.writeError(`Project not found: ${project}`);
    return { exitCode: exitCodes.usage };
  }
  const cleanAction = options.apply && !options.dryRun ? "CLEAN_APPLY" : "CLEAN_DRY_RUN";
  recordSessionAudit(context, { action: cleanAction, projectName: found.name });

  const result = await analyzeProjectCleanup({
    projectPath: found.path,
    projectId: found.id,
    projectName: found.name,
    runtimes: toRuntimeFamilies(found.runtimes),
    status: found.status,
  });
  let safeItems = result.items.filter((item) => item.classification === "safe" && item.canAutoClean);
  if (options.only) {
    safeItems = safeItems.filter((item) => item.ruleId === options.only || item.kind === options.only);
  }

  const apply = options.apply && !options.dryRun;
  const totalBytes = sum(safeItems.map((item) => item.sizeBytes));
  const config = loadKundolConfig(dbOptions(context));
  const settings = readTypedSettings(config.settings);
  const archivePlan = await getProjectArchivePlan(found.path, settings.archiveBeforeCleanDays);

  if (!apply) {
    context.output.writeLine(`Dry run: ${safeItems.length} safe item(s), ${formatBytes(totalBytes)} reclaimable.`);
    context.output.writeLine(
      archivePlan.eligible
        ? `Archive: would create local tar.gz before apply; last opened ${formatAgeDays(archivePlan.ageDays)} ago, threshold ${archivePlan.thresholdDays} day(s).`
        : `Archive: not needed; last opened ${formatAgeDays(archivePlan.ageDays)} ago, threshold ${archivePlan.thresholdDays} day(s).`,
    );
    for (const item of safeItems.slice(0, 30)) {
      context.output.writeLine(`  ${formatBytes(item.sizeBytes)}  ${item.path}`);
    }
    context.output.writeLine(`Apply safe cleanup: kundol clean ${found.name} --apply --no-dry-run`);
    recordCleanAction(context, found.id, "CLEAN_DRY_RUN", { itemCount: safeItems.length, totalBytes, archivePlan });
    return ok;
  }

  const archive = await archiveProjectFolder({
    projectPath: found.path,
    projectName: found.name,
    archiveRoot: getArchiveRoot(context),
    thresholdDays: settings.archiveBeforeCleanDays,
  });
  for (const item of safeItems) {
    await removeSafeItem(found.path, item);
  }
  recordCleanAction(context, found.id, "CLEAN_APPLY", { itemCount: safeItems.length, totalBytes, archive });
  if (archive) {
    context.output.writeLine(`Archived project to ${archive.archivePath}`);
  }
  context.output.writeLine(`Removed ${safeItems.length} safe generated item(s), reclaiming about ${formatBytes(totalBytes)}.`);
  return ok;
}

export async function showRuntimes(context: CommandContext, options: JsonOptions): Promise<CommandResult> {
  recordSessionAudit(context, { action: options.json ? "RUNTIMES_JSON" : "RUNTIMES" });
  const runtimes = await Promise.all([
    detectTool("node", ["--version"]),
    detectTool("npm", ["--version"]),
    detectTool("pnpm", ["--version"]),
    detectTool("yarn", ["--version"]),
    detectTool("bun", ["--version"]),
    detectTool("deno", ["--version"]),
    detectTool("python3", ["--version"]),
    detectTool("go", ["version"]),
    detectTool("rustc", ["--version"]),
    detectTool("cargo", ["--version"]),
    detectTool("java", ["--version"]),
    detectTool("dotnet", ["--version"]),
  ]);

  if (options.json) {
    writeJson(context, runtimes);
    return ok;
  }

  context.output.writeLine("Local runtimes");
  for (const runtime of runtimes) {
    const value = runtime.available ? runtime.version : "missing";
    context.output.writeLine(`  ${runtime.name}: ${value}`);
  }
  return ok;
}

export function showConfig(context: CommandContext, options: JsonOptions): CommandResult {
  recordSessionAudit(context, { action: options.json ? "CONFIG_JSON" : "CONFIG" });
  const config = loadKundolConfig(dbOptions(context));
  const settings = readTypedSettings(config.settings);
  if (options.json) {
    writeJson(context, { ...config, typedSettings: settings });
    return ok;
  }
  context.output.writeLine(`Database: ${config.databasePath}`);
  context.output.writeLine(`Session logs: ${join(getKundolHomePath(dbOptions(context)), "sessions")}`);
  context.output.writeLine(`Initialized: ${config.initialized ? "yes" : "no"}`);
  context.output.writeLine("Settings:");
  context.output.writeLine(`  archive before clean days: ${settings.archiveBeforeCleanDays}`);
  context.output.writeLine("Workspaces:");
  for (const workspace of config.workspaces) {
    context.output.writeLine(`  ${workspace.enabled ? "enabled" : "disabled"}  ${workspace.path}`);
  }
  context.output.writeLine("Excluded paths:");
  for (const excludedPath of config.excludedPaths) {
    context.output.writeLine(`  ${excludedPath.path}${excludedPath.reason ? ` (${excludedPath.reason})` : ""}`);
  }
  return ok;
}

export function updateConfig(context: CommandContext, options: ConfigOptions): CommandResult {
  recordSessionAudit(context, { action: options.json ? "CONFIG_UPDATE_JSON" : "CONFIG_UPDATE" });
  const settings: Record<string, unknown> = {};
  if (options.archiveBeforeCleanDays !== undefined) {
    settings[archiveBeforeCleanDaysKey] = options.archiveBeforeCleanDays;
  }
  const config = saveKundolConfig({ settings }, dbOptions(context));
  const typedSettings = readTypedSettings(config.settings);

  if (options.json) {
    writeJson(context, { ...config, typedSettings });
    return ok;
  }

  context.output.writeLine("Saved kundol config.");
  context.output.writeLine(`Archive before clean days: ${typedSettings.archiveBeforeCleanDays}`);
  return ok;
}

function readProjects(context: CommandContext): Project[] {
  const connection = openKundolDatabase({ ...dbOptions(context), readonly: false });
  try {
    return new ProjectRepository(connection.db, { now: () => new Date() }).list();
  } finally {
    connection.close();
  }
}

function findProject(context: CommandContext, identifier: string): Project | null {
  const connection = openKundolDatabase({ ...dbOptions(context), readonly: false });
  try {
    return new ProjectRepository(connection.db, { now: () => new Date() }).findByIdentifier(identifier);
  } finally {
    connection.close();
  }
}

function recordCleanAction(
  context: CommandContext,
  projectId: string,
  actionType: string,
  details: Record<string, unknown>,
): void {
  const connection = openKundolDatabase(dbOptions(context));
  try {
    new ActionRepository(connection.db, { now: () => new Date() }).record({ projectId, actionType, details });
  } finally {
    connection.close();
  }
}

async function removeSafeItem(projectPath: string, item: ScanItem): Promise<void> {
  const resolvedProject = resolve(projectPath);
  const resolvedTarget = resolve(item.absolutePath);
  const relativeTarget = relative(resolvedProject, resolvedTarget);
  if (relativeTarget.startsWith("..") || relativeTarget === "" || resolve(resolvedProject, relativeTarget) !== resolvedTarget) {
    throw new Error(`Refusing to remove path outside project: ${item.absolutePath}`);
  }
  await rm(resolvedTarget, { recursive: true, force: true });
}

function inferLifecycleStatus(input: {
  existingStatus?: string;
  lastModifiedAt: Date | null;
  now: Date;
}): string {
  if (input.existingStatus === "ARCHIVED" || input.existingStatus === "DELETED") {
    return input.existingStatus;
  }
  if (!input.lastModifiedAt) return input.existingStatus ?? "NEW";
  const ageDays = (input.now.getTime() - input.lastModifiedAt.getTime()) / 86_400_000;
  if (ageDays <= 30) return "ACTIVE";
  if (ageDays <= 120) return "PAUSED";
  return "STALE";
}

function dbOptions(context: CommandContext): { databasePath?: string; homeDir?: string } {
  return {
    ...(context.databasePath ? { databasePath: context.databasePath } : {}),
    ...(context.homeDir ? { homeDir: context.homeDir } : {}),
  };
}

function getArchiveRoot(context: CommandContext): string {
  return join(getKundolHomePath(dbOptions(context)), "archives");
}

function formatAgeDays(ageDays: number): string {
  return `${Math.floor(ageDays)} day(s)`;
}

function sortProjects(projects: Project[], sort?: string): Project[] {
  const sorted = [...projects];
  if (sort === "size") return sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
  if (sort === "modified") return sorted.sort((a, b) => (b.lastIndexedAt ?? "").localeCompare(a.lastIndexedAt ?? ""));
  if (sort === "cleanable") return sorted.sort((a, b) => b.cleanableBytes - a.cleanableBytes);
  return sorted.sort((a, b) => a.name.localeCompare(b.name));
}

function formatProjectTable(projects: Project[]): string {
  const rows = [
    ["Name", "Runtime", "Status", "Size", "Cleanable", "Git", "Path"],
    ...projects.map((project) => [
      project.name,
      project.primaryRuntime ?? "unknown",
      project.status,
      formatBytes(project.sizeBytes),
      formatBytes(project.cleanableBytes),
      project.gitDirty ? "dirty" : "clean",
      project.path,
    ]),
  ];
  const widths = rows[0]!.map((_, index) => Math.min(32, Math.max(...rows.map((row) => row[index]!.length))));
  return rows
    .map((row, rowIndex) => {
      const line = row.map((cell, index) => fit(cell, widths[index]!)).join("  ");
      return rowIndex === 0 ? `${line}\n${widths.map((width) => "-".repeat(width)).join("  ")}` : line;
    })
    .join("\n");
}

function fit(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}~`;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function writeJson(context: CommandContext, value: unknown): void {
  context.output.writeLine(JSON.stringify(value, null, 2));
}

function toRuntimeFamilies(runtimes: string[]): RuntimeFamily[] {
  const allowed = new Set(["node", "bun", "deno", "python", "go", "rust", "java", "dotnet", "unity", "unknown"]);
  return runtimes.map((runtime) => (allowed.has(runtime) ? runtime : "unknown")) as RuntimeFamily[];
}

function readOpenTuiDemoMs(): number | undefined {
  const raw = process.env.KUNDOL_OPENTUI_DEMO_MS ?? process.env.KUNDOL_OPENTUI_DEMO;
  if (!raw) return undefined;
  if (raw === "1") return 1200;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1200;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function detectTool(name: string, args: string[]): Promise<{ name: string; available: boolean; version: string | null }> {
  try {
    const proc = Bun.spawn([name, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = `${stdout}${stderr}`.trim().split("\n")[0] ?? "";
    return { name, available: exitCode === 0, version: exitCode === 0 ? output : null };
  } catch {
    return { name, available: false, version: null };
  }
}
