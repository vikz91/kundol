import { Command } from "commander";
import type { CommandContext } from "../actions";
import { listProjects } from "../actions";
import { applyResult } from "./shared";

export function createListCommand(context: CommandContext): Command {
  return new Command("list")
    .description("List indexed projects with filters and sorting.")
    .option("--status <status>", "filter by lifecycle status")
    .option("--runtime <runtime>", "filter by runtime family")
    .option("--tag <tag>", "filter by tag")
    .option("--search <query>", "search names, paths, notes, remotes, and tags")
    .option("--sort <field>", "sort by a known field, for example size or modified")
    .option("--json", "print machine-readable output", false)
    .action((options: { status?: string; runtime?: string; tag?: string; search?: string; sort?: string; json: boolean }) => {
      applyResult(listProjects(context, options));
    });
}
