import { describe, expect, test } from "bun:test";
import { createDockerKindImageInventory } from "../../src/services/optimisation-registry/docker-kind-images";
import type { DockerBindingCommandResult, DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";
import type { RegistryAdapterResourceTarget, RegistryResourceTarget, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const contextName = "isolated-test";
const endpoint = "unix:///private/docker.sock";
const daemonId = "daemon-fixture-kind";
const nodeA = "a".repeat(64);
const nodeB = "b".repeat(64);
const hostNodeImage = `sha256:${"c".repeat(64)}`;
const nestedImage = `sha256:${"d".repeat(64)}`;
const nestedOther = `sha256:${"e".repeat(64)}`;
const approvedNodes = [{ nodeId: nodeA, cluster: "sandbox" }, { nodeId: nodeB, cluster: "sandbox" }];

function outcome(text: string, truncated = false): DockerBindingCommandResult {
  return { exitCode: 0, stdout: { text, truncated }, stderr: "" };
}

function node(id: string, cluster = "sandbox", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: id, Image: hostNodeImage,
    Config: { Labels: { "io.x-k8s.kind.cluster": cluster, "io.x-k8s.kind.role": "worker" } },
    State: { Running: true, Paused: false, Restarting: false },
    ...overrides,
  };
}

function cri(images: unknown[]): string {
  return JSON.stringify({ images });
}

function nested(id = nestedImage, tags = ["registry.k8s.io/pause:3.9"]): Record<string, unknown> {
  return { id, repoTags: tags, repoDigests: [], size: "4096" };
}

function fixture() {
  const calls: string[][] = [];
  const state = {
    endpoint, daemonId,
    nodes: new Map<string, Record<string, unknown>>([[nodeA, node(nodeA)], [nodeB, node(nodeB)]]),
    images: new Map<string, string>([[nodeA, cri([nested()])], [nodeB, cri([nested()])]]),
    truncateOn: "",
  };
  const runner: DockerPinnedRunner = async (argv) => {
    const args = [...argv];
    calls.push(args);
    const prefix = args.slice(0, 5).join(" ");
    if (args.join(" ") === `docker context inspect ${contextName}`) {
      return outcome(JSON.stringify([{ Name: contextName, Endpoints: { docker: { Host: state.endpoint } } }]));
    }
    if (args.join(" ") === `docker --context ${contextName} info --format {{json .}}`) {
      return outcome(JSON.stringify({ ID: state.daemonId }));
    }
    if (prefix === `docker --context ${contextName} container ls`) {
      const rows = [...state.nodes.keys()].map((ID) => ({ ID }));
      return outcome(rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""), state.truncateOn === "container ls");
    }
    if (prefix === `docker --context ${contextName} container inspect`) {
      return outcome(JSON.stringify(args.slice(5).flatMap((id) => state.nodes.get(id) ? [state.nodes.get(id)] : [])),
        state.truncateOn === "container inspect");
    }
    if (prefix === `docker --context ${contextName} container exec`) {
      const id = args[5];
      if (!id || args.slice(6).join(" ") !== "crictl images -o json") throw new Error("unexpected owner exec");
      return outcome(state.images.get(id) ?? "", state.truncateOn === "crictl images");
    }
    throw new Error(`unexpected injected command: ${args.join(" ")}`);
  };
  return { calls, state, runner };
}

async function list(selector: RegistrySelectorAdapter): Promise<readonly RegistryAdapterResourceTarget[]> {
  if (typeof selector === "function") throw new Error("expected exact kind image selector");
  const entries = await selector.list({} as Parameters<typeof selector.list>[0], { homeDir: "/private/home", projectRoots: [] });
  if (entries.some((entry) => entry.kind === "path")) throw new Error("kind selector returned path");
  return entries as readonly RegistryAdapterResourceTarget[];
}

async function lookup(selector: RegistrySelectorAdapter, target: RegistryResourceTarget): Promise<RegistryAdapterResourceTarget | null> {
  if (typeof selector === "function") throw new Error("expected exact kind image selector");
  const entry = await selector.lookup({} as Parameters<typeof selector.lookup>[0], target, { homeDir: "/private/home", projectRoots: [] });
  if (entry?.kind === "path") throw new Error("kind selector returned path");
  return entry;
}

function reviewed(target: RegistryAdapterResourceTarget): RegistryResourceTarget {
  return {
    kind: "resource", key: `resource:${JSON.stringify(["docker_context", target.ownerId, target.resourceId])}`,
    ownerId: target.ownerId, resourceId: target.resourceId, fingerprint: target.fingerprint,
    sizeBytes: target.sizeBytes ?? null,
  };
}

describe("injected protected kind node image inventory", () => {
  test("aggregates identical nested image IDs per cluster, with no action or duplicate byte count", async () => {
    const seeded = fixture();
    const binding = createDockerKindImageInventory({ contextName, endpoint, daemonId, runner: seeded.runner, approvedNodes });
    expect(Object.keys(binding.selectorAdapters)).toEqual(["cluster.images"]);
    expect("actionAdapters" in binding).toBe(false);
    const targets = await list(binding.selectorAdapters["cluster.images"]);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.resourceId).toMatch(/^kind-image:[a-f0-9]{64}:sha256:[a-f0-9]{64}$/);
    expect(targets[0]?.ownerId).toBe(binding.ownerId);
    expect(targets[0]?.sizeBytes).toBeNull();
    expect(targets[0]?.evidence?.join(" ")).toContain("2 node(s)");
    expect(seeded.calls).toContainEqual(["docker", "--context", contextName, "container", "ls", "--filter", "label=io.x-k8s.kind.cluster", "--no-trunc", "--format", "json"]);
    expect(seeded.calls.filter((call) => call.includes("exec"))).toEqual([
      ["docker", "--context", contextName, "container", "exec", nodeA, "crictl", "images", "-o", "json"],
      ["docker", "--context", contextName, "container", "exec", nodeB, "crictl", "images", "-o", "json"],
    ]);
    expect(seeded.calls.some((call) => call.includes("rm") || call.includes("prune") || call.includes("--force"))).toBe(false);
  });

  test("lookup rechecks exact owner key and per-node CRI observations", async () => {
    const seeded = fixture();
    const binding = createDockerKindImageInventory({ contextName, endpoint, daemonId, runner: seeded.runner, approvedNodes });
    const [first] = await list(binding.selectorAdapters["cluster.images"]);
    if (!first) throw new Error("missing kind image fixture");
    const target = reviewed(first);
    expect((await lookup(binding.selectorAdapters["cluster.images"], target))?.fingerprint).toBe(first.fingerprint);
    seeded.state.images.set(nodeB, cri([nested(nestedImage, ["registry.k8s.io/pause:changed"]), nested(nestedOther, ["other:tag"])]));
    expect((await lookup(binding.selectorAdapters["cluster.images"], target))?.fingerprint).not.toBe(first.fingerprint);
    const wrongOwner = { ...target, ownerId: "docker:" + "0".repeat(64) };
    const callCount = seeded.calls.length;
    expect(await lookup(binding.selectorAdapters["cluster.images"], wrongOwner)).toBeNull();
    expect(seeded.calls).toHaveLength(callCount);
  });

  test("never executes in a merely labeled but unapproved node", async () => {
    const seeded = fixture();
    const binding = createDockerKindImageInventory({
      contextName, endpoint, daemonId, runner: seeded.runner,
      approvedNodes: [{ nodeId: nodeA, cluster: "sandbox" }],
    });
    expect(await list(binding.selectorAdapters["cluster.images"])).toHaveLength(1);
    expect(seeded.calls.filter((call) => call.includes("exec"))).toEqual([
      ["docker", "--context", contextName, "container", "exec", nodeA, "crictl", "images", "-o", "json"],
    ]);
    seeded.state.nodes.set(nodeA, node(nodeA, "spoofed"));
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("differs from its explicit approval");
    expect(seeded.calls.filter((call) => call.includes("exec"))).toHaveLength(1);
    expect(() => createDockerKindImageInventory({ contextName, endpoint, daemonId, runner: seeded.runner, approvedNodes: [] })).toThrow("explicit bounded allowlist");
  });

  test("fails closed on daemon drift, malformed node labels/state, short IDs, or truncated CRI JSON", async () => {
    const seeded = fixture();
    const binding = createDockerKindImageInventory({ contextName, endpoint, daemonId, runner: seeded.runner, approvedNodes });
    seeded.state.endpoint = "tcp://unexpected:2375";
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("endpoint changed");
    seeded.state.endpoint = endpoint;
    seeded.state.daemonId = "other-daemon";
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("daemon identity changed");
    seeded.state.daemonId = daemonId;
    seeded.state.nodes.set(nodeA, node(nodeA, "sandbox", { State: { Running: false, Paused: false, Restarting: false } }));
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("not an active");
    seeded.state.nodes.set(nodeA, node(nodeA));
    seeded.state.images.set(nodeA, cri([{ id: "short", repoTags: [], repoDigests: [], size: "4096" }]));
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("full sha256 ID");
    seeded.state.images.set(nodeA, cri([nested()]));
    seeded.state.truncateOn = "crictl images";
    await expect(list(binding.selectorAdapters["cluster.images"])).rejects.toThrow("truncated");
    expect(seeded.calls.some((call) => call.includes("rm") || call.includes("prune"))).toBe(false);
  });
});
