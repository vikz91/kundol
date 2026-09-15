import { Command } from "commander";
import type { CommandContext } from "../actions";
import { optimiseProjects, optimiseStorage } from "../actions";
import { applyResult } from "./shared";

export function createOptimiseCommand(context: CommandContext): Command {
  const optimise = new Command("optimise")
    .description("Scan, confirm, and clean storage or project targets.")
    .addHelpText(
      "after",
      [
        "",
        "Available tools:",
        "  storage             published owner-tool cache maintenance rules",
        "  projects <workdir>  generated/dependency artifacts under nested projects",
        "  repos <workdir>     generated-artifact cleanup in a workdir",
        "",
        "All tools scan first, ask for confirmation, then clean. Use -f to skip the prompt.",
      ].join("\n"),
    );

  optimise
    .command("storage")
    .description("Review and run published owner-tool storage cache rules.")
    .option("-f, --force", "skip confirmation after scanning", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise storage",
        "  kundol optimise storage -f",
      ].join("\n"),
    )
    .action((options: { force: boolean }) => {
      return applyResult(optimiseStorage(context, options));
    });

  optimise
    .command("projects")
    .description("Clean project-local dependency folders and generated build output.")
    .argument("<workdir>", "workspace directory to scan")
    .option("-f, --force", "skip confirmation after scanning", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise projects ~/Projects",
        "  kundol optimise projects ~/Projects -f",
      ].join("\n"),
    )
    .action((workdir: string, options: { force: boolean }) => {
      return applyResult(optimiseProjects(context, workdir, options));
    });

  optimise
    .command("repos")
    .description("Clean generated targets under a supplied workdir.")
    .argument("<workdir>", "workspace directory to scan")
    .option("-f, --force", "skip confirmation after scanning", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise repos ~/Projects",
        "  kundol optimise repos ~/Projects -f",
      ].join("\n"),
    )
    .action((workdir: string, options: { force: boolean }) => {
      return applyResult(optimiseProjects(context, workdir, options));
    });

  return optimise;
}
