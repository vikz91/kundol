import { Command } from "commander";
import type { CommandContext } from "../actions";
import { showRuntimes } from "../actions";
import { applyResult } from "./shared";

export function createRuntimesCommand(context: CommandContext): Command {
  return new Command("runtimes")
    .description("Show local runtime and toolchain status.")
    .option("--json", "print machine-readable output", false)
    .action((options: { json: boolean }) => {
      applyResult(showRuntimes(context, options));
    });
}
