import { Command } from "commander";
import type { CommandContext } from "../actions";
import { showProject } from "../actions";
import { applyResult } from "./shared";

export function createShowCommand(context: CommandContext): Command {
  return new Command("show")
    .description("Show one indexed project by name, id, or path.")
    .argument("<project>", "project name, stable id, or path")
    .option("--json", "print machine-readable output", false)
    .action((project: string, options: { json: boolean }) => {
      return applyResult(showProject(context, project, options));
    });
}
