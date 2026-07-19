import { Command } from "commander";
import type { CommandContext } from "../actions";
import { optimiseProjects, optimiseStartup, optimiseStorage } from "../actions";
import { applyResult } from "./shared";

export function createOptimiseCommand(context: CommandContext): Command {
  const optimise = new Command("optimise")
    .description("Scan, confirm, and clean storage or project targets.")
    .addHelpText(
      "after",
      [
        "",
        "Available tools:",
        "  storage             package caches, Docker build/cache resources, and old temp entries",
        "  projects <workdir>  generated/dependency artifacts under nested projects",
        "  repos <workdir>     repo-scoped generated-artifact cleanup",
        "  startup             system and app startup items",
        "",
        "All tools scan first, ask for confirmation, then clean. Use -f to skip the prompt.",
      ].join("\n"),
    );

  optimise
    .command("storage")
    .description("Clean machine-level storage targets such as package caches and Docker build cache.")
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
      return applyResult(optimiseStorage(context, { ...options, json: false }));
    });

  optimise
    .command("startup")
    .description("Disable user startup items after scanning system and app startup entries.")
    .option("-f, --force", "skip confirmation after scanning", false)
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  kundol optimise startup",
        "  kundol optimise startup -f",
      ].join("\n"),
    )
    .action((options: { force: boolean }) => {
      return applyResult(optimiseStartup(context, { ...options, json: false }));
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
      return applyResult(optimiseProjects(context, workdir, { ...options, maxDepth: 7, json: false }));
    });

  optimise
    .command("repos")
    .description("Clean generated targets under Git repo workdirs.")
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
      return applyResult(optimiseProjects(context, workdir, { ...options, maxDepth: 7, json: false }));
    });

  return optimise;
}
