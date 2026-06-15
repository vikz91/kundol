import React from "react";
import { Box, Text } from "ink";
import { SizeText } from "../components/size-text";
import { StatusPill } from "../components/status-pill";
import { runtimeLabel, tuiTheme } from "../theme";
import type { TuiProjectSummary } from "../types";

interface ProjectDetailViewProps {
  project?: TuiProjectSummary | undefined;
}

export function ProjectDetailView({ project }: ProjectDetailViewProps) {
  if (!project) {
    return <Text color={tuiTheme.color.muted}>Select a project to inspect it.</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>{project.name}</Text>
      <Text color={tuiTheme.color.muted}>{project.path}</Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Runtime: <Text bold>{runtimeLabel[project.runtime]}</Text>
        </Text>
        <Text>
          Status: <StatusPill status={project.status} />
        </Text>
        <Text>
          Size: <SizeText value={project.size} />
        </Text>
        <Text>
          Recoverable: <SizeText value={project.cleanable ?? "not scanned"} muted={!project.cleanable} />
        </Text>
        <Text color={project.dirty ? tuiTheme.color.warning : tuiTheme.color.ok}>
          Git: {project.dirty ? tuiTheme.symbol.dirty : tuiTheme.symbol.clean}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={tuiTheme.color.muted}>Timestamps</Text>
        <Text>Last indexed: {project.lastIndexed ?? "-"}</Text>
        <Text>Last scanned: {project.lastScanned ?? "-"}</Text>
      </Box>
    </Box>
  );
}
