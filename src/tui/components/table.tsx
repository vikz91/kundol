import React from "react";
import { Box, Text } from "ink";
import { fitCell } from "../format";
import { tuiTheme } from "../theme";

export interface TuiTableColumn<Row> {
  key: string;
  label: string;
  width: number;
  render: (row: Row) => string;
}

interface TuiTableProps<Row> {
  columns: TuiTableColumn<Row>[];
  rows: Row[];
  emptyMessage?: string;
}

export function TuiTable<Row>({ columns, rows, emptyMessage = "No rows" }: TuiTableProps<Row>) {
  if (rows.length === 0) {
    return <Text color={tuiTheme.color.muted}>{emptyMessage}</Text>;
  }

  const header = columns.map((column) => fitCell(column.label, column.width)).join("  ");
  const divider = columns.map((column) => tuiTheme.symbol.divider.repeat(column.width)).join("  ");

  return (
    <Box flexDirection="column">
      <Text color={tuiTheme.color.muted}>{header}</Text>
      <Text color={tuiTheme.color.border}>{divider}</Text>
      {rows.map((row, rowIndex) => (
        <Text key={rowIndex}>
          {columns.map((column) => fitCell(column.render(row), column.width)).join("  ")}
        </Text>
      ))}
    </Box>
  );
}

export const tableTestApi = {
  fitCell,
};
