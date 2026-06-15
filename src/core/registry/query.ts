import { normalizeConfiguredPath } from "../../db/repositories/workspace-repository";
import type { Project } from "../../db/repositories/project-repository";

export type RegistrySortField =
  | "name"
  | "path"
  | "status"
  | "runtime"
  | "size"
  | "cleanable"
  | "lastIndexed"
  | "lastScanned"
  | "updated";

export type RegistrySortDirection = "asc" | "desc";

export interface RegistrySort {
  field: RegistrySortField;
  direction: RegistrySortDirection;
}

export interface ListProjectsFilters {
  status?: string;
  runtime?: string;
  tag?: string;
  search?: string;
  scanned?: boolean;
  sort?: string | RegistrySort;
}

export interface ListProjectsOptions extends ListProjectsFilters {
  tags?: RegistryTagResolver;
}

export interface ShowProjectOptions {
  tags?: RegistryTagResolver;
}

export interface DashboardOptions {
  topLimit?: number;
}

export interface ProjectListSource {
  list(): Project[];
}

export interface RegistryTagResolver {
  findProjectIdsByTag(tag: string): string[];
  listTagsForProject?(projectId: string): string[];
}

export interface RegistryWarning {
  code: "TAG_FILTER_UNAVAILABLE" | "TAG_LOOKUP_FAILED" | "AMBIGUOUS_PROJECT_MATCH";
  message: string;
}

export interface ProjectListResult {
  projects: Project[];
  filters: ListProjectsFilters;
  sort: RegistrySort;
  warnings: RegistryWarning[];
}

export interface ShowProjectResult {
  project: Project | null;
  matches: Project[];
  warnings: RegistryWarning[];
}

export interface DashboardStatusCount {
  status: string;
  count: number;
}

export interface DashboardSummary {
  totalProjects: number;
  countsByStatus: DashboardStatusCount[];
  totalSizeBytes: number;
  cleanableBytes: number;
  topSpaceConsumers: Project[];
}

export function listProjects(source: ProjectListSource, options: ListProjectsOptions = {}): ProjectListResult {
  const warnings: RegistryWarning[] = [];
  const sort = parseRegistrySort(options.sort);
  let projects = source.list();

  if (options.status) {
    const normalizedStatus = normalizeToken(options.status);
    projects = projects.filter((project) => normalizeToken(project.status) === normalizedStatus);
  }

  if (options.runtime) {
    const normalizedRuntime = normalizeToken(options.runtime);
    projects = projects.filter((project) =>
      [project.primaryRuntime, ...project.runtimes].some((runtime) => normalizeToken(runtime) === normalizedRuntime),
    );
  }

  if (options.tag) {
    if (!options.tags) {
      projects = [];
      warnings.push({
        code: "TAG_FILTER_UNAVAILABLE",
        message: "Tag filtering requires a tag repository; returning no projects instead of unfiltered results.",
      });
    } else {
      try {
        const taggedIds = new Set(options.tags.findProjectIdsByTag(options.tag));
        projects = projects.filter((project) => taggedIds.has(project.id));
      } catch {
        projects = [];
        warnings.push({
          code: "TAG_LOOKUP_FAILED",
          message: `Could not resolve projects tagged "${options.tag}"; returning no projects.`,
        });
      }
    }
  }

  if (options.search) {
    const query = normalizeSearch(options.search);
    projects = projects.filter((project) => projectMatchesSearch(project, query, options.tags));
  }

  if (options.scanned) {
    projects = projects.filter((project) => project.lastScannedAt !== null);
  }

  return {
    projects: sortProjects(projects, sort),
    filters: copyListFilters(options),
    sort,
    warnings,
  };
}

export function showProject(source: ProjectListSource, selector: string, options: ShowProjectOptions = {}): ShowProjectResult {
  const projects = source.list();
  const normalizedSelector = normalizeSearch(selector);
  const normalizedPath = normalizePathSelector(selector);

  const exactMatches = projects.filter(
    (project) =>
      project.id === selector ||
      normalizeSearch(project.name) === normalizedSelector ||
      normalizePathSelector(project.path) === normalizedPath,
  );

  if (exactMatches.length === 1) {
    return { project: exactMatches[0] ?? null, matches: exactMatches, warnings: [] };
  }

  if (exactMatches.length > 1) {
    return {
      project: null,
      matches: sortProjects(exactMatches, { field: "name", direction: "asc" }),
      warnings: [
        {
          code: "AMBIGUOUS_PROJECT_MATCH",
          message: `Project selector "${selector}" matched multiple projects.`,
        },
      ],
    };
  }

  const looseMatches = projects.filter((project) => projectMatchesSearch(project, normalizedSelector, options.tags));
  if (looseMatches.length === 1) {
    return { project: looseMatches[0] ?? null, matches: looseMatches, warnings: [] };
  }

  return {
    project: null,
    matches: sortProjects(looseMatches, { field: "name", direction: "asc" }),
    warnings:
      looseMatches.length > 1
        ? [
            {
              code: "AMBIGUOUS_PROJECT_MATCH",
              message: `Project selector "${selector}" matched multiple projects.`,
            },
          ]
        : [],
  };
}

export function getDashboardSummary(source: ProjectListSource, options: DashboardOptions = {}): DashboardSummary {
  const projects = source.list();
  const countsByStatus = new Map<string, number>();
  let totalSizeBytes = 0;
  let cleanableBytes = 0;

  for (const project of projects) {
    countsByStatus.set(project.status, (countsByStatus.get(project.status) ?? 0) + 1);
    totalSizeBytes += project.sizeBytes;
    cleanableBytes += project.cleanableBytes;
  }

  const topLimit = options.topLimit ?? 5;

  return {
    totalProjects: projects.length,
    countsByStatus: Array.from(countsByStatus, ([status, count]) => ({ status, count })).sort((a, b) =>
      a.status.localeCompare(b.status),
    ),
    totalSizeBytes,
    cleanableBytes,
    topSpaceConsumers: sortProjects(projects, { field: "size", direction: "desc" }).slice(0, topLimit),
  };
}

export function parseRegistrySort(input: string | RegistrySort | undefined): RegistrySort {
  if (!input) {
    return { field: "name", direction: "asc" };
  }

  if (typeof input !== "string") {
    return input;
  }

  const trimmed = input.trim();
  const direction: RegistrySortDirection =
    trimmed.startsWith("-") || trimmed.endsWith(":desc") || trimmed.endsWith("-desc") ? "desc" : "asc";
  const fieldName = trimmed.replace(/^-/, "").replace(/[:-](asc|desc)$/u, "");
  const field = parseSortField(fieldName);

  return { field, direction };
}

function parseSortField(input: string): RegistrySortField {
  switch (normalizeToken(input)) {
    case "path":
      return "path";
    case "status":
      return "status";
    case "runtime":
    case "type":
      return "runtime";
    case "size":
    case "sizebytes":
      return "size";
    case "cleanable":
    case "recoverable":
    case "cleanablebytes":
      return "cleanable";
    case "lastindexed":
    case "indexed":
    case "modified":
      return "lastIndexed";
    case "lastscanned":
    case "scanned":
      return "lastScanned";
    case "updated":
      return "updated";
    case "name":
    default:
      return "name";
  }
}

function sortProjects(projects: Project[], sort: RegistrySort): Project[] {
  return [...projects].sort((a, b) => {
    const direction = sort.direction === "asc" ? 1 : -1;
    const compared = compareProjects(a, b, sort.field);
    if (compared !== 0) {
      return compared * direction;
    }
    return a.name.localeCompare(b.name) || a.path.localeCompare(b.path);
  });
}

function compareProjects(a: Project, b: Project, field: RegistrySortField): number {
  switch (field) {
    case "path":
      return a.path.localeCompare(b.path);
    case "status":
      return a.status.localeCompare(b.status);
    case "runtime":
      return displayRuntime(a).localeCompare(displayRuntime(b));
    case "size":
      return a.sizeBytes - b.sizeBytes;
    case "cleanable":
      return a.cleanableBytes - b.cleanableBytes;
    case "lastIndexed":
      return compareNullableText(a.lastIndexedAt, b.lastIndexedAt);
    case "lastScanned":
      return compareNullableText(a.lastScannedAt, b.lastScannedAt);
    case "updated":
      return compareNullableText(a.updatedAt, b.updatedAt);
    case "name":
      return a.name.localeCompare(b.name);
  }
}

function projectMatchesSearch(project: Project, normalizedQuery: string, tags?: RegistryTagResolver): boolean {
  const fields = [
    project.id,
    project.name,
    project.path,
    project.primaryRuntime,
    project.status,
    project.gitRemoteUrl,
    project.gitBranch,
    project.notes,
    ...project.runtimes,
    ...safeListTags(project.id, tags),
  ];

  return fields.some((field) => normalizeSearch(field).includes(normalizedQuery));
}

function safeListTags(projectId: string, tags?: RegistryTagResolver): string[] {
  if (!tags?.listTagsForProject) {
    return [];
  }

  try {
    return tags.listTagsForProject(projectId);
  } catch {
    return [];
  }
}

function displayRuntime(project: Project): string {
  return project.primaryRuntime ?? project.runtimes[0] ?? "unknown";
}

function compareNullableText(a: string | null, b: string | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a.localeCompare(b);
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSearch(value: string | null | undefined): string {
  return normalizeToken(value);
}

function normalizePathSelector(value: string): string {
  try {
    return normalizeConfiguredPath(value);
  } catch {
    return value;
  }
}

function copyListFilters(options: ListProjectsOptions): ListProjectsFilters {
  const filters: ListProjectsFilters = {};
  if (options.status !== undefined) {
    filters.status = options.status;
  }
  if (options.runtime !== undefined) {
    filters.runtime = options.runtime;
  }
  if (options.tag !== undefined) {
    filters.tag = options.tag;
  }
  if (options.search !== undefined) {
    filters.search = options.search;
  }
  if (options.scanned !== undefined) {
    filters.scanned = options.scanned;
  }
  if (options.sort !== undefined) {
    filters.sort = options.sort;
  }
  return filters;
}
