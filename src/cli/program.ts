import { Command } from "commander";
import { consoleOutput, type Output } from "../shared/output";
import { openDefaultTui } from "./actions";
import { createCleanCommand } from "./commands/clean";
import { createConfigCommand } from "./commands/config";
import { createDashboardCommand } from "./commands/dashboard";
import { createIndexCommand } from "./commands/index";
import { createInitCommand } from "./commands/init";
import { createListCommand } from "./commands/list";
import { createRuntimesCommand } from "./commands/runtimes";
import { createScanCommand } from "./commands/scan";
import { createShowCommand } from "./commands/show";
import { applyResult } from "./commands/shared";

export interface CreateProgramOptions {
  output?: Output;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const context = {
    output: options.output ?? consoleOutput
  };

  const program = new Command()
    .name("kundol")
    .description("Index developer workspaces, inspect projects, and safely preview cleanup opportunities.")
    .version("0.1.0")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .action(() => {
      applyResult(openDefaultTui(context));
    });

  program.addCommand(createInitCommand(context));
  program.addCommand(createIndexCommand(context));
  program.addCommand(createDashboardCommand(context));
  program.addCommand(createListCommand(context));
  program.addCommand(createShowCommand(context));
  program.addCommand(createScanCommand(context));
  program.addCommand(createCleanCommand(context));
  program.addCommand(createRuntimesCommand(context));
  program.addCommand(createConfigCommand(context));

  return program;
}
