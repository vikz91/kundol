import React from "react";
import { useInput } from "ink";
import { AppFrame } from "./components/app-frame";
import { EmptyState, ErrorState, LoadingState } from "./components/state-block";
import { demoDashboardData, demoScanSummary } from "./fixtures";
import { matchesKey, tuiKeymap } from "./keymap";
import {
  DashboardView,
  ProjectDetailView,
  ProjectListView,
  ProjectScanView,
  RuntimeAuditView,
  SettingsView,
} from "./views";
import type { TuiActionIntent, TuiModel } from "./types";

interface KundolTuiAppProps {
  model: TuiModel;
  onIntent?: (intent: TuiActionIntent) => void;
}

function intentForInput(input: string): TuiActionIntent | undefined {
  if (matchesKey(input, tuiKeymap.dashboard)) {
    return { type: "open-dashboard" };
  }

  if (matchesKey(input, tuiKeymap.projects)) {
    return { type: "open-projects" };
  }

  if (matchesKey(input, tuiKeymap.runtimes)) {
    return { type: "open-runtimes" };
  }

  if (matchesKey(input, tuiKeymap.settings)) {
    return { type: "open-settings" };
  }

  if (matchesKey(input, tuiKeymap.refresh)) {
    return { type: "refresh" };
  }

  if (matchesKey(input, tuiKeymap.index)) {
    return { type: "start-index" };
  }

  if (matchesKey(input, tuiKeymap.scan)) {
    return { type: "start-project-scan" };
  }

  if (matchesKey(input, tuiKeymap.quit)) {
    return { type: "quit" };
  }

  return undefined;
}

export function KundolTuiApp({ model, onIntent }: KundolTuiAppProps) {
  useInput((input) => {
    const intent = intentForInput(input);

    if (intent) {
      onIntent?.(intent);
    }
  });

  return (
    <AppFrame activeView={model.activeView}>
      {model.loadState === "loading" ? <LoadingState message={model.message} /> : null}
      {model.loadState === "empty" ? <EmptyState message={model.message} /> : null}
      {model.loadState === "error" ? <ErrorState message={model.message} /> : null}
      {model.loadState === "ready" && model.activeView === "dashboard" ? (
        <DashboardView data={model.dashboard ?? demoDashboardData} />
      ) : null}
      {model.loadState === "ready" && model.activeView === "projects" ? (
        <ProjectListView projects={model.dashboard?.projects ?? []} />
      ) : null}
      {model.loadState === "ready" && model.activeView === "project-detail" ? (
        <ProjectDetailView project={model.selectedProject} />
      ) : null}
      {model.loadState === "ready" && model.activeView === "project-scan" ? (
        <ProjectScanView scan={model.scan ?? demoScanSummary} />
      ) : null}
      {model.loadState === "ready" && model.activeView === "runtimes" ? (
        <RuntimeAuditView runtimes={model.runtimes ?? model.dashboard?.runtimes ?? []} />
      ) : null}
      {model.loadState === "ready" && model.activeView === "settings" ? <SettingsView /> : null}
    </AppFrame>
  );
}

export const appTestApi = {
  intentForInput,
};
