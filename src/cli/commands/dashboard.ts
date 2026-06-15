import { Command } from "commander";
import type { CommandContext } from "../actions";
import { showDashboard } from "../actions";
import { applyResult } from "./shared";

export function createDashboardCommand(context: CommandContext): Command {
  return new Command("dashboard")
    .description("Print a non-interactive summary of projects, disk usage, and recommendations.")
    .option("--json", "print machine-readable output", false)
    .action((options: { json: boolean }) => {
      applyResult(showDashboard(context, options));
    });
}
