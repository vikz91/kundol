import React from "react";
import { Box, Text } from "ink";
import { MetricStrip } from "../components/metric-strip";
import { TuiTable } from "../components/table";
import { runtimeLabel, tuiTheme } from "../theme";
import type { TuiDashboardData, TuiProjectSummary } from "../types";

interface DashboardViewProps {
  data: TuiDashboardData;
}

const projectColumns = [
  {
    key: "name",
    label: "Project",
    width: 22,
    render: (project: TuiProjectSummary) => project.name,
  },
  {
    key: "runtime",
    label: "Runtime",
    width: 10,
    render: (project: TuiProjectSummary) => runtimeLabel[project.runtime],
  },
  {
    key: "status",
    label: "Status",
    width: 9,
    render: (project: TuiProjectSummary) => project.status,
  },
  {
    key: "size",
    label: "Size",
    width: 9,
    render: (project: TuiProjectSummary) => project.size,
  },
  {
    key: "cleanable",
    label: "Cleanable",
    width: 10,
    render: (project: TuiProjectSummary) => project.cleanable ?? "-",
  },
];

export function DashboardView({ data }: DashboardViewProps) {
  return (
    <Box flexDirection="column">
      <MetricStrip metrics={data.metrics} />

      <Box flexDirection="column" marginTop={1}>
        <Text color={tuiTheme.color.muted}>Largest projects</Text>
        <TuiTable columns={projectColumns} rows={data.projects.slice(0, 5)} emptyMessage="No projects indexed yet" />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={tuiTheme.color.muted}>Suggested next actions</Text>
        {data.suggestedActions.map((action) => (
          <Text key={action}>
            <Text color={tuiTheme.color.muted}>{tuiTheme.symbol.bullet} </Text>
            {action}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
