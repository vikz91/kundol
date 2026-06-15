import { Box, Text, createCliRenderer, type CliRenderer } from "@opentui/core";
import { cpus, freemem, hostname, totalmem } from "node:os";
import { loadKundolConfig } from "../config/load-config";
import { getKundolHomePath } from "../config/paths";
import { saveKundolConfig } from "../config/save-config";
import { archiveBeforeCleanDaysKey, readTypedSettings } from "../config/settings";
import { openKundolDatabase } from "../db/client";
import { ActionRepository, type ActionLogEntry } from "../db/repositories/action-repository";
import { ProjectRepository, type Project } from "../db/repositories/project-repository";
import { ScanRepository } from "../db/repositories/scan-repository";
import { recordSessionAudit } from "../services/audit/session-audit-log";
import { runWorkspaceIndex } from "../services/indexing/index-service";
import { applyStorageOptimization, previewStorageOptimization, type OptimizeApplyResult, type OptimizePreview } from "../services/optimize/storage-optimizer";
import { cleanProjectService, type CleanProjectServiceResult } from "../services/scan-clean/clean-project-service";
import { scanProjectService } from "../services/scan-clean/scan-project-service";

export interface OpenTuiDashboardContext {
  databasePath?: string;
  homeDir?: string;
}

export interface OpenTuiDashboardModel {
  initialized: boolean;
  workspaceCount: number;
  workspaces: string[];
  projects: Project[];
  projectCount: number;
  statusCounts: Record<string, number>;
  totalSizeBytes: number;
  cleanableBytes: number;
  archiveBeforeCleanDays: number;
  archiveRoot: string;
  recentActions: ActionLogEntry[];
  topProjects: Array<{
    name: string;
    path: string;
    runtime: string;
    status: string;
    sizeBytes: number;
    cleanableBytes: number;
    gitDirty: boolean;
  }>;
}

interface RunOpenTuiDashboardOptions {
  demoMs?: number;
}

interface RuntimeStatus {
  name: string;
  available: boolean;
  version: string | null;
}

interface SystemStatus {
  sampledAt: Date;
  timeText: string;
  machineTag: string;
  currentDirectory: string;
  gitBranch: string | null;
  memoryPercent: number;
  cpuPercent: number | null;
  batteryPercent: number | null;
  dockerEngine: "up" | "down";
  dockerRunningContainers: number | null;
}

interface CpuSample {
  idleMs: number;
  totalMs: number;
}

type ViewName = "dashboard" | "projects" | "project" | "optimize" | "runtimes" | "config";
type StatusKind = "info" | "success" | "warning" | "error";
type LifecycleState = "starting" | "ready" | "closing";
type TuiAction = "index" | "scan" | "clean" | "optimize" | "runtimes";
export type OpenTuiProjectSortMode = "name" | "size" | "cleanable" | "lastScanned";
type LabradorAction = Extract<TuiAction, "index" | "scan" | "clean" | "optimize">;

const OPENTUI_DASHBOARD_TOP_PROJECT_LIMIT = 5;
const OPENTUI_PROJECT_LIST_LIMIT = 8;
const OPENTUI_MAX_RENDER_WIDTH = 220;

type OpenTuiNode = ReturnType<typeof Text> | ReturnType<typeof Box>;

interface Toast {
  id: string;
  kind: StatusKind;
  message: string;
  ttlFrames: number;
}

interface OpenTuiDashboardState {
  model: OpenTuiDashboardModel;
  view: ViewName;
  selectedProjectIndex: number;
  runtimes: RuntimeStatus[];
  cleanDryRunResult: CleanProjectServiceResult | null;
  cleanApplyArmedProjectId: string | null;
  optimizePreview: OptimizePreview | null;
  optimizeApplyResult: OptimizeApplyResult | null;
  optimizeApplyArmed: boolean;
  statusMessage: string;
  statusKind: StatusKind;
  busy: boolean;
  lifecycle: LifecycleState;
  animationFrame: number;
  toasts: Toast[];
  activeAction?: TuiAction;
  draftArchiveBeforeCleanDays: number;
  configDirty: boolean;
  projectSearchQuery: string;
  projectSearchActive: boolean;
  scannedOnly: boolean;
  projectSortMode: OpenTuiProjectSortMode;
  systemStatus: SystemStatus;
  cpuSample: CpuSample;
  systemStatusBusy: boolean;
  labradorDemoUntilFrame?: number;
}

export interface OpenTuiProjectListFilters {
  search?: string;
  scannedOnly?: boolean;
  sortMode?: OpenTuiProjectSortMode;
}

interface DashboardKeyInput {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta?: boolean;
}

const colors = {
  background: "#071013",
  panel: "#0d1f1b",
  border: "#38bdf8",
  accent: "#7dd3fc",
  green: "#86efac",
  yellow: "#fde68a",
  muted: "#94a3b8",
  text: "#e5eef7",
  danger: "#fca5a5",
};

export function canRunOpenTuiDashboard(): boolean {
  return Boolean(
    process.stdin.isTTY &&
      process.stdout.isTTY &&
      process.env.CI !== "true" &&
      process.env.KUNDOL_DISABLE_OPENTUI !== "1",
  );
}

export function buildOpenTuiDashboardModel(
  projects: Project[],
  options: {
    initialized?: boolean;
    workspaceCount?: number;
    workspaces?: string[];
    archiveBeforeCleanDays?: number;
    archiveRoot?: string;
    recentActions?: ActionLogEntry[];
  } = {},
): OpenTuiDashboardModel {
  const statusCounts: Record<string, number> = {};
  for (const project of projects) {
    statusCounts[project.status] = (statusCounts[project.status] ?? 0) + 1;
  }

  return {
    initialized: options.initialized ?? true,
    workspaceCount: options.workspaceCount ?? 1,
    workspaces: options.workspaces ?? [],
    projects,
    projectCount: projects.length,
    statusCounts,
    totalSizeBytes: sum(projects.map((project) => project.sizeBytes)),
    cleanableBytes: sum(projects.map((project) => project.cleanableBytes)),
    archiveBeforeCleanDays: options.archiveBeforeCleanDays ?? 15,
    archiveRoot: options.archiveRoot ?? getArchiveRoot({}),
    recentActions: options.recentActions ?? [],
    topProjects: [...projects]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, OPENTUI_DASHBOARD_TOP_PROJECT_LIMIT)
      .map((project) => ({
        name: project.name,
        path: project.path,
        runtime: project.primaryRuntime ?? project.runtimes[0] ?? "unknown",
        status: project.status,
        sizeBytes: project.sizeBytes,
        cleanableBytes: project.cleanableBytes,
        gitDirty: project.gitDirty,
      })),
  };
}

export function loadOpenTuiDashboardModel(context: OpenTuiDashboardContext): OpenTuiDashboardModel {
  const config = loadKundolConfig(context);
  const connection = openKundolDatabase({ ...context, readonly: false });
  try {
    const projects = new ProjectRepository(connection.db, { now: () => new Date() }).list();
    const actions = new ActionRepository(connection.db, { now: () => new Date() }).list(10);
    const enabledWorkspaces = config.workspaces.filter((workspace) => workspace.enabled).map((workspace) => workspace.path);
    const settings = readTypedSettings(config.settings);
    return buildOpenTuiDashboardModel(projects, {
      initialized: config.initialized,
      workspaceCount: enabledWorkspaces.length,
      workspaces: enabledWorkspaces,
      archiveBeforeCleanDays: settings.archiveBeforeCleanDays,
      archiveRoot: getArchiveRoot(context),
      recentActions: actions,
    });
  } finally {
    connection.close();
  }
}

export function filterOpenTuiProjects(projects: Project[], filters: OpenTuiProjectListFilters = {}): Project[] {
  let result = [...projects];
  const query = normalizeSearch(filters.search);

  if (query) {
    result = result.filter((project) => projectMatchesDashboardSearch(project, query));
  }

  if (filters.scannedOnly) {
    result = result.filter((project) => project.lastScannedAt !== null);
  }

  return sortOpenTuiProjects(result, filters.sortMode ?? "name");
}

export async function runOpenTuiDashboard(
  context: OpenTuiDashboardContext,
  options: RunOpenTuiDashboardOptions = {},
): Promise<void> {
  const model = loadOpenTuiDashboardModel(context);
  const initialCpuSample = readCpuSample();
  const state: OpenTuiDashboardState = {
    model,
    view: "dashboard",
    selectedProjectIndex: 0,
    runtimes: [],
    cleanDryRunResult: null,
    cleanApplyArmedProjectId: null,
    optimizePreview: null,
    optimizeApplyResult: null,
    optimizeApplyArmed: false,
    statusMessage: model.initialized ? "Ready. Press ? for keys." : "Configure a workspace to begin.",
    statusKind: "info",
    busy: false,
    lifecycle: "starting",
    animationFrame: 0,
    toasts: [],
    draftArchiveBeforeCleanDays: model.archiveBeforeCleanDays,
    configDirty: false,
    projectSearchQuery: "",
    projectSearchActive: false,
    scannedOnly: false,
    projectSortMode: "name",
    systemStatus: buildInitialSystemStatus(initialCpuSample),
    cpuSample: initialCpuSample,
    systemStatusBusy: false,
  };
  let renderer: CliRenderer | null = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveDone: () => void = () => {};
  let rejectDone: (error: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: false,
      clearOnShutdown: true,
      screenMode: options.demoMs ? "main-screen" : "alternate-screen",
      backgroundColor: colors.background,
      onDestroy: resolveDone,
    });

    const render = () => {
      if (!renderer) return;
      try {
        if (renderer.root.getRenderable("kundol-opentui-dashboard")) {
          renderer.root.remove("kundol-opentui-dashboard");
        }
        clampSelection(state);
        renderer.root.add(renderShell(state));
        renderer.requestRender();
      } catch (error) {
        const message = `OpenTUI render failed; terminal may be too wide or the renderer could not allocate its buffer. ${formatRenderError(error)}`;
        if (!renderer.isDestroyed) renderer.destroy();
        rejectDone(new Error(message));
      }
    };

    const requestClose = () => {
      if (state.lifecycle === "closing") return;
      state.lifecycle = "closing";
      state.statusKind = "info";
      state.statusMessage = "Closing kundol";
      render();
      closeTimer = setTimeout(() => renderer?.destroy(), 220);
    };

    const refreshModel = () => {
      state.model = loadOpenTuiDashboardModel(context);
      if (!state.configDirty) {
        state.draftArchiveBeforeCleanDays = state.model.archiveBeforeCleanDays;
      }
      clampSelection(state);
    };

    const refreshSystemStatus = () => {
      if (state.systemStatusBusy) return;
      state.systemStatusBusy = true;
      void sampleSystemStatus(state)
        .catch(() => undefined)
        .finally(() => {
          state.systemStatusBusy = false;
          render();
        });
    };

    render();
    refreshSystemStatus();
    animationTimer = setInterval(() => {
      state.animationFrame += 1;
      state.toasts = state.toasts
        .map((toast) => ({ ...toast, ttlFrames: toast.ttlFrames - 1 }))
        .filter((toast) => toast.ttlFrames > 0);
      if (state.lifecycle === "starting" && state.animationFrame > 7) {
        state.lifecycle = "ready";
      }
      if (state.labradorDemoUntilFrame !== undefined && state.animationFrame >= state.labradorDemoUntilFrame) {
        finishAction(state);
        delete state.labradorDemoUntilFrame;
        state.statusKind = "info";
        state.statusMessage = "Dashboard.";
      }
      if (state.animationFrame % 25 === 0) {
        refreshSystemStatus();
      }
      render();
    }, 120);

    renderer.keyInput.on("keypress", (key) => {
      if (isLabradorDemoHotkey(key) && state.view === "dashboard" && !state.busy) {
        key.preventDefault();
        startDashboardLabradorDemo(context, state);
        render();
        return;
      }
      if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
        key.preventDefault();
        requestClose();
        return;
      }

      const handled = handleKey(key, context, state, refreshModel, render);
      if (handled) key.preventDefault();
    });

    if (options.demoMs && options.demoMs > 0) {
      timeout = setTimeout(requestClose, options.demoMs);
    }

    await done;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (animationTimer) clearInterval(animationTimer);
    if (closeTimer) clearTimeout(closeTimer);
    if (renderer && !renderer.isDestroyed) {
      renderer.destroy();
    }
  }
}

function handleKey(
  key: DashboardKeyInput,
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  refreshModel: () => void,
  render: () => void,
): boolean {
  const keyName = key.name;
  if (state.busy && keyName !== "q" && keyName !== "escape") return true;

  if (state.projectSearchActive) {
    if (keyName === "return" || keyName === "enter" || keyName === "escape") {
      state.projectSearchActive = false;
      state.statusMessage = `Search set: ${state.projectSearchQuery || "all projects"}.`;
      state.statusKind = "info";
      if (state.projectSearchQuery) {
        recordSessionAudit(context, { action: "TUI_PROJECT_SEARCH" });
      }
      clampSelection(state);
      render();
      return true;
    }
    if (keyName === "backspace" || keyName === "delete") {
      state.projectSearchQuery = state.projectSearchQuery.slice(0, -1);
      clampSelection(state);
      render();
      return true;
    }
    if (isPrintableSearchInput(key)) {
      state.projectSearchQuery += key.sequence;
      state.view = "projects";
      clampSelection(state);
      render();
      return true;
    }
    return true;
  }

  if (keyName === "d") {
    state.view = "dashboard";
    state.statusMessage = "Dashboard.";
    state.statusKind = "info";
    render();
    return true;
  }
  if (keyName === "l" || keyName === "p") {
    state.view = "projects";
    state.statusMessage = "Project list. / search, t scanned, o sort, x clear filters.";
    state.statusKind = "info";
    render();
    return true;
  }
  if (keyName === "/") {
    state.view = "projects";
    state.projectSearchActive = true;
    state.statusMessage = "Search projects. Type query, enter to finish, backspace to edit.";
    state.statusKind = "info";
    render();
    return true;
  }
  if (keyName === "x") {
    state.projectSearchQuery = "";
    state.scannedOnly = false;
    state.projectSortMode = "name";
    state.projectSearchActive = false;
    clampSelection(state);
    state.statusMessage = "Project filters cleared.";
    state.statusKind = "info";
    recordSessionAudit(context, { action: "TUI_PROJECT_FILTER_CLEAR" });
    render();
    return true;
  }
  if (keyName === "t") {
    state.scannedOnly = !state.scannedOnly;
    state.view = "projects";
    clampSelection(state);
    state.statusMessage = state.scannedOnly ? "Showing scanned projects only." : "Showing all indexed projects.";
    state.statusKind = "info";
    recordSessionAudit(context, { action: state.scannedOnly ? "TUI_PROJECT_FILTER_SCANNED" : "TUI_PROJECT_FILTER_ALL" });
    render();
    return true;
  }
  if (keyName === "o") {
    state.projectSortMode = nextProjectSortMode(state.projectSortMode);
    state.view = "projects";
    clampSelection(state);
    state.statusMessage = `Project sort: ${state.projectSortMode}.`;
    state.statusKind = "info";
    recordSessionAudit(context, { action: `TUI_PROJECT_SORT_${state.projectSortMode.toUpperCase()}` });
    render();
    return true;
  }
  if (keyName === "g" || keyName === ",") {
    state.view = "config";
    state.statusMessage = "Config and workspaces.";
    state.statusKind = "info";
    render();
    return true;
  }
  if (keyName === "u") {
    recordSessionAudit(context, { action: "TUI_OPTIMIZE_PREVIEW" });
    void runOptimizePreviewFromTui(context, state, render);
    return true;
  }
  if (keyName === "y" && state.view === "optimize") {
    recordSessionAudit(context, { action: "TUI_OPTIMIZE_APPLY" });
    void runOptimizeApplyFromTui(context, state, refreshModel, render);
    return true;
  }
  if (keyName === "y") {
    const project = selectedProject(state);
    recordSessionAudit(context, { action: "TUI_CLEAN_APPLY", projectName: project?.name ?? null });
    void runCleanApplyFromTui(context, state, refreshModel, render);
    return true;
  }
  if (state.view === "config" && (keyName === "+" || keyName === "=")) {
    state.draftArchiveBeforeCleanDays += 1;
    state.configDirty = true;
    state.statusKind = "info";
    state.statusMessage = "Archive threshold changed. Press v to save.";
    render();
    return true;
  }
  if (state.view === "config" && keyName === "-") {
    state.draftArchiveBeforeCleanDays = Math.max(0, state.draftArchiveBeforeCleanDays - 1);
    state.configDirty = true;
    state.statusKind = "info";
    state.statusMessage = "Archive threshold changed. Press v to save.";
    render();
    return true;
  }
  if (state.view === "config" && keyName === "v") {
    saveDashboardConfig(context, state);
    recordSessionAudit(context, { action: "TUI_CONFIG_UPDATE" });
    refreshModel();
    render();
    return true;
  }
  if (keyName === "r") {
    recordSessionAudit(context, { action: "TUI_RUNTIMES" });
    void runRuntimesFromTui(state, render);
    return true;
  }
  if (keyName === "i") {
    recordSessionAudit(context, { action: "TUI_INDEX" });
    void runIndexFromTui(context, state, refreshModel, render);
    return true;
  }
  if (keyName === "s") {
    const project = selectedProject(state);
    recordSessionAudit(context, { action: "TUI_PROJECT_SCAN", projectName: project?.name ?? null });
    void runScanFromTui(context, state, refreshModel, render);
    return true;
  }
  if (keyName === "c") {
    const project = selectedProject(state);
    recordSessionAudit(context, { action: "TUI_CLEAN_DRY_RUN", projectName: project?.name ?? null });
    void runCleanDryRunFromTui(context, state, render);
    return true;
  }
  if (keyName === "return" || keyName === "enter") {
    if (selectedProject(state)) {
      state.view = "project";
      state.statusMessage = `Project: ${selectedProject(state)?.name}`;
      state.statusKind = "info";
      render();
    }
    return true;
  }
  if (keyName === "up" || keyName === "k") {
    state.selectedProjectIndex = Math.max(0, state.selectedProjectIndex - 1);
    clearCleanApplyArmIfSelectionChanged(state);
    render();
    return true;
  }
  if (keyName === "down" || keyName === "j") {
    const visibleCount = visibleProjects(state).length;
    state.selectedProjectIndex = Math.min(Math.max(0, visibleCount - 1), state.selectedProjectIndex + 1);
    clearCleanApplyArmIfSelectionChanged(state);
    render();
    return true;
  }
  if (keyName === "?") {
    state.statusKind = "info";
    state.statusMessage = "Keys: d dash, l list, u optimize, y apply armed cleanup, / search, t scanned, o sort, enter, i index, s scan, c dry-run, r run, g cfg, q quit.";
    render();
    return true;
  }

  return false;
}

function isLabradorDemoHotkey(key: DashboardKeyInput): boolean {
  return key.name === "q" && (key.ctrl || key.meta === true);
}

function startDashboardLabradorDemo(context: OpenTuiDashboardContext, state: OpenTuiDashboardState): void {
  recordSessionAudit(context, { action: "TUI_LABRADOR_DEMO" });
  state.view = "dashboard";
  state.statusKind = "info";
  state.statusMessage = "Labrador progress demo.";
  startAction(state, "index", "Labrador progress demo");
  state.labradorDemoUntilFrame = state.animationFrame + 50;
}

async function runIndexFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  refreshModel: () => void,
  render: () => void,
): Promise<void> {
  if (state.busy) return;
  if (!state.model.initialized) {
    state.statusKind = "warning";
    state.statusMessage = "Configure a workspace first: kundol init --workspace <path>";
    render();
    return;
  }

  startAction(state, "index", "Indexing configured workspaces");
  state.statusKind = "info";
  render();

  try {
    const result = await runWorkspaceIndex(context);
    refreshModel();
    state.statusKind = result.warnings.length > 0 ? "warning" : "success";
    state.statusMessage = `Indexed ${result.projectsFound} project(s): ${result.newProjects} new, ${result.updatedProjects} updated, ${result.missingProjects} missing.`;
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    setError(state, error);
  } finally {
    finishAction(state);
    render();
  }
}

async function runScanFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  refreshModel: () => void,
  render: () => void,
): Promise<void> {
  const project = selectedProject(state);
  if (!project) {
    state.statusKind = "warning";
    state.statusMessage = "Select a project before scanning.";
    render();
    return;
  }
  if (state.busy) return;

  startAction(state, "scan", `Scanning ${project.name}`);
  state.statusKind = "info";
  render();

  const connection = openKundolDatabase(context);
  try {
    const result = await scanProjectService({ target: project.id, largestLimit: 8 }, createScanRepositories(connection.db));
    refreshModel();
    state.view = "project";
    state.statusKind = result.warnings.length > 0 ? "warning" : "success";
    state.statusMessage = `Scanned ${result.project.name}: ${formatBytes(result.summary.safeCleanupBytes)} safe cleanup across ${result.items.length} item(s).`;
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    setError(state, error);
  } finally {
    connection.close();
    finishAction(state);
    render();
  }
}

async function runCleanDryRunFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  render: () => void,
): Promise<void> {
  const project = selectedProject(state);
  if (!project) {
    state.statusKind = "warning";
    state.statusMessage = "Select a project before cleanup preview.";
    render();
    return;
  }
  if (state.busy) return;

  startAction(state, "clean", `Preparing cleanup dry-run for ${project.name}`);
  state.statusKind = "info";
  render();

  const connection = openKundolDatabase(context);
  try {
    const result = await cleanProjectService(
      { target: project.id, apply: false, archiveBeforeCleanDays: state.model.archiveBeforeCleanDays },
      createScanRepositories(connection.db),
    );
    state.cleanDryRunResult = result;
    state.cleanApplyArmedProjectId = result.items.length > 0 ? project.id : null;
    state.view = "project";
    state.statusKind = result.warnings.length > 0 ? "warning" : "success";
    state.statusMessage = result.items.length > 0
      ? `Dry-run ${result.project.name}: ${result.items.length} safe item(s), ${formatBytes(result.recoverableBytes)} reclaimable. Press y to apply.`
      : `Dry-run ${result.project.name}: no safe cleanup items found.`;
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    state.cleanDryRunResult = null;
    state.cleanApplyArmedProjectId = null;
    setError(state, error);
  } finally {
    connection.close();
    finishAction(state);
    render();
  }
}

async function runCleanApplyFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  refreshModel: () => void,
  render: () => void,
): Promise<void> {
  const project = selectedProject(state);
  if (!project) {
    state.statusKind = "warning";
    state.statusMessage = "Select a project before applying cleanup.";
    render();
    return;
  }
  if (state.busy) return;

  if (state.cleanApplyArmedProjectId !== project.id || !state.cleanDryRunResult) {
    state.statusKind = "warning";
    state.statusMessage = "Run cleanup dry-run first with c, review the result, then press y to apply.";
    render();
    return;
  }

  startAction(state, "clean", `Applying safe cleanup for ${project.name}`);
  state.statusKind = "warning";
  render();

  const connection = openKundolDatabase(context);
  try {
    const result = await cleanProjectService(
      {
        target: project.id,
        apply: true,
        scanId: state.cleanDryRunResult.scan.id,
        archiveBeforeCleanDays: state.model.archiveBeforeCleanDays,
        archiveRoot: state.model.archiveRoot,
      },
      createScanRepositories(connection.db),
    );
    state.cleanDryRunResult = null;
    state.cleanApplyArmedProjectId = null;
    refreshModel();
    state.view = "project";
    state.statusKind = result.warnings.length > 0 ? "warning" : "success";
    state.statusMessage = `Cleaned ${result.project.name}: ${result.deletedItems.length}/${result.items.length} safe item(s), ${formatBytes(result.deletedBytes)} removed.`;
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    setError(state, error);
  } finally {
    connection.close();
    finishAction(state);
    render();
  }
}

async function runOptimizePreviewFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  render: () => void,
): Promise<void> {
  if (state.busy) return;
  state.view = "optimize";
  state.optimizeApplyArmed = false;
  state.optimizeApplyResult = null;
  startAction(state, "optimize", "Preparing storage optimizer dry-run");
  state.statusKind = "info";
  render();

  try {
    state.optimizePreview = await previewStorageOptimization(state.model.projects);
    state.optimizeApplyArmed = state.optimizePreview.safeSelectedCount > 0;
    state.statusKind = state.optimizePreview.safeSelectedCount > 0 ? "warning" : "success";
    state.statusMessage = state.optimizePreview.safeSelectedCount > 0
      ? `Dry-run found ${state.optimizePreview.safeSelectedCount} safe action(s). Press y to apply selected safe cleanup.`
      : "Dry-run complete. No safe cleanup actions selected.";
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    setError(state, error);
  } finally {
    finishAction(state);
    render();
  }
}

async function runOptimizeApplyFromTui(
  context: OpenTuiDashboardContext,
  state: OpenTuiDashboardState,
  refreshModel: () => void,
  render: () => void,
): Promise<void> {
  if (state.busy) return;
  if (!state.optimizePreview || !state.optimizeApplyArmed) {
    state.statusKind = "warning";
    state.statusMessage = "Run optimize dry-run first with u, then press y to apply selected safe cleanup.";
    render();
    return;
  }

  startAction(state, "optimize", "Applying selected safe storage cleanup");
  state.statusKind = "warning";
  render();

  const connection = openKundolDatabase(context);
  try {
    const result = await applyStorageOptimization(connection.db, state.optimizePreview);
    state.optimizeApplyResult = result;
    refreshModel();
    state.optimizePreview = await previewStorageOptimization(state.model.projects);
    state.optimizeApplyArmed = state.optimizePreview.safeSelectedCount > 0;
    state.statusKind = result.failed.length > 0 ? "warning" : "success";
    state.statusMessage = `Optimize apply complete: ${result.applied.length} applied, ${result.failed.length} failed.`;
    pushToast(state, state.statusKind, state.statusMessage);
  } catch (error) {
    setError(state, error);
  } finally {
    connection.close();
    finishAction(state);
    render();
  }
}

async function runRuntimesFromTui(state: OpenTuiDashboardState, render: () => void): Promise<void> {
  if (state.busy) return;
  state.view = "runtimes";
  startAction(state, "runtimes", "Checking local runtimes");
  state.statusKind = "info";
  render();

  try {
    state.runtimes = await detectLocalRuntimes();
    state.statusKind = "success";
    state.statusMessage = "Runtime check complete.";
    pushToast(state, "success", `${state.runtimes.filter((runtime) => runtime.available).length}/${state.runtimes.length} runtimes available.`);
  } catch (error) {
    setError(state, error);
  } finally {
    finishAction(state);
    render();
  }
}

function createScanRepositories(db: import("bun:sqlite").Database) {
  const clock = { now: () => new Date() };
  return {
    db,
    projects: new ProjectRepository(db, clock),
    scans: new ScanRepository(db, clock),
    actions: new ActionRepository(db, clock),
  };
}

async function detectLocalRuntimes(): Promise<RuntimeStatus[]> {
  return Promise.all([
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
}

async function detectTool(name: string, args: string[]): Promise<RuntimeStatus> {
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

function renderShell(state: OpenTuiDashboardState) {
  if (!state.model.initialized) return renderSetupDashboard(state);
  return Box(
    {
      id: "kundol-opentui-dashboard",
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    Box(
      {
      width: safeRenderWidth(),
      height: safeRenderHeight(),
      flexDirection: "column",
      padding: 1,
      gap: 0,
      backgroundColor: colors.background,
    },
    renderHeader(state),
    renderTabs(state),
    renderMain(state),
    renderToastLine(state),
    renderStatusLine(state),
    renderFooterLine(state),
    renderMachineStatusLine(state),
    ),
  );
}

function renderHeader(state: OpenTuiDashboardState) {
  const pulse = state.lifecycle === "ready" ? "" : ` ${dots(state.animationFrame)}`;
  const title = state.lifecycle === "closing"
    ? `kundol${pulse}  Closing cleanly.`
    : `kundol${pulse}  Local-first project radar. Safe cleanup stays preview-first.`;
  return Box(
    {
      border: true,
      borderStyle: "rounded",
      borderColor: colors.border,
      paddingX: 2,
      paddingY: 1,
      height: 4,
      flexDirection: "column",
    },
    Text({ content: title, fg: colors.accent, attributes: 1, truncate: true }),
  );
}

function renderTabs(state: OpenTuiDashboardState) {
  const current = state.view;
  const label = (view: ViewName, text: string) => (current === view ? `[${text}]` : ` ${text} `);
  return Text({
    content: `${label("dashboard", "d dashboard")} ${label("projects", "l projects")} ${label("project", "enter detail")} ${label("optimize", "u optimize")} ${label("runtimes", "r runtimes")} ${label("config", "g config")}`,
    fg: colors.accent,
    truncate: true,
  });
}

function renderMain(state: OpenTuiDashboardState) {
  if (state.view === "projects") return renderProjectsView(state);
  if (state.view === "project") return renderProjectDetailView(state);
  if (state.view === "optimize") return renderOptimizeView(state);
  if (state.view === "runtimes") return renderRuntimesView(state);
  if (state.view === "config") return renderConfigView(state);
  return renderDashboardView(state);
}

function shouldShowLabradorPet(state: OpenTuiDashboardState): state is OpenTuiDashboardState & { activeAction: LabradorAction } {
  return state.busy && (
    state.activeAction === "index" ||
    state.activeAction === "scan" ||
    state.activeAction === "clean" ||
    state.activeAction === "optimize"
  );
}

export function buildLabradorBusyFrame(action: LabradorAction, frame: number): string[] {
  const phase = frame % 6;
  const eye = phase < 3 ? "@" : "o";
  const nose = phase % 2 === 0 ? "o" : "O";
  const tail = phase % 2 === 0 ? "~~~" : "  ~~~";
  const pawLeft = phase % 3 === 0 ? "/ " : " /";
  const pawRight = phase % 3 === 1 ? "\\ " : " \\";
  const scent = phase <= 1 ? " . . ." : phase >= 4 ? "  . ." : "   .";

  return [
    `${workingPetTitle(action)} ${dots(frame)}`,
    workingPetSubtitle(action),
    `tail ${tail}`,
    `    \\          / \\__`,
    `     \\        (  ${eye} \\___`,
    `      \\_______/        ${nose}${scent}`,
    `             /   (_____/`,
    `            /_____/  U`,
    `              ${pawLeft}   ${pawRight}`,
    `safe mode: ${actionSafetyText(action)}`,
  ];
}

function workingPetTitle(action: LabradorAction): string {
  if (action === "index") return "Labrador is sniffing project trails";
  if (action === "scan") return "Labrador is inspecting cleanup clues";
  if (action === "clean") return "Labrador is previewing safe cleanup";
  return "Labrador is optimizing storage";
}

function workingPetSubtitle(action: LabradorAction): string {
  if (action === "index") return "nose down: markers, runtimes, git hints";
  if (action === "scan") return "ears up: safe, review, protected files";
  if (action === "clean") return "eyes alert: dry-run first, no surprises";
  return "head turning: safe actions only";
}

function actionSafetyText(action: LabradorAction): string {
  if (action === "clean") return "dry-run only";
  if (action === "optimize") return "preview before apply";
  if (action === "scan") return "read-only scan";
  return "metadata only";
}

function renderDashboardView(state: OpenTuiDashboardState) {
  const { model } = state;
  return Box(
    { flexDirection: "column", gap: 1, flexGrow: 1 },
    Box(
      { flexDirection: "row", gap: 2, height: 4 },
      metricBox("Projects", String(model.projectCount), colors.accent),
      metricBox("Total size", formatBytes(model.totalSizeBytes), colors.yellow),
      metricBox("Safe cleanup", formatBytes(model.cleanableBytes), colors.green),
      metricBox("Optimize", "press u", colors.accent),
    ),
    Box(
      { flexDirection: "row", gap: 2, flexGrow: 1 },
      Box(
        { flexDirection: "column", gap: 1, width: "26%" },
        panel("Status", statusLines(model.statusCounts), { flexGrow: 1 }),
        renderActivityPetPanel(state),
      ),
      panel(
        `Top space consumers (${model.topProjects.length} of ${model.projectCount})`,
        [
          ...projectSummaryLines(model.topProjects),
          Text({ content: "CLI parity: list --search <q> --scanned --sort cleanable | dashboard keys: / t o", fg: colors.muted, truncate: true }),
        ],
        { flexGrow: 1 },
      ),
      panel("Audit logs", auditLogRows(model.recentActions, 10), { width: "30%" }),
    ),
  );
}

function renderActivityPetPanel(state: OpenTuiDashboardState) {
  const active = shouldShowLabradorPet(state);
  const frame = active
    ? buildLabradorBusyFrame(state.activeAction, state.animationFrame)
    : buildIdleLabradorFrame();
  return Box(
    {
      border: true,
      borderStyle: "rounded",
      borderColor: active ? colors.yellow : colors.border,
      paddingX: 2,
      paddingY: 1,
      height: 14,
      flexDirection: "column",
      gap: 0,
      backgroundColor: colors.panel,
    },
    Text({ content: active ? "Activity pet" : "Activity", fg: active ? colors.yellow : colors.accent, attributes: 1, truncate: true }),
    ...frame.map((line, index) =>
      Text({
        content: line,
        fg: active
          ? index <= 1 ? colors.accent : index === frame.length - 1 ? colors.muted : colors.yellow
          : index === 0 ? colors.muted : colors.text,
        truncate: true,
      }),
    ),
  );
}

function buildIdleLabradorFrame(): string[] {
  return [
    "No active work.",
    "tail  ~~",
    "    \\          / \\__",
    "     \\        (  - \\___",
    "      \\_______/        z",
    "             /   (_____/",
    "            /_____/  U",
    "              /    \\",
    "safe mode: waiting",
  ];
}

function renderOptimizeView(state: OpenTuiDashboardState) {
  const preview = state.optimizePreview;
  if (!preview) {
    return panel(
      "Optimize storage",
      [
        Text({ content: "Press u to run a dry-run preview. No files are changed during preview.", fg: colors.text, truncate: true }),
        Text({ content: "Safe apply may run: project clean, npm verify, pnpm prune, yarn clean, Go cache clean, Docker prune without volumes.", fg: colors.muted, truncate: true }),
        Text({ content: "Review-only: /tmp, ~/Library/Caches, Xcode/simulator caches, Docker volumes, force cache purges.", fg: colors.yellow, truncate: true }),
      ],
      { flexGrow: 1 },
    );
  }

  const safe = preview.candidates.filter((candidate) => candidate.safety === "safe");
  const review = preview.candidates.filter((candidate) => candidate.safety === "review");
  const protectedItems = preview.candidates.filter((candidate) => candidate.safety === "protected");
  const applyResult = state.optimizeApplyResult;
  if (applyResult) {
    return Box(
      { flexDirection: "column", gap: 1, flexGrow: 1 },
      Box(
        { flexDirection: "row", gap: 2, height: 4 },
        metricBox("Applied", String(applyResult.applied.length), colors.green),
        metricBox("Failed", String(applyResult.failed.length), applyResult.failed.length > 0 ? colors.yellow : colors.green),
        metricBox("Skipped", String(applyResult.skipped.length), colors.muted),
        metricBox("Next safe", String(preview.safeSelectedCount), colors.accent),
      ),
      Box(
        { flexDirection: "row", gap: 2, flexGrow: 1 },
        panel(
          "Cleaned this run",
          [
            ...optimizeCandidateLines(applyResult.applied, 7),
            Text({ content: `Summary: ${applyResult.applied.length} applied, ${applyResult.failed.length} failed, ${applyResult.skipped.length} skipped. Press u to refresh preview.`, fg: colors.green, truncate: true }),
          ],
          { flexGrow: 1 },
        ),
        panel(
          applyResult.failed.length > 0 ? "Failed / pending" : "Still pending review",
          [
            ...(applyResult.failed.length > 0 ? optimizeFailureLines(applyResult.failed, 4) : []),
            ...optimizeCandidateLines([...review, ...protectedItems], applyResult.failed.length > 0 ? 3 : 7),
            Text({ content: "Review/protected items were not changed.", fg: colors.muted, truncate: true }),
          ],
          { flexGrow: 1 },
        ),
      ),
    );
  }
  return Box(
    { flexDirection: "column", gap: 1, flexGrow: 1 },
    Box(
      { flexDirection: "row", gap: 2, height: 4 },
      metricBox("Selected safe", String(preview.safeSelectedCount), colors.green),
      metricBox("Known reclaim", formatBytes(preview.knownReclaimableBytes), colors.yellow),
      metricBox("Review", String(preview.reviewCount), colors.yellow),
      metricBox("Protected", String(preview.protectedCount), colors.danger),
    ),
    Box(
      { flexDirection: "row", gap: 2, flexGrow: 1 },
      panel(
        "Will apply after y",
        [
          ...optimizeCandidateLines(safe.filter((candidate) => candidate.defaultSelected), 7),
          Text({ content: "Press y to apply selected safe cleanup. Volumes/tmp/system junk are excluded.", fg: colors.green, truncate: true }),
        ],
        { flexGrow: 1 },
      ),
      panel(
        "Review / protected",
        [
          ...optimizeCandidateLines([...review, ...protectedItems], 7),
          Text({ content: "These are shown for awareness only and are not part of one-click apply.", fg: colors.muted, truncate: true }),
        ],
        { flexGrow: 1 },
      ),
    ),
  );
}

function renderProjectsView(state: OpenTuiDashboardState) {
  const projects = visibleProjects(state);
  const selected = selectedProject(state);
  const lines = state.model.projects.length === 0
    ? [Text({ content: "No projects indexed yet. Press i to index configured workspaces.", fg: colors.muted })]
    : [
        Text({ content: projectFilterText(state, projects.length), fg: state.projectSearchActive ? colors.yellow : colors.muted, truncate: true }),
        ...(selected ? [Text({ content: `Selected: ${selected.name}  Enter details | s scan | c dry-run`, fg: colors.yellow, attributes: 1, truncate: true })] : []),
        ...(projects.length === 0 ? [Text({ content: "No matching projects. Press x to clear filters or edit the search with /.", fg: colors.yellow, truncate: true })] : []),
        ...projects.slice(0, OPENTUI_PROJECT_LIST_LIMIT).map((project, index) => projectListLine(project, index, index === state.selectedProjectIndex)),
        Text({ content: "Keys: / search, t scanned-only, o sort, x clear. CLI: kundol list --scanned --search <query> --sort <field>", fg: colors.muted, truncate: true }),
      ];
  return panel(`Projects (${projects.length} of ${state.model.projectCount})`, lines, { flexGrow: 1 });
}

function renderProjectDetailView(state: OpenTuiDashboardState) {
  const project = selectedProject(state);
  if (!project) {
    return panel("Project", [Text({ content: "No project selected.", fg: colors.muted })], { flexGrow: 1 });
  }
  const cleanApplyArmed = state.cleanApplyArmedProjectId === project.id && state.cleanDryRunResult !== null;
  return panel(
    project.name,
    [
      Text({ content: `Path: ${project.path}`, fg: colors.text, truncate: true }),
      Text({ content: `Status: ${project.status}`, fg: colors.text }),
      Text({ content: `Runtime: ${project.primaryRuntime ?? project.runtimes[0] ?? "unknown"} (${project.runtimes.join(", ") || "none"})`, fg: colors.text }),
      Text({ content: `Size: ${formatBytes(project.sizeBytes)}  Cleanable: ${formatBytes(project.cleanableBytes)}`, fg: colors.text }),
      Text({ content: `Git: ${project.gitBranch ?? "-"} ${project.gitDirty ? "dirty" : "clean"}`, fg: project.gitDirty ? colors.yellow : colors.text }),
      Text({ content: `Last indexed: ${project.lastIndexedAt ?? "-"}`, fg: colors.muted }),
      Text({ content: `Last scanned: ${project.lastScannedAt ?? "-"}`, fg: colors.muted }),
      Text({
        content: cleanApplyArmed
          ? `Actions: y apply last dry-run, c refresh dry-run, s scan. Only safe items are eligible.`
          : `Actions: s scan, c dry-run. After reviewing dry-run, press y to apply safe cleanup.`,
        fg: cleanApplyArmed ? colors.yellow : colors.accent,
        truncate: true,
      }),
      Text({ content: `CLI: show ${project.name} | scan ${project.name} --largest | clean ${project.name}`, fg: colors.muted, truncate: true }),
    ],
    { flexGrow: 1 },
  );
}

function renderRuntimesView(state: OpenTuiDashboardState) {
  const lines = state.runtimes.length === 0
    ? [Text({ content: state.busy ? "Checking runtimes..." : "Press r to check local runtimes.", fg: colors.muted })]
    : [
        ...state.runtimes.slice(0, 7).map((runtime) =>
        Text({
          content: `${runtime.name.padEnd(8)} ${runtime.available ? runtime.version ?? "available" : "missing"}`,
          fg: runtime.available ? colors.text : colors.yellow,
          truncate: true,
        }),
      ),
        Text({ content: "Use `kundol runtimes` for the full server-friendly output.", fg: colors.muted, truncate: true }),
      ];
  return panel("Local runtimes", lines, { flexGrow: 1 });
}

function renderConfigView(state: OpenTuiDashboardState) {
  const workspaceLines = state.model.workspaces.length === 0
    ? [Text({ content: "No workspaces configured.", fg: colors.muted })]
    : state.model.workspaces.map((workspace) => Text({ content: workspace, fg: colors.text, truncate: true }));
  return panel(
    "Config",
    [
      Text({ content: `Workspaces: ${state.model.workspaceCount}`, fg: colors.accent }),
      Text({
        content: `Archive before clean: ${state.draftArchiveBeforeCleanDays} day(s)${state.configDirty ? " unsaved" : ""}`,
        fg: state.configDirty ? colors.yellow : colors.text,
      }),
      ...workspaceLines,
      Text({ content: `Archive root: ${state.model.archiveRoot}`, fg: colors.muted, truncate: true }),
      Text({ content: "Keys: +/- change archive days, v save. CLI: kundol config --archive-before-clean-days <days> | config --json", fg: colors.muted, truncate: true }),
    ],
    { flexGrow: 1 },
  );
}

function renderSetupDashboard(state: OpenTuiDashboardState) {
  return Box(
    {
      id: "kundol-opentui-dashboard",
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
    },
    Box(
      {
      width: safeRenderWidth(),
      height: safeRenderHeight(),
      flexDirection: "column",
      padding: 1,
      gap: 0,
      backgroundColor: colors.background,
    },
    renderHeader(state),
    Box(
      {
        border: true,
        borderStyle: "rounded",
        borderColor: colors.yellow,
        paddingX: 3,
        paddingY: 2,
        flexGrow: 1,
        flexDirection: "column",
        justifyContent: "center",
        gap: 1,
        backgroundColor: colors.panel,
      },
      Text({ content: "Configure kundol", fg: colors.yellow, attributes: 1 }),
      Text({ content: "Choose at least one workspace folder so kundol knows where your projects live.", fg: colors.text, wrapMode: "word" }),
      Text({ content: "Run this from your terminal:", fg: colors.muted }),
      Text({ content: "kundol init --workspace <path>", fg: colors.green, attributes: 1 }),
      Text({ content: "Example: kundol init --workspace ~/Projects", fg: colors.muted }),
      Text({ content: "Server output: kundol dashboard, kundol list --json.", fg: colors.muted }),
    ),
    renderToastLine(state),
    renderStatusLine(state),
    renderFooterLine(state),
    renderMachineStatusLine(state),
    ),
  );
}

function safeRenderWidth(): number {
  const columns = process.stdout.columns;
  if (!columns || columns < 1) return 100;
  return Math.min(columns, OPENTUI_MAX_RENDER_WIDTH);
}

function safeRenderHeight(): number {
  const rows = process.stdout.rows;
  if (!rows || rows < 1) return 36;
  return Math.min(rows, 42);
}

function formatRenderError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function panel(title: string, children: OpenTuiNode[], options: { width?: `${number}%`; flexGrow?: number } = {}) {
  return Box(
    {
      border: true,
      borderStyle: "rounded",
      borderColor: colors.border,
      paddingX: 2,
      paddingY: 1,
      flexDirection: "column",
      gap: 1,
      backgroundColor: colors.panel,
      ...(options.width ? { width: options.width } : {}),
      ...(options.flexGrow ? { flexGrow: options.flexGrow } : {}),
    },
    Text({ content: title, fg: colors.accent, attributes: 1 }),
    ...children,
  );
}

function metricBox(label: string, value: string, fg: string) {
  return Box(
    {
      border: true,
      borderStyle: "rounded",
      borderColor: colors.border,
      paddingX: 2,
      paddingY: 1,
      flexGrow: 1,
      flexDirection: "column",
      gap: 1,
      backgroundColor: colors.panel,
    },
    Text({ content: label, fg: colors.muted }),
    Text({ content: value, fg, attributes: 1 }),
  );
}

function statusLines(statusCounts: Record<string, number>) {
  const entries = Object.entries(statusCounts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return [Text({ content: "No indexed projects yet.", fg: colors.muted })];
  return entries.map(([status, count]) =>
    Text({ content: `${status.padEnd(10)} ${String(count).padStart(3)}`, fg: status === "STALE" ? colors.yellow : colors.text }),
  );
}

function projectSummaryLines(projects: OpenTuiDashboardModel["topProjects"]) {
  if (projects.length === 0) {
    return [Text({ content: "Press i to index configured workspaces.", fg: colors.muted })];
  }
  return projects.map((project) =>
    Text({
      content: `${fit(project.name, 18)} ${fit(project.runtime, 8)} ${fit(project.status, 8)} ${fit(formatBytes(project.sizeBytes), 9)} ${project.gitDirty ? "dirty" : "clean"}`,
      fg: project.cleanableBytes > 0 ? colors.green : colors.text,
      truncate: true,
    }),
  );
}

function optimizeCandidateLines(candidates: OptimizePreview["candidates"], limit: number) {
  if (candidates.length === 0) {
    return [Text({ content: "None.", fg: colors.muted })];
  }
  return candidates.slice(0, limit).map((candidate) =>
    Text({
      content: `${fit(candidate.category, 18)} ${fit(candidate.label, 22)} ${candidate.sizeBytes === null ? "unknown" : formatBytes(candidate.sizeBytes)} | ${candidate.command}`,
      fg: candidate.safety === "safe" ? colors.green : candidate.safety === "review" ? colors.yellow : colors.danger,
      truncate: true,
    }),
  );
}

function optimizeFailureLines(failures: OptimizeApplyResult["failed"], limit: number) {
  return failures.slice(0, limit).map((failure) =>
    Text({
      content: `${fit(failure.candidate.label, 22)} failed: ${failure.error}`,
      fg: colors.yellow,
      truncate: true,
    }),
  );
}

function auditLogRows(actions: ActionLogEntry[], limit: number): OpenTuiNode[] {
  if (actions.length === 0) {
    return [Text({ content: "No saved actions yet.", fg: colors.muted, truncate: true })];
  }

  return actions.slice(0, limit).map((action) =>
    Box(
      { flexDirection: "row", gap: 1, height: 1 },
      Text({
        content: `[${formatAuditTimestamp(action.createdAt)}]`,
        fg: colors.text,
        attributes: 1,
        truncate: true,
      }),
      Text({
        content: `: ${action.actionType}`,
        fg: action.status === "completed" ? colors.accent : colors.yellow,
        truncate: true,
      }),
    ),
  );
}

function formatAuditTimestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return [
      String(parsed.getHours()).padStart(2, "0"),
      String(parsed.getMinutes()).padStart(2, "0"),
      String(parsed.getSeconds()).padStart(2, "0"),
    ].join(":");
  }
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "").slice(-8);
}

function projectListLine(project: Project, index: number, selected: boolean) {
  const runtime = project.primaryRuntime ?? project.runtimes[0] ?? "unknown";
  const marker = selected ? ">> SELECTED" : "           ";
  const cleanable = project.cleanableBytes > 0 ? `clean ${formatBytes(project.cleanableBytes)}` : "clean -";
  const row = `${marker} ${fit(project.name, 20)} ${fit(runtime, 8)} ${fit(project.status, 8)} ${fit(formatBytes(project.sizeBytes), 9)} ${fit(cleanable, 12)} ${project.gitDirty ? "dirty" : "clean"}`;
  return Text({
    content: row,
    fg: selected ? colors.background : project.cleanableBytes > 0 ? colors.green : colors.text,
    ...(selected ? { bg: colors.yellow } : {}),
    attributes: selected ? 1 : 0,
    truncate: true,
  });
}

function selectedProject(state: OpenTuiDashboardState): Project | null {
  return visibleProjects(state)[state.selectedProjectIndex] ?? null;
}

function clearCleanApplyArmIfSelectionChanged(state: OpenTuiDashboardState): void {
  const project = selectedProject(state);
  if (!project || state.cleanApplyArmedProjectId !== project.id) {
    state.cleanDryRunResult = null;
    state.cleanApplyArmedProjectId = null;
  }
}

function visibleProjects(state: OpenTuiDashboardState): Project[] {
  return filterOpenTuiProjects(state.model.projects, {
    search: state.projectSearchQuery,
    scannedOnly: state.scannedOnly,
    sortMode: state.projectSortMode,
  });
}

function projectFilterText(state: OpenTuiDashboardState, visibleCount: number): string {
  const searchLabel = state.projectSearchQuery ? `"${state.projectSearchQuery}"` : "all";
  const scannedLabel = state.scannedOnly ? "scanned only" : "all indexed";
  const cursor = state.projectSearchActive ? "_" : "";
  return `Filter: ${searchLabel}${cursor} | ${scannedLabel} | sort ${state.projectSortMode} | ${visibleCount} match(es)`;
}

function projectMatchesDashboardSearch(project: Project, query: string): boolean {
  const values = [
    project.id,
    project.name,
    project.path,
    project.primaryRuntime ?? "",
    ...project.runtimes,
    project.status,
    project.gitRemoteUrl ?? "",
    project.gitBranch ?? "",
    project.notes ?? "",
  ];
  return values.some((value) => normalizeSearch(value).includes(query));
}

function sortOpenTuiProjects(projects: Project[], sortMode: OpenTuiProjectSortMode): Project[] {
  return [...projects].sort((left, right) => {
    if (sortMode === "size") return right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name);
    if (sortMode === "cleanable") return right.cleanableBytes - left.cleanableBytes || left.name.localeCompare(right.name);
    if (sortMode === "lastScanned") return (right.lastScannedAt ?? "").localeCompare(left.lastScannedAt ?? "") || left.name.localeCompare(right.name);
    return left.name.localeCompare(right.name);
  });
}

function nextProjectSortMode(sortMode: OpenTuiProjectSortMode): OpenTuiProjectSortMode {
  if (sortMode === "name") return "size";
  if (sortMode === "size") return "cleanable";
  if (sortMode === "cleanable") return "lastScanned";
  return "name";
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isPrintableSearchInput(key: DashboardKeyInput): boolean {
  return !key.ctrl && key.sequence.length === 1 && key.sequence >= " " && key.sequence !== "\u007f";
}

function startAction(state: OpenTuiDashboardState, action: TuiAction, message: string): void {
  state.busy = true;
  state.activeAction = action;
  state.statusMessage = message;
}

function finishAction(state: OpenTuiDashboardState): void {
  state.busy = false;
  delete state.activeAction;
}

function pushToast(state: OpenTuiDashboardState, kind: StatusKind, message: string): void {
  state.toasts = [
    {
      id: `${Date.now()}-${state.animationFrame}`,
      kind,
      message,
      ttlFrames: 34,
    },
    ...state.toasts,
  ].slice(0, 3);
}

function saveDashboardConfig(context: OpenTuiDashboardContext, state: OpenTuiDashboardState): void {
  saveKundolConfig(
    { settings: { [archiveBeforeCleanDaysKey]: state.draftArchiveBeforeCleanDays } },
    context,
  );
  state.configDirty = false;
  state.model.archiveBeforeCleanDays = state.draftArchiveBeforeCleanDays;
  state.statusKind = "success";
  state.statusMessage = `Saved archive threshold: ${state.draftArchiveBeforeCleanDays} day(s).`;
  pushToast(state, "success", state.statusMessage);
}

function clampSelection(state: OpenTuiDashboardState): void {
  const projects = visibleProjects(state);
  if (projects.length === 0) {
    state.selectedProjectIndex = 0;
    return;
  }
  state.selectedProjectIndex = Math.max(0, Math.min(projects.length - 1, state.selectedProjectIndex));
}

function setError(state: OpenTuiDashboardState, error: unknown): void {
  state.statusKind = "error";
  state.statusMessage = error instanceof Error ? error.message : String(error);
  pushToast(state, "error", state.statusMessage);
}

function footerText(state: OpenTuiDashboardState): string {
  if (state.lifecycle === "closing") return "closing...";
  if (!state.model.initialized) return "q/esc quit  |  run init in another terminal, then reopen kundol";
  if (state.busy) return "q/esc quit  |  working...";
  return "q/esc quit | d dash | u optimize | y apply | l list | / search | i index | s scan | c dry-run | r run | g cfg";
}

function renderToastLine(state: OpenTuiDashboardState) {
  const toast = state.toasts[0];
  return Box(
    { width: "100%", height: 1, backgroundColor: colors.background },
    Text({
      content: toast ? `toast ${toastIcon(toast.kind)} ${toast.message}` : "",
      fg: toast ? statusColor(toast.kind) : colors.muted,
      truncate: true,
    }),
  );
}

function renderStatusLine(state: OpenTuiDashboardState) {
  return Box(
    { width: "100%", height: 1, backgroundColor: colors.background },
    Text({ content: statusText(state), fg: statusColor(state.statusKind), truncate: true }),
  );
}

function renderFooterLine(state: OpenTuiDashboardState) {
  return Box(
    { width: "100%", height: 1, backgroundColor: colors.background },
    Text({ content: footerText(state), fg: colors.muted, truncate: true }),
  );
}

function renderMachineStatusLine(state: OpenTuiDashboardState) {
  return Box(
    { width: "100%", height: 1, backgroundColor: colors.background },
    Text({ content: machineStatusText(state.systemStatus), fg: colors.muted, truncate: true }),
  );
}

async function sampleSystemStatus(state: OpenTuiDashboardState): Promise<void> {
  const cpuSample = readCpuSample();
  const project = selectedProject(state);
  const currentDirectory = project?.path ?? process.cwd();
  const gitBranch = project?.gitBranch ?? await detectGitBranch(currentDirectory);
  const [batteryPercent, docker] = await Promise.all([detectBatteryPercent(), detectDockerStatus()]);

  state.systemStatus = {
    sampledAt: new Date(),
    timeText: formatStatusTime(new Date()),
    machineTag: machineTag(),
    currentDirectory,
    gitBranch,
    memoryPercent: memoryPercent(),
    cpuPercent: cpuPercent(state.cpuSample, cpuSample),
    batteryPercent,
    dockerEngine: docker.engine,
    dockerRunningContainers: docker.runningContainers,
  };
  state.cpuSample = cpuSample;
}

function buildInitialSystemStatus(cpuSample: CpuSample): SystemStatus {
  return {
    sampledAt: new Date(),
    timeText: formatStatusTime(new Date()),
    machineTag: machineTag(),
    currentDirectory: process.cwd(),
    gitBranch: null,
    memoryPercent: memoryPercent(),
    cpuPercent: null,
    batteryPercent: null,
    dockerEngine: "down",
    dockerRunningContainers: null,
  };
}

function machineStatusText(status: SystemStatus): string {
  const width = process.stdout.columns ?? 100;
  const battery = status.batteryPercent === null ? "n/a" : `${status.batteryPercent}%`;
  const cpu = status.cpuPercent === null ? "..." : `${status.cpuPercent}%`;
  const docker = status.dockerEngine === "up"
    ? `up ${status.dockerRunningContainers ?? 0}`
    : "down";

  if (width >= 140) {
    return [
      `🕒 ${status.timeText}`,
      `🏷️ ${fitMiddle(status.machineTag, 16)}`,
      `📁 ${fitMiddle(status.currentDirectory, 42)}`,
      `🌿 ${fitMiddle(status.gitBranch ?? "-", 18)}`,
      `🧠 ${status.memoryPercent}%`,
      `⚙️ ${cpu}`,
      `🔋 ${battery}`,
      `🐳 ${docker}`,
    ].join("   ");
  }

  if (width >= 92) {
    return [
      `🕒 ${status.timeText}`,
      `🏷️ ${fitMiddle(status.machineTag, 10)}`,
      `📁 ${fitMiddle(status.currentDirectory, 22)}`,
      `🌿 ${fitMiddle(status.gitBranch ?? "-", 10)}`,
      `🧠 ${status.memoryPercent}%`,
      `⚙️ ${cpu}`,
      `🔋 ${battery}`,
      `🐳 ${docker.replace("down", "-")}`,
    ].join("  ");
  }

  return [
    `🕒${status.timeText}`,
    `🏷️${fitMiddle(status.machineTag, 8)}`,
    `📁${fitMiddle(status.currentDirectory, 14)}`,
    `🌿${fitMiddle(status.gitBranch ?? "-", 8)}`,
    `🧠${status.memoryPercent}%`,
    `⚙️${cpu}`,
    `🔋${battery}`,
    `🐳${status.dockerEngine === "up" ? status.dockerRunningContainers ?? 0 : "-"}`,
  ].join(" ");
}

function formatStatusTime(date: Date): string {
  const time = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join(":");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteMinutes / 60)).padStart(2, "0")}:${String(absoluteMinutes % 60).padStart(2, "0")}`;
  return `${time}${offset}`;
}

function machineTag(): string {
  return process.env.KUNDOL_MACHINE_TAG ?? process.env.KUNDOL_NODE_TAG ?? hostname();
}

function memoryPercent(): number {
  return Math.max(0, Math.min(100, Math.round(((totalmem() - freemem()) / totalmem()) * 100)));
}

function readCpuSample(): CpuSample {
  let idleMs = 0;
  let totalMs = 0;
  for (const cpu of cpus()) {
    idleMs += cpu.times.idle;
    totalMs += Object.values(cpu.times).reduce((total, value) => total + value, 0);
  }
  return { idleMs, totalMs };
}

function cpuPercent(previous: CpuSample, current: CpuSample): number | null {
  const idleDelta = current.idleMs - previous.idleMs;
  const totalDelta = current.totalMs - previous.totalMs;
  if (totalDelta <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

async function detectGitBranch(cwd: string): Promise<string | null> {
  const result = await runCommand("git", ["branch", "--show-current"], cwd);
  if (result.exitCode !== 0) return null;
  return result.output.trim() || null;
}

async function detectBatteryPercent(): Promise<number | null> {
  if (process.platform === "darwin") {
    const result = await runCommand("pmset", ["-g", "batt"], process.cwd());
    const match = result.output.match(/(\d+)%/);
    return match ? Number(match[1]) : null;
  }

  if (process.platform === "linux") {
    const result = await runCommand("sh", ["-c", "cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -n 1"], process.cwd());
    const parsed = Number(result.output.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function detectDockerStatus(): Promise<{ engine: "up" | "down"; runningContainers: number | null }> {
  const info = await runCommand("docker", ["info", "--format", "{{.ServerVersion}}"], process.cwd());
  if (info.exitCode !== 0) return { engine: "down", runningContainers: null };

  const ps = await runCommand("docker", ["ps", "-q"], process.cwd());
  if (ps.exitCode !== 0) return { engine: "up", runningContainers: null };
  const runningContainers = ps.output.trim() === "" ? 0 : ps.output.trim().split(/\s+/).length;
  return { engine: "up", runningContainers };
}

async function runCommand(command: string, args: string[], cwd: string): Promise<{ exitCode: number; output: string }> {
  try {
    const proc = Bun.spawn([command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, output: `${stdout}${stderr}` };
  } catch (error) {
    return { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
  }
}

function fitMiddle(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 3) return value.slice(0, width);
  const head = Math.ceil((width - 1) / 2);
  const tail = Math.floor((width - 1) / 2);
  return `${value.slice(0, head)}~${value.slice(value.length - tail)}`;
}

function statusText(state: OpenTuiDashboardState): string {
  if (state.lifecycle === "starting") return `Starting kundol ${dots(state.animationFrame)}`;
  if (state.lifecycle === "closing") return `Closing kundol ${dots(state.animationFrame)}`;
  if (!state.busy) return state.statusMessage;
  return `${actionStatusPrefix(state)} ${spinner(state.animationFrame)} ${actionStatusSuffix(state)}`;
}

function actionStatusPrefix(state: OpenTuiDashboardState): string {
  if (state.activeAction === "index") return "Indexing workspaces";
  if (state.activeAction === "scan") return "Scanning project";
  if (state.activeAction === "clean") return "Preparing cleanup preview";
  if (state.activeAction === "optimize") return "Optimizing storage";
  if (state.activeAction === "runtimes") return "Checking runtimes";
  return state.statusMessage;
}

function actionStatusSuffix(state: OpenTuiDashboardState): string {
  if (state.activeAction === "index") return "finding project markers";
  if (state.activeAction === "scan") return "classifying cleanup candidates";
  if (state.activeAction === "clean") return "dry-run only, no files touched";
  if (state.activeAction === "optimize") return "safe apply requires preview";
  if (state.activeAction === "runtimes") return "probing local tools";
  return state.statusMessage;
}

function spinner(frame: number): string {
  return ["|", "/", "-", "\\"][frame % 4] ?? "|";
}

function dots(frame: number): string {
  return ".".repeat((frame % 3) + 1).padEnd(3);
}

function toastIcon(kind: StatusKind): string {
  if (kind === "success") return "ok";
  if (kind === "warning") return "warn";
  if (kind === "error") return "err";
  return "info";
}

function getArchiveRoot(context: OpenTuiDashboardContext): string {
  return `${getKundolHomePath(context)}/archives`;
}

function statusColor(kind: StatusKind): string {
  if (kind === "success") return colors.green;
  if (kind === "warning") return colors.yellow;
  if (kind === "error") return colors.danger;
  return colors.muted;
}

function fit(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}~`;
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
