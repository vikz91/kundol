import React from "react";
import { Box, Text } from "ink";
import { TuiTable } from "../components/table";
import { runtimeLabel, tuiTheme } from "../theme";
import type { TuiRuntimeSummary } from "../types";

interface RuntimeAuditViewProps {
  runtimes: TuiRuntimeSummary[];
}

const columns = [
  {
    key: "runtime",
    label: "Runtime",
    width: 12,
    render: (runtime: TuiRuntimeSummary) => runtimeLabel[runtime.runtime],
  },
  {
    key: "projects",
    label: "Projects",
    width: 8,
    render: (runtime: TuiRuntimeSummary) => String(runtime.projects),
  },
  {
    key: "installed",
    label: "Installed",
    width: 14,
    render: (runtime: TuiRuntimeSummary) => runtime.installedVersion ?? "-",
  },
  {
    key: "latest",
    label: "Latest",
    width: 14,
    render: (runtime: TuiRuntimeSummary) => runtime.latestVersion ?? "-",
  },
  {
    key: "status",
    label: "Status",
    width: 9,
    render: (runtime: TuiRuntimeSummary) => runtime.status.toUpperCase(),
  },
];

export function RuntimeAuditView({ runtimes }: RuntimeAuditViewProps) {
  return (
    <Box flexDirection="column">
      <Text color={tuiTheme.color.muted}>Runtime audit</Text>
      <TuiTable columns={columns} rows={runtimes} emptyMessage="No runtime audit data yet" />
    </Box>
  );
}
