import { Command } from "commander";
import type { CommandContext } from "../actions";
import { optimizeStorage } from "../actions";
import { applyResult } from "./shared";

export function createOptimizeCommand(context: CommandContext): Command {
  return new Command("optimize")
    .alias("optimise")
    .description("Preview or apply one-click safe storage optimization.")
    .option("--dry-run", "preview optimization without deleting files", true)
    .option("--no-dry-run", "allow --apply to execute selected safe optimization")
    .option("--apply", "execute selected safe optimization", false)
    .option("--json", "print JSON output", false)
    .action((options: { dryRun: boolean; apply: boolean; json: boolean }) => {
      return applyResult(optimizeStorage(context, options));
    });
}
