import React from "react";
import { Box, Text } from "ink";
import { tuiTheme } from "../theme";
import type { TuiMetric } from "../types";

interface MetricStripProps {
  metrics: TuiMetric[];
}

export function MetricStrip({ metrics }: MetricStripProps) {
  return (
    <Box gap={2} flexWrap="wrap">
      {metrics.map((metric) => (
        <Box key={metric.label} flexDirection="column" marginRight={2}>
          <Text color={tuiTheme.color.muted}>{metric.label}</Text>
          <Text bold>{metric.value}</Text>
          {metric.hint ? <Text color={tuiTheme.color.muted}>{metric.hint}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}
