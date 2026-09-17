import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";
import type { Output } from "../../src/shared/output";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-docker-context-"));
  roots.push(root);
  const home = path.join(root, "home");
  await mkdir(home);
  return { home, databasePath: path.join(root, "audit.db") };
}

describe("explicit Docker context CLI", () => {
  test("plans protected network and volume inventories but never offers removal", async () => {
    const f = await fixture();
    const registry = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
    for (const id of ["docker.network.unused", "docker.volume.unused"]) {
      const rule = registry.rules.find((entry) => entry.id === id);
      if (!rule) throw new Error(`fixture rule missing: ${id}`);
      expect(rule.status).toBe("beta");
    }
    const networkId = "a".repeat(64);
    const volumeName = "sandbox_data";
    const endpoint = "unix:///sandbox/docker.sock";
    const calls: string[] = [];
    const runner: DockerPinnedRunner = async (argv) => {
      const signature = argv.join(" ");
      calls.push(signature);
      let text: string;
      if (signature === "docker context inspect sandbox") {
        text = JSON.stringify([{ Name: "sandbox", Endpoints: { docker: { Host: endpoint } } }]);
      } else if (signature === "docker --context sandbox info --format {{json .}}") {
        text = JSON.stringify({ ID: "private-daemon" });
      } else if (signature === "docker --context sandbox network ls --no-trunc --format json") {
        text = `${JSON.stringify({ ID: networkId, Name: "sandbox_net", Driver: "bridge", Scope: "local" })}\n`;
      } else if (signature === `docker --context sandbox network inspect ${networkId}`) {
        text = JSON.stringify([{ Id: networkId, Name: "sandbox_net", Driver: "bridge", Scope: "local",
          Created: "2026-09-15T00:00:00Z", Containers: {}, Labels: {}, Internal: false, Attachable: false, Ingress: false }]);
      } else if (signature === "docker --context sandbox volume ls --filter dangling=true --format json") {
        text = `${JSON.stringify({ Name: volumeName, Driver: "local", Scope: "local" })}\n`;
      } else if (signature === `docker --context sandbox volume inspect ${volumeName}`) {
        text = JSON.stringify([{ Name: volumeName, Driver: "local", Scope: "local", CreatedAt: "2026-09-15T00:00:00Z",
          Mountpoint: "/var/lib/docker/volumes/sandbox_data/_data", Labels: {}, Options: {} }]);
      } else throw new Error(`unexpected Docker fixture command: ${signature}`);
      return { exitCode: 0, stdout: { text, truncated: false }, stderr: "" };
    };
    const lines: string[] = [];
    const output: Output = { writeLine: (message = "") => { lines.push(message); }, writeError: () => {} };
    await createProgram({
      output, homeDir: f.home, databasePath: f.databasePath, registry,
      dockerPinnedRunnerFactory: () => runner,
      registrySelect: async (plan) => plan.candidates.map((candidate) => candidate.id),
    }).parseAsync(["optimise", "docker", "sandbox"], { from: "user" });
    expect(lines.join("\n")).toContain("Targets: 0");
    expect(calls.some((call) => call.includes(" network ls ") || call.includes(" volume ls "))).toBe(false);
    lines.length = 0;
    calls.length = 0;
    await createProgram({
      output, homeDir: f.home, databasePath: f.databasePath, registry,
      dockerPinnedRunnerFactory: () => runner,
      registrySelect: async (plan) => plan.candidates.map((candidate) => candidate.id),
    }).parseAsync(["optimise", "docker", "sandbox", "--allow-beta"], { from: "user" });
    const plan = lines.join("\n");
    expect(plan).toContain("Docker context: sandbox");
    expect(plan).toContain("Pinned owner: docker:");
    expect(plan).toContain("[beta protected] Unused Docker network");
    expect(plan).toContain("[beta protected] Unused Docker volume");
    expect(plan).toContain("Evidence: network sandbox_net");
    expect(plan).toContain("Cancelled. No Docker resources were removed.");
    expect(calls.some((call) => call.includes(" rm ") || call.includes(" prune "))).toBe(false);
  });
});
