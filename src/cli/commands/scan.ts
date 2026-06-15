import { Command } from "commander";
import type { CommandContext } from "../actions";
import { scanProject } from "../actions";
import { applyResult } from "./shared";

export function createScanCommand(context: CommandContext): Command {
  return new Command("scan")
    .description("Deep scan one project for cleanup opportunities and recommendations.")
    .argument("<project>", "project name, stable id, or path")
    .option("--json", "print machine-readable output", false)
    .option("--largest", "include largest detected project items", false)
    .action((project: string, options: { json: boolean; largest: boolean }) => {
      applyResult(scanProject(context, project, options));
    });
}
