import { describe, expect, test } from "bun:test";
import { createProgram } from "../../src/cli/program";

describe("kundol CLI program", () => {
  test("registers the MVP command surface", () => {
    const help = createProgram().helpInformation();

    for (const command of ["init", "index", "dashboard", "list", "show", "scan", "clean", "runtimes", "config"]) {
      expect(help).toContain(command);
    }
  });

  test("prints a not-yet-implemented message for skeleton commands", async () => {
    const lines: string[] = [];
    const program = createProgram({
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        }
      }
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "list"], { from: "node" });

    expect(lines.join("\n")).toContain("kundol list is not implemented yet.");
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
  });
});
