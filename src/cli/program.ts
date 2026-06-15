import { Command } from "commander";
import { consoleOutput, type Output } from "../shared/output";
import { initProject, openDefaultTui } from "./actions";
import { createCleanCommand } from "./commands/clean";
import { createConfigCommand } from "./commands/config";
import { createDashboardCommand } from "./commands/dashboard";
import { createIndexCommand } from "./commands/index";
import { createInitCommand } from "./commands/init";
import { createListCommand } from "./commands/list";
import { createOptimizeCommand } from "./commands/optimize";
import { createRuntimesCommand } from "./commands/runtimes";
import { createScanCommand } from "./commands/scan";
import { createShowCommand } from "./commands/show";
import { applyResult } from "./commands/shared";

export interface CreateProgramOptions {
  output?: Output;
  databasePath?: string;
  homeDir?: string;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const context = {
    output: options.output ?? consoleOutput,
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
  };

  const program = new Command()
    .name("kundol")
    .description("Index developer workspaces, inspect projects, and safely preview cleanup opportunities.")
    .version("0.1.0")
    .option("-w, --workspace <path>", "first-run shortcut: configure this workspace and run the first index", collect, [])
    .showHelpAfterError()
    .showSuggestionAfterError()
    .action((options: { workspace: string[] }) => {
      if (options.workspace.length > 0) {
        return applyResult(initProject(context, { workspace: options.workspace, index: true }));
      }
      return applyResult(openDefaultTui(context));
    });

  program.addCommand(createInitCommand(context));
  program.addCommand(createIndexCommand(context));
  program.addCommand(createDashboardCommand(context));
  program.addCommand(createListCommand(context));
  program.addCommand(createShowCommand(context));
  program.addCommand(createScanCommand(context));
  program.addCommand(createCleanCommand(context));
  program.addCommand(createOptimizeCommand(context));
  program.addCommand(createRuntimesCommand(context));
  program.addCommand(createConfigCommand(context));

  return program;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
