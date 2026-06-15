import React from "react";
import { Box, Text } from "ink";
import { TuiTable } from "../components/table";
import { tuiTheme } from "../theme";
import type { TuiScanItem, TuiScanSummary } from "../types";

interface ProjectScanViewProps {
  scan: TuiScanSummary;
}

const itemColumns = [
  {
    key: "class",
    label: "Class",
    width: 10,
    render: (item: TuiScanItem) => item.classification.toUpperCase(),
  },
  {
    key: "size",
    label: "Size",
    width: 9,
    render: (item: TuiScanItem) => item.size,
  },
  {
    key: "path",
    label: "Path",
    width: 34,
    render: (item: TuiScanItem) => item.path,
  },
  {
    key: "reason",
    label: "Reason",
    width: 32,
    render: (item: TuiScanItem) => item.reason,
  },
];

export function ProjectScanView({ scan }: ProjectScanViewProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{scan.projectName}</Text>
      <Text color={tuiTheme.color.muted}>{scan.projectPath}</Text>
      <Text>
        Recoverable: <Text color={tuiTheme.color.ok}>{scan.cleanable}</Text>
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text color={tuiTheme.color.muted}>Cleanup candidates</Text>
        <TuiTable columns={itemColumns} rows={scan.items} emptyMessage="No cleanup candidates from the latest scan" />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={tuiTheme.color.muted}>Recommendations</Text>
        {scan.recommendations.map((recommendation) => (
          <Text key={recommendation}>
            <Text color={tuiTheme.color.muted}>{tuiTheme.symbol.bullet} </Text>
            {recommendation}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
