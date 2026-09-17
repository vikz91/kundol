import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import registryJson from "../../registry/optimisations.json";
import { createProgram, type CreateProgramOptions } from "../../src/cli/program";
import { readScopeDefaults, saveScopeDefaults } from "../../src/config/scope-defaults";
import type { DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-defaults-cli-"));
  roots.push(root);
  const homeDir = path.join(root, "home");
  const workdir = path.join(root, "projects");
  const alternate = path.join(root, "alternate");
  await Promise.all([mkdir(homeDir), mkdir(workdir), mkdir(alternate)]);
  const databasePath = path.join(root, "audit.db");
  const lines: string[] = [];
  const dockerCalls: string[] = [];
  let discoveryCalls = 0;
  // Keep the schema's required catalogue entry, but disable execution in these routing tests.
  const registry = { ...structuredClone(registryJson), rules: [{ ...registryJson.rules[0], status: "proposed" }] };
  const options: CreateProgramOptions = {
    homeDir, databasePath, registry,
    output: { writeLine: (line = "") => { lines.push(line); }, writeError: (line = "") => { lines.push(line); } },
    registryRunner: async () => { throw new Error("Unexpected owner command"); },
    registrySelect: async () => [],
    dockerContextNames: async () => { discoveryCalls += 1; return ["sandbox"]; },
    dockerPinnedRunnerFactory: (name): DockerPinnedRunner => async (argv) => {
      dockerCalls.push(argv.join(" "));
      let value: unknown;
      if (argv.join(" ") === `docker context inspect ${name}`) {
        value = [{ Name: name, Endpoints: { docker: { Host: `unix:///sandbox/${name}.sock` } } }];
      } else if (argv.join(" ") === `docker --context ${name} info --format {{json .}}`) {
        value = { ID: `${name}-daemon` };
      } else throw new Error(`Unexpected Docker command: ${argv.join(" ")}`);
      return { exitCode: 0, stdout: { text: JSON.stringify(value), truncated: false }, stderr: "" };
    },
  };
  return {
    homeDir, databasePath, workdir, alternate, lines, dockerCalls,
    discoveryCalls: () => discoveryCalls,
    defaults: () => readScopeDefaults({ databasePath }),
    run: async (args: string[], overrides: CreateProgramOptions = {}) => {
      const program = createProgram({ ...options, ...overrides });
      const helpOutput = { writeOut: (line: string) => { lines.push(line); } };
      program.configureOutput(helpOutput);
      for (const command of program.commands) command.configureOutput(helpOutput);
      await program.parseAsync(args, { from: "user" });
    },
  };
}

describe("remembered CLI scopes", () => {
  test("first project folder is canonical and reused by fresh projects and repos programs", async () => {
    const f = await fixture();
    await f.run(["optimise", "projects", path.join(f.workdir, "."), "-f"]);
    expect(f.defaults()).toEqual({ workdir: await realpath(f.workdir) });
    await f.run(["optimise", "projects", "-f"]);
    await f.run(["optimise", "repos", "-f"]);
    expect(f.lines.filter((line) => line.startsWith("Using saved project folder:"))).toHaveLength(2);
    expect(f.discoveryCalls()).toBe(0);
    expect(f.dockerCalls).toEqual([]);
  });

  test("explicit project overrides are temporary until save-defaults", async () => {
    const f = await fixture();
    await f.run(["optimise", "projects", f.workdir, "-f"]);
    await f.run(["optimise", "repos", f.alternate, "-f"]);
    expect(f.lines).toContain(`Workdir: ${f.alternate}`);
    expect(f.defaults().workdir).toBe(await realpath(f.workdir));
    await f.run(["optimise", "repos", f.alternate, "--save-defaults", "-f"]);
    expect(f.defaults().workdir).toBe(await realpath(f.alternate));
  });

  test("all remembers both scopes, reuses them, and only replaces explicit overrides on request", async () => {
    const f = await fixture();
    await f.run(["optimise", "all", "--workdir", f.workdir, "--docker-context", "first", "-f"]);
    expect(f.defaults()).toEqual({ workdir: await realpath(f.workdir), dockerContext: "first" });
    await f.run(["optimise", "all", "-f"]);
    await f.run(["optimise", "all", "--workdir", f.alternate, "--docker-context", "second", "-f"]);
    expect(f.defaults()).toEqual({ workdir: await realpath(f.workdir), dockerContext: "first" });
    expect(f.lines).toContain("Docker context: second");
    await f.run(["optimise", "all", "--workdir", f.alternate, "--docker-context", "second", "--save-defaults", "-f"]);
    expect(f.defaults()).toEqual({ workdir: await realpath(f.alternate), dockerContext: "second" });
    expect(f.discoveryCalls()).toBe(0);
  });

  test("missing and stale workdirs fail before scanning or Docker access", async () => {
    const f = await fixture();
    await expect(f.run(["optimise", "all", "-f"])).rejects.toThrow("No project folder is saved");
    saveScopeDefaults({ databasePath: f.databasePath }, { workdir: path.join(f.workdir, "missing") });
    await expect(f.run(["optimise", "projects", "-f"])).rejects.toThrow("must exist");
    expect(f.lines.some((line) => line.includes("optimisation plan"))).toBe(false);
    expect(f.dockerCalls).toEqual([]);
    expect(f.discoveryCalls()).toBe(0);
  });

  test("a sole discovered Docker context persists across fresh invocations and overrides stay temporary", async () => {
    const f = await fixture();
    await f.run(["optimise", "docker"]);
    expect(f.defaults()).toEqual({ dockerContext: "sandbox" });
    await f.run(["optimise", "docker"]);
    await f.run(["optimise", "docker", "temporary"]);
    expect(f.defaults().dockerContext).toBe("sandbox");
    expect(f.discoveryCalls()).toBe(1);
    await f.run(["optimise", "docker", "replacement", "--save-defaults"]);
    expect(f.defaults().dockerContext).toBe("replacement");
  });

  test("multiple discovered contexts use the injected choice and persist only that context", async () => {
    const f = await fixture();
    await f.run(["optimise", "docker"], {
      dockerContextNames: async () => ["first", "second"],
      dockerContextSelect: async (names) => { expect(names).toEqual(["first", "second"]); return "second"; },
    });
    expect(f.defaults()).toEqual({ dockerContext: "second" });
    expect(f.dockerCalls.every((command) => command.includes("second"))).toBe(true);
  });

  for (const scenario of [
    { name: "no contexts", names: [], selected: undefined, message: "No Docker contexts found" },
    { name: "cancelled selection", names: ["first", "second"], selected: undefined, message: "cancelled or invalid" },
    { name: "unknown selection", names: ["first", "second"], selected: "outside", message: "cancelled or invalid" },
    { name: "invalid discovered name", names: ["bad name"], selected: undefined, message: "invalid names" },
  ]) {
    test(`${scenario.name} saves neither scope and never scans`, async () => {
      const f = await fixture();
      await expect(f.run(["optimise", "all", "--workdir", f.workdir, "-f"], {
        dockerContextNames: async () => scenario.names,
        dockerContextSelect: async () => scenario.selected,
      })).rejects.toThrow(scenario.message);
      expect(f.defaults()).toEqual({});
      expect(f.dockerCalls).toEqual([]);
      expect(f.lines.some((line) => line.includes("optimisation plan"))).toBe(false);
    });
  }

  test("failed discovery and failed identity verification never save defaults", async () => {
    const f = await fixture();
    await expect(f.run(["optimise", "docker"], {
      dockerContextNames: async () => { throw new Error("unavailable"); },
    })).rejects.toThrow("could not be detected");
    await expect(f.run(["optimise", "all", "--workdir", f.workdir, "--docker-context", "broken", "-f"], {
      dockerPinnedRunnerFactory: () => async () => ({ exitCode: 1, stdout: { text: "", truncated: false }, stderr: "offline" }),
    })).rejects.toThrow("could not be verified");
    expect(f.defaults()).toEqual({});
  });

  test("noninteractive all force cannot choose among multiple Docker contexts", async () => {
    const f = await fixture();
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      await expect(f.run(["optimise", "all", "--workdir", f.workdir, "-f"], {
        dockerContextNames: async () => ["first", "second"],
      })).rejects.toThrow("Force does not choose a context");
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, "isTTY", descriptor);
      else Reflect.deleteProperty(process.stdin, "isTTY");
    }
    expect(f.defaults()).toEqual({});
    expect(f.dockerCalls).toEqual([]);
  });

  test("a stale saved Docker context fails without discovering or saving a replacement", async () => {
    const f = await fixture();
    saveScopeDefaults({ databasePath: f.databasePath }, { dockerContext: "stale" });
    await expect(f.run(["optimise", "docker"], {
      dockerPinnedRunnerFactory: () => async () => ({ exitCode: 1, stdout: { text: "", truncated: false }, stderr: "offline" }),
    })).rejects.toThrow("could not be verified");
    expect(f.defaults()).toEqual({ dockerContext: "stale" });
    expect(f.discoveryCalls()).toBe(0);
    expect(f.lines.some((line) => line.includes("optimisation plan"))).toBe(false);
  });

  test("an invalid explicit Docker name cannot reach the runner or be saved", async () => {
    const f = await fixture();
    await expect(f.run(["optimise", "docker", "bad name"])).rejects.toThrow("name is invalid");
    expect(f.defaults()).toEqual({});
    expect(f.dockerCalls).toEqual([]);
    expect(f.discoveryCalls()).toBe(0);
  });

  test("help and catalogue avoid config side effects; storage never resolves scopes", async () => {
    const f = await fixture();
    for (const args of [[], ["optimise"], ["tools", "available"]]) await f.run(args);
    await expect(stat(f.databasePath)).rejects.toThrow();
    await f.run(["optimise", "storage", "-f"]);
    expect(f.defaults()).toEqual({});
    expect(f.discoveryCalls()).toBe(0);
    expect(f.dockerCalls).toEqual([]);
  });
});
