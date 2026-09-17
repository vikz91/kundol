import { Command } from "commander";
import type { CommandContext } from "../actions";
import { optimiseAll, optimiseDocker, optimiseProjects, optimiseStorage } from "../actions";
import { applyResult } from "./shared";
import { resolveScopeDefaults } from "../scope-defaults";

export function createOptimiseCommand(context: CommandContext): Command {
  const optimise = new Command("optimise")
    .description("Scan, confirm, and clean storage or project targets.")
    .addHelpText(
      "after",
      [
        "",
        "Available tools:",
        "  all                 one plan using supplied or remembered project and Docker scopes",
        "  storage             published owner-tool cache maintenance rules",
        "  projects [workdir]  generated/dependency artifacts under nested projects",
        "  repos [workdir]     generated-artifact cleanup in a workdir",
        "  docker [context]    use a supplied, remembered, or detected Docker context",
        "",
        "All tools scan first, ask for confirmation, then clean. Use --allow-beta to opt in to code-approved beta rules; -f selects safe suggestions only.",
      ].join("\n"),
    );

  optimise.action(() => {
    optimise.outputHelp();
  });

  optimise
    .command("all")
    .description("Create one review plan using supplied or remembered scopes.")
    .option("--workdir <path>", "override the saved project folder for this run; the first valid value is saved")
    .option("--docker-context <name>", "override the saved/detected Docker context for this run; the first valid value is saved")
    .option("--save-defaults", "save supplied scopes as new defaults", false)
    .option("-f, --force", "skip confirmation and select only safe targets", false)
    .option("--allow-beta", "attempt beta rules in every scope and report unavailable handlers", false)
    .addHelpText(
      "after",
      [
        "",
        "Example:",
        "  kundol optimise all --workdir ~/Projects --docker-context my-context --allow-beta",
        "",
        "The first valid scopes are remembered. Later explicit values override them for one run.",
        "Use --save-defaults to replace defaults. Without a Docker default, one context is detected or you choose from several.",
      ].join("\n"),
    )
    .action(async (options: { workdir?: string; dockerContext?: string; saveDefaults: boolean; force: boolean; allowBeta: boolean }) => {
      const scopes = await resolveScopeDefaults(context, { ...options, needsWorkdir: true, needsDocker: true });
      return applyResult(optimiseAll(context, { ...options, workdir: scopes.workdir!, dockerContext: scopes.dockerContext! }));
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
    .argument("[workdir]", "project folder override; saved after the first valid use")
    .option("--save-defaults", "save the supplied project folder as the new default", false)
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
    .action(async (workdir: string | undefined, options: { saveDefaults: boolean; force: boolean; allowBeta: boolean }) => {
      const scopes = await resolveScopeDefaults(context, { ...(workdir !== undefined ? { workdir } : {}), needsWorkdir: true, saveDefaults: options.saveDefaults });
      return applyResult(optimiseProjects(context, scopes.workdir!, options));
    });

  optimise
    .command("docker")
    .description("Review resources in a supplied, remembered, or detected Docker context.")
    .argument("[context]", "Docker context override; saved after the first valid use")
    .option("--save-defaults", "save the supplied Docker context as the new default", false)
    .option("--allow-beta", "include code-approved beta protected inventories", false)
    .action(async (contextName: string | undefined, options: { allowBeta: boolean; saveDefaults: boolean }) => {
      const scopes = await resolveScopeDefaults(context, { ...(contextName !== undefined ? { dockerContext: contextName } : {}), needsDocker: true, saveDefaults: options.saveDefaults });
      return applyResult(optimiseDocker(context, scopes.dockerContext!, options));
    });

  optimise
    .command("repos")
    .description("Clean generated targets under a supplied workdir.")
    .argument("[workdir]", "project folder override; saved after the first valid use")
    .option("--save-defaults", "save the supplied project folder as the new default", false)
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
    .action(async (workdir: string | undefined, options: { saveDefaults: boolean; force: boolean; allowBeta: boolean }) => {
      const scopes = await resolveScopeDefaults(context, { ...(workdir !== undefined ? { workdir } : {}), needsWorkdir: true, saveDefaults: options.saveDefaults });
      return applyResult(optimiseProjects(context, scopes.workdir!, options));
    });

  return optimise;
}
