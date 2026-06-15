import React from "react";
import { Text } from "ink";
import { tuiTheme } from "../theme";

interface SizeTextProps {
  value: string;
  muted?: boolean;
}

export function SizeText({ value, muted = false }: SizeTextProps) {
  return <Text color={muted ? tuiTheme.color.muted : tuiTheme.color.text}>{value}</Text>;
}
