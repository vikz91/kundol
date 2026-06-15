import { exitCodes, type ExitCode } from "../shared/exit-codes";
import { formatNotImplemented, type Output } from "../shared/output";

export interface CommandResult {
  exitCode: ExitCode;
}

export interface CommandContext {
  output: Output;
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
  sort?: string;
  json: boolean;
}

export interface JsonOptions {
  json: boolean;
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

function notImplemented(context: CommandContext, command: string, nextTask: string): CommandResult {
  context.output.writeLine(formatNotImplemented(command, nextTask));
  return { exitCode: exitCodes.notImplemented };
}

export function openDefaultTui(context: CommandContext): CommandResult {
  return notImplemented(context, "dashboard TUI", "KUN-024");
}

export function initProject(context: CommandContext, _options: InitOptions): CommandResult {
  return notImplemented(context, "init", "KUN-009");
}

export function indexWorkspaces(context: CommandContext, _options: IndexOptions): CommandResult {
  return notImplemented(context, "index", "KUN-016");
}

export function showDashboard(context: CommandContext, _options: DashboardOptions): CommandResult {
  return notImplemented(context, "dashboard", "KUN-024");
}

export function listProjects(context: CommandContext, _options: ListOptions): CommandResult {
  return notImplemented(context, "list", "KUN-017");
}

export function showProject(context: CommandContext, _project: string, _options: JsonOptions): CommandResult {
  return notImplemented(context, "show <project>", "KUN-017");
}

export function scanProject(context: CommandContext, _project: string, _options: ScanOptions): CommandResult {
  return notImplemented(context, "scan <project>", "KUN-032");
}

export function cleanProject(context: CommandContext, _project: string, _options: CleanOptions): CommandResult {
  return notImplemented(context, "clean <project>", "KUN-042");
}

export function showRuntimes(context: CommandContext, _options: JsonOptions): CommandResult {
  return notImplemented(context, "runtimes", "KUN-036");
}

export function showConfig(context: CommandContext, _options: JsonOptions): CommandResult {
  return notImplemented(context, "config", "KUN-009");
}
