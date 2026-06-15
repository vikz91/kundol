import { Command } from "commander";
import type { CommandContext } from "../actions";
import { initProject } from "../actions";
import { applyResult } from "./shared";

export function createInitCommand(context: CommandContext): Command {
  return new Command("init")
    .description("Set up kundol config and database, then optionally run the first index.")
    .option("-w, --workspace <path>", "workspace root to save; repeat for multiple roots", collect, [])
    .option("--no-index", "skip the first index after setup")
    .action((options: { workspace: string[]; index: boolean }) => {
      return applyResult(initProject(context, options));
    });
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
