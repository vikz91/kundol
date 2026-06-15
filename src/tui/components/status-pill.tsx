import React from "react";
import { Text } from "ink";
import { statusTone, tuiTheme } from "../theme";
import type { ProjectLifecycleStatus } from "../types";

interface StatusPillProps {
  status: ProjectLifecycleStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <Text color={tuiTheme.color[statusTone[status]]} bold>
      {status}
    </Text>
  );
}
