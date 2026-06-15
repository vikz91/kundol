import type { TuiDashboardData, TuiModel, TuiScanSummary } from "./types";

export const emptyTuiModel: TuiModel = {
  activeView: "dashboard",
  loadState: "empty",
  message: "No projects indexed yet.",
};

export const loadingTuiModel: TuiModel = {
  activeView: "dashboard",
  loadState: "loading",
  message: "Loading kundol workspace registry...",
};

export const demoDashboardData: TuiDashboardData = {
  metrics: [
    { label: "Projects", value: "0", hint: "indexed" },
    { label: "Active", value: "0" },
    { label: "Recoverable", value: "0 B" },
    { label: "Largest", value: "-" },
  ],
  projects: [],
  runtimes: [],
  suggestedActions: ["Run kundol index", "Add a workspace", "Open config"],
};

export const demoScanSummary: TuiScanSummary = {
  projectName: "No project selected",
  projectPath: "-",
  cleanable: "0 B",
  items: [],
  recommendations: ["Choose a project, then run scan."],
};
