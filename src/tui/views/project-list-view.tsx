import React from "react";
import { Box, Text } from "ink";
import { TuiTable } from "../components/table";
import { runtimeLabel, tuiTheme } from "../theme";
import type { TuiProjectSummary } from "../types";

interface ProjectListViewProps {
  projects: TuiProjectSummary[];
}

const columns = [
  {
    key: "name",
    label: "Project",
    width: 24,
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
    key: "git",
    label: "Git",
    width: 7,
    render: (project: TuiProjectSummary) => (project.dirty ? "dirty" : "clean"),
  },
  {
    key: "path",
    label: "Path",
    width: 38,
    render: (project: TuiProjectSummary) => project.path,
  },
];

export function ProjectListView({ projects }: ProjectListViewProps) {
  return (
    <Box flexDirection="column">
      <Text color={tuiTheme.color.muted}>Indexed projects</Text>
      <TuiTable columns={columns} rows={projects} emptyMessage="No projects match the current view" />
    </Box>
  );
}
