import React from "react";
import { Box, Text } from "ink";
import { tuiTheme } from "../theme";

interface SettingsViewProps {
  workspaces?: string[];
  excludedPaths?: string[];
}

export function SettingsView({ workspaces = [], excludedPaths = [] }: SettingsViewProps) {
  return (
    <Box flexDirection="column">
      <Text color={tuiTheme.color.muted}>Workspaces</Text>
      {workspaces.length === 0 ? (
        <Text>No workspaces configured.</Text>
      ) : (
        workspaces.map((workspace) => <Text key={workspace}>{workspace}</Text>)
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text color={tuiTheme.color.muted}>Excluded project/workspace paths</Text>
        {excludedPaths.length === 0 ? (
          <Text>No excluded paths configured.</Text>
        ) : (
          excludedPaths.map((path) => <Text key={path}>{path}</Text>)
        )}
      </Box>
    </Box>
  );
}
