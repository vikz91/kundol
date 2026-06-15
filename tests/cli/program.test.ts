import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProgram } from "../../src/cli/program";
import { openKundolDatabase } from "../../src/db";
import { ProjectRepository } from "../../src/db/repositories";

describe("kundol CLI program", () => {
  test("registers the MVP command surface", () => {
    const help = createProgram().helpInformation();

    for (const command of ["init", "index", "dashboard", "list", "show", "scan", "clean", "optimize", "runtimes", "config"]) {
      expect(help).toContain(command);
    }
    expect(help).not.toContain(" q ");
    expect(createProgram().commands.some((command) => command.name() === "q")).toBe(false);
  });

  test("list command reads an isolated empty registry", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-"));
    const lines: string[] = [];
    const program = createProgram({
      homeDir,
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

    expect(lines.join("\n")).toContain("No projects found.");
    const sessionLogs = await readdir(join(homeDir, ".kundol", "sessions"));
    expect(sessionLogs.length).toBe(1);
    expect(await readFile(join(homeDir, ".kundol", "sessions", sessionLogs[0]!), "utf8")).toContain(" : LIST : -\n");
    expect(process.exitCode).toBeUndefined();
    process.exitCode = 0;
  });

  test("default --workspace configures and indexes as a first-run shortcut", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-home-"));
    const workspace = await mkdtemp(join(tmpdir(), "kundol-cli-workspace-"));
    const project = join(workspace, "demo-api");
    await mkdir(project);
    await writeFile(join(project, "package.json"), JSON.stringify({ name: "demo-api" }));
    const lines: string[] = [];
    const program = createProgram({
      homeDir,
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        },
      },
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "--workspace", workspace], { from: "node" });

    const output = lines.join("\n");
    expect(output).toContain("Initialized kundol");
    expect(output).toContain("Indexed 1 project(s)");
    process.exitCode = 0;
  });

  test("config command can update archive threshold", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-config-"));
    const lines: string[] = [];
    const program = createProgram({
      homeDir,
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        },
      },
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "config", "--archive-before-clean-days", "21"], { from: "node" });
    await program.parseAsync(["node", "kundol", "config"], { from: "node" });

    const output = lines.join("\n");
    expect(output).toContain("Saved kundol config.");
    expect(output).toContain("Archive before clean days: 21");
    expect(output).toContain("archive before clean days: 21");
    process.exitCode = 0;
  });

  test("list can search only scanned projects", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-scanned-"));
    const connection = openKundolDatabase({ homeDir });
    try {
      const projects = new ProjectRepository(connection.db, { now: () => new Date("2026-06-15T10:00:00.000Z") });
      projects.upsert({
        path: join(homeDir, "api-server"),
        name: "api-server",
        primaryRuntime: "node",
        runtimes: ["node"],
        lastScannedAt: "2026-06-15T10:00:00.000Z",
      });
      projects.upsert({
        path: join(homeDir, "api-scratch"),
        name: "api-scratch",
        primaryRuntime: "node",
        runtimes: ["node"],
      });
    } finally {
      connection.close();
    }

    const lines: string[] = [];
    const program = createProgram({
      homeDir,
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        },
      },
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "list", "--scanned", "--search", "api"], { from: "node" });

    const output = lines.join("\n");
    expect(output).toContain("api-server");
    expect(output).not.toContain("api-scratch");
    process.exitCode = 0;
  });

  test("clean dry-run prints the explicit apply command", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-clean-"));
    const projectPath = join(homeDir, "clean-demo");
    await mkdir(join(projectPath, "node_modules", "left-pad"), { recursive: true });
    await writeFile(join(projectPath, "package.json"), JSON.stringify({ name: "clean-demo" }));
    await writeFile(join(projectPath, "node_modules", "left-pad", "index.js"), "module.exports = 1;");
    const connection = openKundolDatabase({ homeDir });
    try {
      new ProjectRepository(connection.db, { now: () => new Date("2026-06-15T10:00:00.000Z") }).upsert({
        path: projectPath,
        name: "clean-demo",
        primaryRuntime: "node",
        runtimes: ["node"],
      });
    } finally {
      connection.close();
    }

    const lines: string[] = [];
    const program = createProgram({
      homeDir,
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        },
      },
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "clean", "clean-demo"], { from: "node" });

    expect(lines.join("\n")).toContain("Apply safe cleanup: kundol clean clean-demo --apply --no-dry-run");
    process.exitCode = 0;
  });

  test("optimize dry-run prints selected cleanup and the explicit apply command", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-optimize-"));
    const projectPath = join(homeDir, "paused-demo");
    await mkdir(projectPath, { recursive: true });
    const connection = openKundolDatabase({ homeDir });
    try {
      new ProjectRepository(connection.db, { now: () => new Date("2026-06-15T10:00:00.000Z") }).upsert({
        path: projectPath,
        name: "paused-demo",
        primaryRuntime: "node",
        runtimes: ["node"],
        status: "PAUSED",
        cleanableBytes: 1024,
      });
    } finally {
      connection.close();
    }

    const lines: string[] = [];
    const program = createProgram({
      homeDir,
      output: {
        writeLine(message = "") {
          lines.push(message);
        },
        writeError(message = "") {
          lines.push(message);
        },
      },
    });

    program.exitOverride();
    await program.parseAsync(["node", "kundol", "optimize"], { from: "node" });

    const output = lines.join("\n");
    expect(output).toContain("Optimize storage dry run");
    expect(output).toContain("paused-demo");
    expect(output).toContain("Apply selected safe cleanup: kundol optimize --apply --no-dry-run");
    process.exitCode = 0;
  });
});
