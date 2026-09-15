import { Command } from "commander";
import packageJson from "../../package.json";
import optimisationsJson from "../../registry/optimisations.json";
import { parseOptimisationRegistry } from "../core/optimisation-registry/schema";
import type { RegistryCommandRunner, RegistryProbeResult } from "../services/optimisation-registry";
import type { StartupCommandRunner } from "../services/startup-optimizer";
import { consoleOutput, type Output } from "../shared/output";
import { showWelcome } from "./actions";
import { createOptimiseCommand } from "./commands/optimise";
import { applyResult } from "./commands/shared";
import { createIssueCommand, createToolsCommand, openExternalUrl, type UrlOpener } from "./commands/tools";

export interface CreateProgramOptions {
  output?: Output;
  databasePath?: string;
  homeDir?: string;
  startupPlatform?: NodeJS.Platform;
  startupRunner?: StartupCommandRunner;
  registry?: unknown;
  registryRunner?: RegistryCommandRunner;
  registryNow?: () => Date;
  registrySelect?: (probe: RegistryProbeResult) => Promise<readonly string[]>;
  openUrl?: UrlOpener;
}

export function createProgram(options: CreateProgramOptions = {}): Command {
  const registry = parseOptimisationRegistry(options.registry ?? optimisationsJson);
  const context = {
    output: options.output ?? consoleOutput,
    registry,
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
    ...(options.homeDir ? { homeDir: options.homeDir } : {}),
    ...(options.startupPlatform ? { startupPlatform: options.startupPlatform } : {}),
    ...(options.startupRunner ? { startupRunner: options.startupRunner } : {}),
    ...(options.registryRunner ? { registryRunner: options.registryRunner } : {}),
    ...(options.registryNow ? { registryNow: options.registryNow } : {}),
    ...(options.registrySelect ? { registrySelect: options.registrySelect } : {}),
  };
  const openUrl = options.openUrl ?? openExternalUrl;

  const program = new Command()
    .name("kundol")
    .description("Optimise developer storage and project build artifacts with an audited scan-confirm-clean flow.")
    .version(packageJson.version)
    .addHelpText(
      "after",
      [
        "",
        "Command guide:",
        "  kundol optimise storage             review published owner-tool cache targets",
        "  kundol optimise startup             disable user startup items after scanning system/app entries",
        "  kundol optimise projects <workdir>  clean generated/dependency artifacts under nested projects",
        "  kundol optimise repos <workdir>     generated-artifact cleanup in a workdir",
        "  kundol tools available              list published optimisation tools",
        "  kundol tools search <query>         search published optimisation tools",
        "  kundol tools list --status proposed browse catalogue status",
        "  kundol tools request                open a prefilled tool request issue",
        "  kundol issue                        open GitHub's issue chooser",
        "",
        "Examples:",
        "  kundol optimise storage",
        "  kundol optimise startup",
        "  kundol optimise projects ~/Projects",
        "  kundol optimise repos ~/Projects -f",
        "  kundol tools available",
        "  kundol tools list --status proposed",
      ].join("\n"),
    )
    .showHelpAfterError()
    .showSuggestionAfterError()
    .action(() => {
      return applyResult(showWelcome(context));
    });

  program.addCommand(createOptimiseCommand(context));
  program.addCommand(createToolsCommand({ output: context.output, registry, openUrl }));
  program.addCommand(createIssueCommand(context.output, openUrl));

  return program;
}
