import { Command } from "commander";
import type { CommandContext } from "../actions";
import { showConfig } from "../actions";
import { applyResult } from "./shared";

export function createConfigCommand(context: CommandContext): Command {
  return new Command("config")
    .description("View kundol configuration stored in the user-scoped SQLite database.")
    .option("--json", "print machine-readable output", false)
    .action((options: { json: boolean }) => {
      applyResult(showConfig(context, options));
    });
}
