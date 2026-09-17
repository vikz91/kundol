import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readScopeDefaults, saveScopeDefaults, type ScopeDefaults } from "../config/scope-defaults";
import { discoverDockerContexts } from "../services/optimisation-registry/docker-context-discovery";
import { createPinnedDockerRunner } from "../services/optimisation-registry/docker-pinned-runner";
import { resolvePinnedDockerContextIdentity } from "../services/optimisation-registry/docker-context-identity";
import type { CommandContext } from "./actions";

export interface ScopeInput {
  workdir?: string;
  dockerContext?: string;
  needsWorkdir?: boolean;
  needsDocker?: boolean;
  saveDefaults?: boolean;
}

async function chooseDockerContext(context: CommandContext, names: readonly string[]): Promise<string> {
  if (names.length === 0) throw new Error("No Docker contexts found. No Docker default was saved; configure Docker or supply a context explicitly.");
  if (names.length === 1) return names[0]!;
  context.output.writeLine("Choose a Docker context:");
  names.forEach((name, index) => context.output.writeLine(`  ${index + 1}. ${name}`));
  let selected: string | undefined;
  if (context.dockerContextSelect) {
    selected = await context.dockerContextSelect(names);
  } else {
    if (!stdin.isTTY || !stdout.isTTY) {
      throw new Error("Multiple Docker contexts found. Supply --docker-context <name> for optimise all, or optimise docker <name>. Force does not choose a context.");
    }
    const prompt = createInterface({ input: stdin, output: stdout });
    try {
      const answer = (await prompt.question("Context number (blank to cancel): ")).trim();
      if (/^[1-9][0-9]*$/.test(answer)) selected = names[Number(answer) - 1];
    } finally {
      prompt.close();
    }
  }
  if (!selected || !names.includes(selected)) throw new Error("Docker context selection cancelled or invalid. No defaults were saved.");
  return selected;
}

/** Resolve only scopes required by this command, before any target scan or apply. */
export async function resolveScopeDefaults(context: CommandContext, input: ScopeInput): Promise<ScopeDefaults> {
  const databaseOptions = {
    ...(context.databasePath ? { databasePath: context.databasePath } : {}),
    ...(context.homeDir ? { homeDir: context.homeDir } : {}),
  };
  const defaults = readScopeDefaults(databaseOptions);
  const resolved: ScopeDefaults = {};
  const updates: ScopeDefaults = {};
  if (input.needsWorkdir) {
    const workdir = input.workdir ?? defaults.workdir;
    if (!workdir) throw new Error("No project folder is saved. Supply a workdir once: optimise projects <workdir>, or optimise all --workdir <path>.");
    if (input.workdir === undefined && !path.isAbsolute(workdir)) throw new Error("Saved project folder is invalid. Supply a valid workdir with --save-defaults.");
    const absolute = path.resolve(workdir);
    let canonical: string;
    try {
      const info = await lstat(absolute);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("not a real directory");
      canonical = await realpath(absolute);
    } catch {
      throw new Error("Project folder must exist and be a real directory. Supply a valid workdir; add --save-defaults to replace the saved default.");
    }
    resolved.workdir = absolute;
    if (defaults.workdir === undefined || (input.saveDefaults && input.workdir !== undefined)) updates.workdir = canonical;
    if (input.workdir === undefined) context.output.writeLine(`Using saved project folder: ${absolute}`);
  }

  if (input.needsDocker) {
    let name = input.dockerContext ?? defaults.dockerContext;
    if (name === undefined) {
      let names: readonly string[];
      try {
        names = await (context.dockerContextNames ?? discoverDockerContexts)();
      } catch {
        throw new Error("Docker contexts could not be detected. No defaults were saved; check Docker or supply a context explicitly.");
      }
      if (names.length > 256 || new Set(names).size !== names.length || names.some((entry) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(entry))) {
        throw new Error("Docker context discovery returned invalid names. No defaults were saved.");
      }
      name = await chooseDockerContext(context, names);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name)) throw new Error("Docker context name is invalid. Supply a valid context; add --save-defaults to replace the saved default.");
    try {
      const runner = (context.dockerPinnedRunnerFactory ?? createPinnedDockerRunner)(name);
      await resolvePinnedDockerContextIdentity(name, runner);
    } catch {
      throw new Error(`Docker context "${name}" could not be verified. Check its daemon or supply another context; add --save-defaults to replace the default. No defaults were saved.`);
    }
    resolved.dockerContext = name;
    if (defaults.dockerContext === undefined || (input.saveDefaults && input.dockerContext !== undefined)) updates.dockerContext = name;
    if (input.dockerContext === undefined) context.output.writeLine(`Using Docker context: ${name}`);
  }

  if (Object.keys(updates).length > 0) {
    const saved = saveScopeDefaults(databaseOptions, updates, input.saveDefaults);
    if (saved.workdir) context.output.writeLine(`Saved project folder default: ${saved.workdir}`);
    if (saved.dockerContext) context.output.writeLine(`Saved Docker context default: ${saved.dockerContext}`);
  }
  return resolved;
}
