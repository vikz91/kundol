import { describe, expect, test } from "bun:test";
import type { RegistryResourceTarget } from "../../src/services/optimisation-registry/types";
import { createProtectedDockerContextInventory } from "../../src/services/optimisation-registry/docker-context-inventory";
import type { DockerBindingCommandResult, DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";

const contextName = "isolated-test";
const endpoint = "unix:///isolated/docker.sock";
const daemonId = "daemon-fixture-1";
const networkId = "a".repeat(64);
const attachedId = "b".repeat(64);
const volumeName = "sandbox_data";

function network(id = networkId, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: id, Name: "sandbox_net", Driver: "bridge", Scope: "local",
    Created: "2026-09-15T00:00:00Z", Containers: {}, Labels: { "com.docker.compose.project": "sandbox" },
    Internal: false, Attachable: false, Ingress: false, ...overrides,
  };
}

function volume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Name: volumeName, Driver: "local", Scope: "local", CreatedAt: "2026-09-15T00:00:00Z",
    Mountpoint: `/var/lib/docker/volumes/${volumeName}/_data`, Labels: { "com.docker.compose.project": "sandbox" },
    Options: {}, ...overrides,
  };
}

function outcome(text: string, truncated = false): DockerBindingCommandResult {
  return { exitCode: 0, stdout: { text, truncated }, stderr: "" };
}

function jsonLines(entries: unknown[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : "");
}

function fixtureRunner() {
  const calls: string[][] = [];
  const state = {
    endpoint, daemonId,
    networks: new Map<string, Record<string, unknown>>([[networkId, network()]]),
    volumes: new Map<string, Record<string, unknown>>([[volumeName, volume()]]),
    danglingNames: new Set<string>([volumeName]),
    truncateOn: "",
  };
  const runner: DockerPinnedRunner = async (argv) => {
    const args = [...argv];
    calls.push(args);
    const joined = args.join(" ");
    if (joined === `docker context inspect ${contextName}`) {
      return outcome(JSON.stringify([{ Name: contextName, Endpoints: { docker: { Host: state.endpoint } } }]));
    }
    if (joined === `docker --context ${contextName} info --format {{json .}}`) {
      return outcome(JSON.stringify({ ID: state.daemonId }));
    }
    if (args.slice(0, 5).join(" ") === `docker --context ${contextName} network ls`) {
      const filter = args.find((arg) => arg.startsWith("id="))?.slice(3);
      const entries = [...state.networks].filter(([id]) => !filter || id.includes(filter)).map(([ID, record]) => ({
        ID, Name: record.Name, Driver: record.Driver, Scope: record.Scope,
      }));
      return outcome(jsonLines(entries), state.truncateOn === "network ls");
    }
    if (args.slice(0, 5).join(" ") === `docker --context ${contextName} network inspect`) {
      return outcome(JSON.stringify(args.slice(5).flatMap((id) => state.networks.get(id) ? [state.networks.get(id)] : [])),
        state.truncateOn === "network inspect");
    }
    if (args.slice(0, 5).join(" ") === `docker --context ${contextName} volume ls`) {
      const nameFilter = args.find((arg) => arg.startsWith("name="))?.slice(5);
      const entries = [...state.danglingNames].filter((name) => !nameFilter || name.includes(nameFilter)).map((Name) => ({
        Name, Driver: state.volumes.get(Name)?.Driver, Scope: state.volumes.get(Name)?.Scope,
      }));
      return outcome(jsonLines(entries), state.truncateOn === "volume ls");
    }
    if (args.slice(0, 5).join(" ") === `docker --context ${contextName} volume inspect`) {
      return outcome(JSON.stringify(args.slice(5).flatMap((name) => state.volumes.get(name) ? [state.volumes.get(name)] : [])),
        state.truncateOn === "volume inspect");
    }
    throw new Error(`unexpected injected command: ${joined}`);
  };
  return { runner, calls, state };
}

function resourceTarget(ownerId: string, resourceId: string, fingerprint: string): RegistryResourceTarget {
  return {
    kind: "resource", ownerId, resourceId, fingerprint, sizeBytes: null,
    key: `resource:${JSON.stringify(["docker_context", ownerId, resourceId])}`,
  };
}

async function list(binding: ReturnType<typeof createProtectedDockerContextInventory>, adapterId: "docker.networks.unused" | "docker.volumes.unused") {
  const selector = binding.selectorAdapters[adapterId];
  if (typeof selector === "function") throw new Error("expected targeted selector");
  return selector.list({} as Parameters<typeof selector.list>[0], { homeDir: "/isolated/home", projectRoots: [] });
}

async function lookup(binding: ReturnType<typeof createProtectedDockerContextInventory>, adapterId: "docker.networks.unused" | "docker.volumes.unused", target: RegistryResourceTarget) {
  const selector = binding.selectorAdapters[adapterId];
  if (typeof selector === "function") throw new Error("expected targeted selector");
  return selector.lookup({} as Parameters<typeof selector.lookup>[0], target, { homeDir: "/isolated/home", projectRoots: [] });
}

describe("injected protected Docker context bindings", () => {
  test("maps only read-only network and volume selectors, with pinned full identities", async () => {
    const fixture = fixtureRunner();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    expect(Object.keys(binding.selectorAdapters).sort()).toEqual(["docker.networks.unused", "docker.volumes.unused"]);
    expect("actionAdapters" in binding).toBe(false);
    const networks = await list(binding, "docker.networks.unused");
    const volumes = await list(binding, "docker.volumes.unused");
    expect(networks).toHaveLength(1);
    expect(volumes).toHaveLength(1);
    expect(networks[0]).toMatchObject({ ownerId: binding.ownerId, resourceId: `network:${networkId}`, sizeBytes: null });
    expect(volumes[0]).toMatchObject({ ownerId: binding.ownerId, resourceId: `volume:${volumeName}`, sizeBytes: null });
    expect(fixture.calls.some((call) => call.includes("rm") || call.includes("prune") || call.includes("--force"))).toBe(false);
    expect(fixture.calls).toContainEqual(["docker", "--context", contextName, "network", "ls", "--no-trunc", "--format", "json"]);
    expect(fixture.calls).toContainEqual(["docker", "--context", contextName, "volume", "ls", "--filter", "dangling=true", "--format", "json"]);
  });

  test("network lookup rechecks one exact full ID and skips new attachments", async () => {
    const fixture = fixtureRunner();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    const [first] = await list(binding, "docker.networks.unused");
    if (!first || first.kind === "path") throw new Error("expected network resource");
    const reviewed = resourceTarget(binding.ownerId, first.resourceId, first.fingerprint);
    const live = await lookup(binding, "docker.networks.unused", reviewed);
    expect(live && live.kind !== "path" ? live.fingerprint : null).toBe(first.fingerprint);
    expect(fixture.calls).toContainEqual(["docker", "--context", contextName, "network", "ls", "--filter", `id=${networkId}`, "--no-trunc", "--format", "json"]);
    expect(fixture.calls.at(-1)).toEqual(["docker", "--context", contextName, "network", "inspect", networkId]);
    fixture.state.networks.set(networkId, network(networkId, { Containers: { endpoint: { Name: "new" } } }));
    expect(await lookup(binding, "docker.networks.unused", reviewed)).toBeNull();
  });

  test("volume lookup rechecks exact dangling name and refuses newly referenced data", async () => {
    const fixture = fixtureRunner();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    const [first] = await list(binding, "docker.volumes.unused");
    if (!first || first.kind === "path") throw new Error("expected volume resource");
    const reviewed = resourceTarget(binding.ownerId, first.resourceId, first.fingerprint);
    const live = await lookup(binding, "docker.volumes.unused", reviewed);
    expect(live && live.kind !== "path" ? live.fingerprint : null).toBe(first.fingerprint);
    expect(fixture.calls).toContainEqual(["docker", "--context", contextName, "volume", "ls", "--filter", "dangling=true", "--filter", `name=${volumeName}`, "--format", "json"]);
    expect(fixture.calls.at(-1)).toEqual(["docker", "--context", contextName, "volume", "inspect", volumeName]);
    fixture.state.danglingNames.delete(volumeName);
    expect(await lookup(binding, "docker.volumes.unused", reviewed)).toBeNull();
  });

  test("excludes connected networks and does not inventory mounted volumes", async () => {
    const fixture = fixtureRunner();
    fixture.state.networks.set(attachedId, network(attachedId, { Name: "attached_net", Containers: { endpoint: {} } }));
    fixture.state.danglingNames.clear();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    expect(await list(binding, "docker.networks.unused")).toHaveLength(1);
    expect(await list(binding, "docker.volumes.unused")).toHaveLength(0);
  });

  test("fails closed on changed context/daemon and truncated or mismatched inspect", async () => {
    const fixture = fixtureRunner();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    fixture.state.endpoint = "tcp://unexpected:2375";
    await expect(list(binding, "docker.networks.unused")).rejects.toThrow("endpoint changed");
    fixture.state.endpoint = endpoint;
    fixture.state.daemonId = "different-daemon";
    await expect(list(binding, "docker.volumes.unused")).rejects.toThrow("daemon identity changed");
    fixture.state.daemonId = daemonId;
    fixture.state.truncateOn = "volume ls";
    await expect(list(binding, "docker.volumes.unused")).rejects.toThrow("truncated");
    fixture.state.truncateOn = "";
    fixture.state.volumes.delete(volumeName);
    await expect(list(binding, "docker.volumes.unused")).rejects.toThrow("omitted a listed resource");
    expect(fixture.calls.some((call) => call.includes("rm") || call.includes("prune"))).toBe(false);
  });

  test("rejects wrong daemon targets and short/unsafe lookup identities without owner calls", async () => {
    const fixture = fixtureRunner();
    const binding = createProtectedDockerContextInventory({ contextName, endpoint, daemonId, runner: fixture.runner });
    expect(await lookup(binding, "docker.networks.unused", resourceTarget("docker:" + "0".repeat(64), `network:${networkId}`, "x"))).toBeNull();
    expect(await lookup(binding, "docker.networks.unused", resourceTarget(binding.ownerId, "network:a123", "x"))).toBeNull();
    expect(await lookup(binding, "docker.volumes.unused", resourceTarget(binding.ownerId, "volume:../../unsafe", "x"))).toBeNull();
    expect(fixture.calls).toEqual([]);
    expect(() => createProtectedDockerContextInventory({ contextName: "--host", endpoint, daemonId, runner: fixture.runner })).toThrow("explicit and bounded");
  });
});
