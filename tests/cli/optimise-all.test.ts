import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { openKundolDatabase } from "../../src/db/client";
import { ActionRepository } from "../../src/db/repositories/action-repository";
import type { RegistryCommandResult } from "../../src/services/optimisation-registry";
import type { DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";
import type { Output } from "../../src/shared/output";

const roots: string[] = [];
const now = new Date("2026-09-17T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function exists(absolutePath: string): Promise<boolean> {
  try { await lstat(absolutePath); return true; }
  catch { return false; }
}

describe("unified optimise all command", () => {
  test("creates one plan and applies one combined safe selection", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kundol-all-cli-"));
    roots.push(root);
    const home = path.join(root, "home");
    const workdir = path.join(root, "projects");
    const project = path.join(workdir, "node");
    const modules = path.join(project, "node_modules");
    const store = path.join(home, "pnpm-store");
    const databasePath = path.join(root, "audit.db");
    await mkdir(home);
    await mkdir(modules, { recursive: true });
    await mkdir(store);
    await writeFile(path.join(project, "package.json"), "{}\n");
    await writeFile(path.join(modules, "package.js"), "generated\n");
    await writeFile(path.join(store, "cached.tgz"), "cached\n");
    for (const target of [path.join(modules, "package.js"), modules, path.join(store, "cached.tgz"), store]) {
      await utimes(target, old, old);
    }

    const ownerCalls: string[] = [];
    const ownerRunner = async (argv: readonly string[]): Promise<RegistryCommandResult> => {
      const command = argv.join(" ");
      ownerCalls.push(command);
      if (command === "pnpm store path") return { exitCode: 0, stdout: `${store}\n`, stderr: "" };
      if (command === "pnpm --version") return { exitCode: 0, stdout: "10.20.0\n", stderr: "" };
      if (command === "pnpm store prune") return { exitCode: 0, stdout: "removed\n", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "fixture tool unavailable" };
    };
    const networkId = "a".repeat(64);
    const endpoint = "unix:///sandbox/docker.sock";
    const dockerCalls: string[] = [];
    const dockerRunner: DockerPinnedRunner = async (argv) => {
      const command = argv.join(" ");
      dockerCalls.push(command);
      let text: string;
      if (command === "docker context inspect sandbox") {
        text = JSON.stringify([{ Name: "sandbox", Endpoints: { docker: { Host: endpoint } } }]);
      } else if (command === "docker --context sandbox info --format {{json .}}") {
        text = JSON.stringify({ ID: "private-daemon" });
      } else if (command === "docker --context sandbox network ls --no-trunc --format json") {
        text = `${JSON.stringify({ ID: networkId, Name: "sandbox_net", Driver: "bridge", Scope: "local" })}\n`;
      } else if (command === `docker --context sandbox network inspect ${networkId}`) {
        text = JSON.stringify([{ Id: networkId, Name: "sandbox_net", Driver: "bridge", Scope: "local",
          Created: "2026-09-17T00:00:00Z", Containers: {}, Labels: {}, Internal: false, Attachable: false, Ingress: false }]);
      } else if (command === "docker --context sandbox volume ls --filter dangling=true --format json") {
        text = "";
      } else throw new Error(`unexpected Docker fixture command: ${command}`);
      return { exitCode: 0, stdout: { text, truncated: false }, stderr: "" };
    };
    const lines: string[] = [];
    let selectionCalls = 0;
    const output: Output = { writeLine: (message = "") => { lines.push(message); }, writeError: () => {} };
    const unavailableOwner = async (): Promise<RegistryCommandResult> => ({ exitCode: 1, stdout: "", stderr: "fixture unavailable" });
    await createProgram({
      output, homeDir: home, databasePath, registryNow: () => now, registryRunner: ownerRunner,
      dockerPinnedRunnerFactory: () => dockerRunner,
      nugetPinnedRunner: unavailableOwner,
      condaPinnedRunner: unavailableOwner,
      registrySelect: async (probe) => {
        selectionCalls += 1;
        return probe.candidates.filter((candidate) => candidate.tier === "safe").map((candidate) => candidate.id);
      },
    }).parseAsync([
      "optimise", "all", "--workdir", workdir, "--docker-context", "sandbox", "--allow-beta",
    ], { from: "user" });

    const plan = lines.join("\n");
    expect(plan.match(/All optimisation plan/g)).toHaveLength(1);
    expect(plan).not.toContain("Storage optimisation plan");
    expect(plan).not.toContain("Project optimisation plan");
    expect(plan).toContain(`Workdir: ${workdir}`);
    expect(plan).toContain("Docker context: sandbox");
    expect(plan).toContain("Scope: user");
    expect(plan).toContain("Scope: workdir");
    expect(plan).toContain("[beta protected] Unused Docker network");
    expect(plan).toContain("Unavailable [beta] macos.system_data");
    expect(plan).toContain("Removed/optimised: 2");
    expect(selectionCalls).toBe(1);
    expect(ownerCalls).toContain("pnpm store prune");
    expect(await exists(modules)).toBe(false);
    expect(await exists(store)).toBe(true);
    expect(dockerCalls.some((command) => command.includes(" rm ") || command.includes(" prune "))).toBe(false);

    const connection = openKundolDatabase({ databasePath });
    try {
      const audit = new ActionRepository(connection.db, { now: () => now }).list();
      expect(audit.some((row) => row.actionType === "ALL_SCAN")).toBe(true);
      expect(audit.some((row) => row.actionType === "ALL_OPTIMISE")).toBe(true);
    } finally {
      connection.close();
    }
  });

  test("fails closed before selection when two scopes identify an overlapping path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "kundol-all-overlap-"));
    roots.push(root);
    const home = path.join(root, "home");
    const workdir = path.join(home, "projects");
    const project = path.join(workdir, "node");
    const modules = path.join(project, "node_modules");
    await mkdir(modules, { recursive: true });
    await writeFile(path.join(project, "package.json"), "{}\n");
    await writeFile(path.join(modules, "package.js"), "generated\n");
    for (const target of [path.join(modules, "package.js"), modules]) await utimes(target, old, old);

    const ownerCalls: string[] = [];
    const ownerRunner = async (argv: readonly string[]): Promise<RegistryCommandResult> => {
      const command = argv.join(" ");
      ownerCalls.push(command);
      if (command === "pnpm store path") return { exitCode: 0, stdout: `${modules}\n`, stderr: "" };
      if (command === "pnpm --version") return { exitCode: 0, stdout: "10.20.0\n", stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "fixture tool unavailable" };
    };
    const dockerRunner: DockerPinnedRunner = async (argv) => {
      const command = argv.join(" ");
      if (command === "docker context inspect sandbox") {
        return { exitCode: 0, stdout: { text: JSON.stringify([{ Name: "sandbox", Endpoints: { docker: { Host: "unix:///sandbox/docker.sock" } } }]), truncated: false }, stderr: "" };
      }
      if (command === "docker --context sandbox info --format {{json .}}") {
        return { exitCode: 0, stdout: { text: JSON.stringify({ ID: "private-daemon" }), truncated: false }, stderr: "" };
      }
      throw new Error(`unexpected Docker fixture command: ${command}`);
    };
    let selectionCalls = 0;
    const unavailableOwner = async (): Promise<RegistryCommandResult> => ({ exitCode: 1, stdout: "", stderr: "fixture unavailable" });

    await expect(createProgram({
      output: { writeLine: () => {}, writeError: () => {} }, homeDir: home,
      databasePath: path.join(root, "audit.db"), registryNow: () => now, registryRunner: ownerRunner,
      dockerPinnedRunnerFactory: () => dockerRunner, nugetPinnedRunner: unavailableOwner, condaPinnedRunner: unavailableOwner,
      registrySelect: async () => { selectionCalls += 1; return []; },
    }).parseAsync([
      "optimise", "all", "--workdir", workdir, "--docker-context", "sandbox",
    ], { from: "user" })).rejects.toThrow("overlapping target across optimisation scopes");

    expect(selectionCalls).toBe(0);
    expect(ownerCalls).not.toContain("pnpm store prune");
    expect(await exists(modules)).toBe(true);
  });
});
