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
    expect(optimiseCommand?.commands.map((command) => command.name()).sort()).toEqual(["projects", "repos", "storage"]);
    expect(optimiseCommand?.commands.some((command) => command.name() === "startup")).toBe(false);
  });

  test("optimise commands expose only force as a workflow flag", () => {
    const optimiseCommand = createProgram().commands.find((command) => command.name() === "optimise");
    expect(optimiseCommand).toBeDefined();

    for (const subcommand of optimiseCommand?.commands ?? []) {
      const help = subcommand.helpInformation();
      expect(subcommand.options.map((option) => option.long)).toEqual(["--force"]);
      expect(help).toContain("-f, --force");
      expect(help).not.toContain("--dry-run");
      expect(help).not.toContain("--apply");
      expect(help).not.toContain("--no-dry-run");
      expect(help).not.toContain("--json");
      expect(help).not.toContain("--max-depth");
    }
  });
});
