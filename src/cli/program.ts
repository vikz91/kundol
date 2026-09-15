import { Command } from "commander";
import packageJson from "../../package.json";
import type { StartupCommandRunner } from "../services/startup-optimizer";
import { consoleOutput, type Output } from "../shared/output";
import { showWelcome } from "./actions";
import { createOptimiseCommand } from "./commands/optimise";
import { applyResult } from "./commands/shared";

export interface CreateProgramOptions {
  output?: Output;
  databasePath?: string;
  homeDir?: string;
  startupPlatform?: NodeJS.Platform;
  startupRunner?: StartupCommandRunner;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const context = {
    output: options.output ?? consoleOutput,
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    ...(options.startupPlatform ? { startupPlatform: options.startupPlatform } : {}),
    ...(options.startupRunner ? { startupRunner: options.startupRunner } : {}),
  };

  const program = new Command()
    .name("kundol")
    .description("Optimise developer storage and project build artifacts with an audited scan-confirm-clean flow.")
    .version(packageJson.version)
    .addHelpText(
      "after",
      [
        "",
        "Available tools:",
        "  kundol optimise storage             clean package caches, Docker build/cache resources, and old temp entries",
        "  kundol optimise startup             disable user startup items after scanning system/app entries",
        "  kundol optimise projects <workdir>  clean generated/dependency artifacts under nested projects",
        "  kundol optimise repos <workdir>     repo-scoped generated-artifact cleanup",
        "",
        "Examples:",
        "  kundol optimise storage",
        "  kundol optimise startup",
        "  kundol optimise projects ~/Projects",
        "  kundol optimise repos ~/Projects -f",
      ].join("\n"),
    )
    .showHelpAfterError()
    .showSuggestionAfterError()
    .action(() => {
      return applyResult(showWelcome(context));
    });

  program.addCommand(createOptimiseCommand(context));

  return program;
}
