import { Command } from "commander";
import type { CommandContext } from "../actions";
import { optimiseAll, optimiseDocker, optimiseProjects, optimiseStorage } from "../actions";
import { applyResult } from "./shared";

export function createOptimiseCommand(context: CommandContext): Command {
  const optimise = new Command("optimise")
    .description("Scan, confirm, and clean storage or project targets.")
    .addHelpText(
      "after",
      [
        "",
        "Available tools:",
        "  all                 one plan across explicit storage, project, Docker, and system scopes",
        "  storage             published owner-tool cache maintenance rules",
        "  projects <workdir>  generated/dependency artifacts under nested projects",
        "  repos <workdir>     generated-artifact cleanup in a workdir",
        "  docker <context>    protected inventory and reviewed Docker resources in an explicit context",
        "",
        "All tools scan first, ask for confirmation, then clean. Use --allow-beta to opt in to code-approved beta rules; -f selects safe suggestions only.",
      ].join("\n"),
    );

  optimise.action(() => {
    optimise.outputHelp();
  });

  optimise
    .command("all")
    .description("Create one review plan across every explicitly supplied optimisation scope.")
    .requiredOption("--workdir <path>", "workspace directory for project and repository rules")
    .requiredOption("--docker-context <name>", "named Docker context to pin for Docker rules")
    .option("-f, --force", "skip confirmation and select only safe targets", false)
    .option("--allow-beta", "attempt beta rules in every scope and report unavailable handlers", false)
    .addHelpText(
      "after",
      [
        "",
        "Example:",
        "  kundol optimise all --workdir ~/Projects --docker-context my-context --allow-beta",
        "",
        "Both scopes are required; Kundol never guesses a workdir or Docker context.",
      ].join("\n"),
    )
    .action((options: { workdir: string; dockerContext: string; force: boolean; allowBeta: boolean }) => {
      return applyResult(optimiseAll(context, options));
    });

  optimise
    .command("storage")
    .description("Review and run published owner-tool storage cache rules.")
    .option("-f, --force", "skip confirmation after scanning", false)
    .option("--allow-beta", "include code-approved beta owner-tool rules", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise storage",
        "  kundol optimise storage -f",
        "  kundol optimise storage --allow-beta",
      ].join("\n"),
    )
    .action((options: { force: boolean; allowBeta: boolean }) => {
      return applyResult(optimiseStorage(context, options));
    });

  optimise
    .command("projects")
    .description("Clean project-local dependency folders and generated build output.")
    .argument("<workdir>", "workspace directory to scan")
    .option("-f, --force", "skip confirmation after scanning", false)
    .option("--allow-beta", "include code-approved beta project rules", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise projects ~/Projects",
        "  kundol optimise projects ~/Projects -f",
        "  kundol optimise projects ~/Projects --allow-beta",
      ].join("\n"),
    )
    .action((workdir: string, options: { force: boolean; allowBeta: boolean }) => {
      return applyResult(optimiseProjects(context, workdir, options));
    });

  optimise
    .command("docker")
    .description("Review published resources in one explicitly selected Docker context.")
    .argument("<context>", "named Docker context to scan")
    .option("--allow-beta", "include code-approved beta protected inventories", false)
    .action((contextName: string, options: { allowBeta: boolean }) => applyResult(optimiseDocker(context, contextName, options)));

  optimise
    .command("repos")
    .description("Clean generated targets under a supplied workdir.")
    .argument("<workdir>", "workspace directory to scan")
    .option("-f, --force", "skip confirmation after scanning", false)
    .option("--allow-beta", "include code-approved beta project rules", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise repos ~/Projects",
        "  kundol optimise repos ~/Projects -f",
        "  kundol optimise repos ~/Projects --allow-beta",
      ].join("\n"),
    )
    .action((workdir: string, options: { force: boolean; allowBeta: boolean }) => {
      return applyResult(optimiseProjects(context, workdir, options));
    });

  return optimise;
}
