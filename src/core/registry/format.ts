import type { Project } from "../../db/repositories/project-repository";
import type { TuiProjectSummary } from "../../tui/types";
import { fitCell, formatCount } from "../../tui/format";
import type { DashboardSummary, ProjectListResult, RegistryWarning, ShowProjectResult } from "./query";

export interface RegistryProjectRow {
  id: string;
  name: string;
  path: string;
  runtime: string;
  status: string;
  size: string;
  cleanable: string;
  lastIndexed: string;
  lastScanned: string;
  git: string;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = units[unitIndex] ?? "B";
  return `${value >= 10 || unit === "B" ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return "never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

export function toRegistryProjectRow(project: Project): RegistryProjectRow {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    runtime: project.primaryRuntime ?? project.runtimes[0] ?? "unknown",
    status: project.status,
    size: formatBytes(project.sizeBytes),
    cleanable: formatBytes(project.cleanableBytes),
    lastIndexed: formatDateLabel(project.lastIndexedAt),
    lastScanned: formatDateLabel(project.lastScannedAt),
    git: project.gitDirty ? "dirty" : "clean",
  };
}

export function toTuiProjectSummary(project: Project): TuiProjectSummary {
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    runtime: normalizeTuiRuntime(project.primaryRuntime ?? project.runtimes[0]),
    status: normalizeTuiStatus(project.status),
    size: formatBytes(project.sizeBytes),
    cleanable: formatBytes(project.cleanableBytes),
    lastIndexed: formatDateLabel(project.lastIndexedAt),
    lastScanned: formatDateLabel(project.lastScannedAt),
    dirty: project.gitDirty,
  };
}

export function formatProjectListTable(result: ProjectListResult): string {
  const rows = result.projects.map(toRegistryProjectRow);
  const lines = [
    [
      fitCell("Name", 22),
      fitCell("Runtime", 10),
      fitCell("Status", 10),
      fitCell("Size", 9),
      fitCell("Cleanable", 10),
      fitCell("Indexed", 10),
      fitCell("Git", 6),
      "Path",
    ].join("  "),
  ];

  for (const row of rows) {
    lines.push(
      [
        fitCell(row.name, 22),
        fitCell(row.runtime, 10),
        fitCell(row.status, 10),
        fitCell(row.size, 9),
        fitCell(row.cleanable, 10),
        fitCell(row.lastIndexed, 10),
        fitCell(row.git, 6),
        row.path,
      ].join("  "),
    );
  }

  if (rows.length === 0) {
    lines.push("No projects matched.");
  }

  return appendWarnings(lines, result.warnings).join("\n");
}

export function formatProjectDetail(result: ShowProjectResult): string {
  if (!result.project) {
    const lines = result.matches.length > 0 ? ["Multiple projects matched:", ...result.matches.map((project) => `- ${project.name}  ${project.path}`)] : ["Project not found."];
    return appendWarnings(lines, result.warnings).join("\n");
  }

  const project = result.project;
  const lines = [
    project.name,
    `ID: ${project.id}`,
    `Path: ${project.path}`,
    `Runtime: ${project.primaryRuntime ?? project.runtimes[0] ?? "unknown"}`,
    `Runtimes: ${project.runtimes.length > 0 ? project.runtimes.join(", ") : "unknown"}`,
    `Status: ${project.status}`,
    `Size: ${formatBytes(project.sizeBytes)}`,
    `Cleanable: ${formatBytes(project.cleanableBytes)}`,
    `Git: ${project.gitDirty ? "dirty" : "clean"}`,
    `Branch: ${project.gitBranch ?? "unknown"}`,
    `Remote: ${project.gitRemoteUrl ?? "unknown"}`,
    `Last indexed: ${formatDateLabel(project.lastIndexedAt)}`,
    `Last scanned: ${formatDateLabel(project.lastScannedAt)}`,
  ];

  if (project.notes) {
    lines.push(`Notes: ${project.notes}`);
  }

  return appendWarnings(lines, result.warnings).join("\n");
}

export function formatDashboardSummary(summary: DashboardSummary): string {
  const statusCounts = summary.countsByStatus.map((entry) => `${entry.status.toLowerCase()}: ${entry.count}`).join(", ");
  const lines = [
    `Projects: ${formatCount(summary.totalProjects, "project")}`,
    `Status: ${statusCounts || "none"}`,
    `Disk usage: ${formatBytes(summary.totalSizeBytes)}`,
    `Cleanable: ${formatBytes(summary.cleanableBytes)}`,
    "Top space consumers:",
  ];

  if (summary.topSpaceConsumers.length === 0) {
    lines.push("- none");
  } else {
    for (const project of summary.topSpaceConsumers) {
      lines.push(`- ${project.name}: ${formatBytes(project.sizeBytes)} (${project.path})`);
    }
  }

  return lines.join("\n");
}

function appendWarnings(lines: string[], warnings: RegistryWarning[]): string[] {
  if (warnings.length === 0) {
    return lines;
  }

  return [...lines, "", ...warnings.map((warning) => `Warning: ${warning.message}`)];
}

function normalizeTuiRuntime(value: string | null | undefined): TuiProjectSummary["runtime"] {
  switch (value) {
    case "node":
    case "bun":
    case "deno":
    case "python":
    case "go":
    case "rust":
    case "java":
    case "dotnet":
    case "git":
      return value;
    default:
      return "unknown";
  }
}

function normalizeTuiStatus(value: string): TuiProjectSummary["status"] {
  switch (value) {
    case "NEW":
    case "ACTIVE":
    case "PAUSED":
    case "STALE":
    case "ARCHIVED":
    case "DELETED":
      return value;
    default:
      return "UNKNOWN";
  }
}
