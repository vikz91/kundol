import { Command } from "commander";
import type { CommandContext } from "../actions";
import { showConfig, updateConfig } from "../actions";
import { applyResult } from "./shared";

export function createConfigCommand(context: CommandContext): Command {
  return new Command("config")
    .description("View kundol configuration stored in the user-scoped SQLite database.")
    .option("--json", "print machine-readable output", false)
    .option("--archive-before-clean-days <days>", "set project archive threshold before clean apply", parseInteger)
    .action((options: { json: boolean; archiveBeforeCleanDays?: number }) => {
      return applyResult(options.archiveBeforeCleanDays === undefined ? showConfig(context, options) : updateConfig(context, options));
    });
}

function parseInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Expected a non-negative integer.");
  }
  return parsed;
}
