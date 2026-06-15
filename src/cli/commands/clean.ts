import { Command } from "commander";
import type { CommandContext } from "../actions";
import { cleanProject } from "../actions";
import { applyResult } from "./shared";

export function createCleanCommand(context: CommandContext): Command {
  return new Command("clean")
    .description("Preview or apply safe generated-file cleanup for one project.")
    .argument("<project>", "project name, stable id, or path")
    .option("--dry-run", "preview cleanup without deleting files", true)
    .option("--apply", "execute cleanup for safe generated files only", false)
    .option("--only <kind>", "limit cleanup preview/apply to one generated artifact kind")
    .action((project: string, options: { dryRun: boolean; apply: boolean; only?: string }) => {
      applyResult(cleanProject(context, project, options));
    });
}
