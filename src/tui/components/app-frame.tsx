import React from "react";
import { Box, Text } from "ink";
import { keymapHelp } from "../keymap";
import { tuiTheme } from "../theme";
import type { TuiView } from "../types";

interface AppFrameProps {
  activeView: TuiView;
  children: React.ReactNode;
}

const viewTitle: Record<TuiView, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  "project-detail": "Project Detail",
  "project-scan": "Project Scan",
  runtimes: "Runtimes",
  settings: "Settings",
};

export function AppFrame({ activeView, children }: AppFrameProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={tuiTheme.color.title} bold>
          {tuiTheme.symbol.app}
        </Text>
        <Text color={tuiTheme.color.muted}>{viewTitle[activeView]}</Text>
      </Box>

      <Box marginY={1}>{children}</Box>

      <Box marginTop={1}>
        <Text color={tuiTheme.color.muted}>
          {keymapHelp.map((item) => `${item.key} ${item.label}`).join("  ")}
        </Text>
      </Box>
    </Box>
  );
}
