import { describe, expect, test } from "bun:test";
import packageJson from "../../package.json";
import { createProgram } from "../../src/cli/program";

describe("kundol CLI program", () => {
  test("reports the package version", () => {
    expect(createProgram().version()).toBe(packageJson.version);
  });

  test("registers optimisation, catalogue, and issue commands", async () => {
    const program = createProgram();
    const help = program.helpInformation();

    expect(help).toContain("optimise");

    const commandNames = program.commands.map((command) => command.name()).sort();
    expect(commandNames).toEqual(["issue", "optimise", "tools"]);
    expect(commandNames).not.toContain("dashboard");
    expect(commandNames).not.toContain("clean");
    expect(commandNames).not.toContain("optimize");

    const optimiseCommand = program.commands.find((command) => command.name() === "optimise");
    expect(optimiseCommand).toBeDefined();
    expect(optimiseCommand?.aliases()).toEqual([]);
  });

  test("registers the target optimise subcommands", () => {
    const optimiseCommand = createProgram().commands.find((command) => command.name() === "optimise");
    expect(optimiseCommand).toBeDefined();
    expect(optimiseCommand?.commands.map((command) => command.name()).sort()).toEqual(["all", "docker", "projects", "repos", "storage"]);
    expect(optimiseCommand?.commands.some((command) => command.name() === "startup")).toBe(false);
  });

  test("bare optimise shows help without running a scope", async () => {
    const optimiseCommand = createProgram().commands.find((command) => command.name() === "optimise");
    expect(optimiseCommand).toBeDefined();
    const output: string[] = [];
    optimiseCommand?.configureOutput({ writeOut: (message) => { output.push(message); } });

    await optimiseCommand?.parseAsync([], { from: "user" });

    expect(output.join("")).toContain("Usage: kundol optimise");
    expect(output.join("")).toContain("all [options]");
  });

  test("filesystem optimise commands expose force and beta opt-in, while Docker stays review-only", () => {
    const optimiseCommand = createProgram().commands.find((command) => command.name() === "optimise");
    expect(optimiseCommand).toBeDefined();

    for (const subcommand of optimiseCommand?.commands ?? []) {
      const help = subcommand.helpInformation();
      if (subcommand.name() === "docker") {
        expect(subcommand.options.map((option) => option.long)).toEqual(["--save-defaults", "--allow-beta"]);
        expect(help).not.toContain("-f, --force");
      } else if (subcommand.name() === "all") {
        expect(subcommand.options.map((option) => option.long)).toEqual(["--workdir", "--docker-context", "--save-defaults", "--force", "--allow-beta"]);
        expect(subcommand.options.filter((option) => option.mandatory)).toEqual([]);
        expect(help).toContain("-f, --force");
      } else {
        expect(subcommand.options.map((option) => option.long)).toEqual(subcommand.name() === "storage"
          ? ["--force", "--allow-beta"] : ["--save-defaults", "--force", "--allow-beta"]);
        expect(help).toContain("-f, --force");
      }
      expect(help).toContain("--allow-beta");
      expect(subcommand.registeredArguments.every((argument) => !argument.required)).toBe(true);
      expect(help).not.toContain("--dry-run");
      expect(help).not.toContain("--apply");
      expect(help).not.toContain("--no-dry-run");
      expect(help).not.toContain("--json");
      expect(help).not.toContain("--max-depth");
    }
  });
});
