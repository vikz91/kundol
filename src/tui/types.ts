export type TuiView =
  | "dashboard"
  | "projects"
  | "project-detail"
  | "project-scan"
  | "runtimes"
  | "settings";

export type LoadState = "loading" | "ready" | "empty" | "error";

export type ProjectLifecycleStatus =
  | "NEW"
  | "ACTIVE"
  | "PAUSED"
  | "STALE"
  | "ARCHIVED"
  | "DELETED"
  | "UNKNOWN";

export type RuntimeFamily =
  | "node"
  | "bun"
  | "deno"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "dotnet"
  | "mixed"
  | "git"
  | "unknown";

export interface TuiMetric {
  label: string;
  value: string;
  hint?: string;
}

export interface TuiProjectSummary {
  id: string;
  name: string;
  path: string;
  runtime: RuntimeFamily;
  status: ProjectLifecycleStatus;
  size: string;
  cleanable?: string;
  lastIndexed?: string;
  lastScanned?: string;
  dirty?: boolean;
}

export interface TuiRuntimeSummary {
  runtime: RuntimeFamily;
  projects: number;
  installedVersion?: string;
  latestVersion?: string;
  status: "ok" | "missing" | "outdated" | "unknown";
}

export interface TuiScanItem {
  path: string;
  size: string;
  classification: "safe" | "caution" | "protected";
  reason: string;
}

export interface TuiScanSummary {
  projectName: string;
  projectPath: string;
  cleanable: string;
  lastScanned?: string;
  items: TuiScanItem[];
  recommendations: string[];
}

export interface TuiDashboardData {
  metrics: TuiMetric[];
  projects: TuiProjectSummary[];
  runtimes: TuiRuntimeSummary[];
  suggestedActions: string[];
}

export interface TuiModel {
  activeView: TuiView;
  loadState: LoadState;
  message?: string;
  dashboard?: TuiDashboardData;
  selectedProject?: TuiProjectSummary;
  scan?: TuiScanSummary;
  runtimes?: TuiRuntimeSummary[];
}

export interface TuiActionIntent {
  type:
    | "open-dashboard"
    | "open-projects"
    | "open-project-detail"
    | "open-project-scan"
    | "open-runtimes"
    | "open-settings"
    | "quit"
    | "refresh"
    | "start-index"
    | "start-project-scan";
  projectId?: string;
}
