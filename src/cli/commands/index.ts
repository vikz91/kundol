import { Command } from "commander";
import type { CommandContext } from "../actions";
import { indexWorkspaces } from "../actions";
import { applyResult } from "./shared";

export function createIndexCommand(context: CommandContext): Command {
  return new Command("index")
    .description("Index configured workspaces and update the project registry metadata.")
    .option("-w, --workspace <path>", "index one workspace path without changing saved config")
    .option("--all", "index all configured workspaces", true)
    .option("--json", "print machine-readable output", false)
    .action((options: { workspace?: string; all: boolean; json: boolean }) => {
      applyResult(indexWorkspaces(context, options));
    });
}
