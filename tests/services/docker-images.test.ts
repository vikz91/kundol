import { describe, expect, test } from "bun:test";
import { createDockerImageBinding } from "../../src/services/optimisation-registry/docker-images";
import type { DockerBindingCommandResult, DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";
import type { RegistryAdapterResourceTarget, RegistryCandidate, RegistryResourceTarget, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const contextName = "isolated-test";
const endpoint = "unix:///private/docker.sock";
const daemonId = "daemon-fixture-image";
const danglingId = `sha256:${"a".repeat(64)}`;
const taggedId = `sha256:${"b".repeat(64)}`;
const childId = `sha256:${"c".repeat(64)}`;
const containerId = "d".repeat(64);

function image(id: string, tags: string[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: id, Parent: "", RepoTags: tags, RepoDigests: [],
    Created: "2026-01-01T00:00:00Z", Size: 4096,
    ...overrides,
  };
}

function outcome(text: string, truncated = false): DockerBindingCommandResult {
  return { exitCode: 0, stdout: { text, truncated }, stderr: "" };
}

function jsonLines(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}

function fixture() {
  const calls: string[][] = [];
  const state = {
    endpoint, daemonId,
    images: new Map<string, Record<string, unknown>>([
      [danglingId, image(danglingId, [])],
      [taggedId, image(taggedId, ["kundol-fixture:stable"])],
    ]),
    containers: new Map<string, Record<string, unknown>>(),
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
    if (prefix === `docker --context ${contextName} image ls`) {
      const dangling = args.includes("dangling=true");
      const rows = [...state.images].filter(([, record]) => !dangling ||
        (Array.isArray(record.RepoTags) && record.RepoTags.length === 0 && Array.isArray(record.RepoDigests) && record.RepoDigests.length === 0))
        .map(([ID]) => ({ ID }));
      return outcome(jsonLines(rows), state.truncateOn === "image ls");
    }
    if (prefix === `docker --context ${contextName} image inspect`) {
      return outcome(JSON.stringify(args.slice(5).flatMap((id) => state.images.get(id) ? [state.images.get(id)] : [])),
        state.truncateOn === "image inspect");
    }
    if (prefix === `docker --context ${contextName} container ls`) {
      return outcome(jsonLines([...state.containers.keys()].map((ID) => ({ ID }))), state.truncateOn === "container ls");
    }
    if (prefix === `docker --context ${contextName} container inspect`) {
      return outcome(JSON.stringify(args.slice(5).flatMap((id) => state.containers.get(id) ? [state.containers.get(id)] : [])),
        state.truncateOn === "container inspect");
    }
    if (prefix === `docker --context ${contextName} image rm`) {
      if (args.length !== 7 || args[5] !== "--no-prune" || !state.images.delete(args[6]!)) {
        throw new Error("unexpected image action");
      }
      return outcome(args[6]!);
    }
    throw new Error(`unexpected injected command: ${args.join(" ")}`);
  };
  return { calls, state, runner };
}

async function list(selector: RegistrySelectorAdapter): Promise<readonly RegistryAdapterResourceTarget[]> {
  if (typeof selector === "function") throw new Error("expected exact image selector");
  const entries = await selector.list({} as Parameters<typeof selector.list>[0], { homeDir: "/private/home", projectRoots: [] });
  if (entries.some((entry) => entry.kind === "path")) throw new Error("image selector returned path");
  return entries as readonly RegistryAdapterResourceTarget[];
}

async function lookup(selector: RegistrySelectorAdapter, target: RegistryResourceTarget): Promise<RegistryAdapterResourceTarget | null> {
  if (typeof selector === "function") throw new Error("expected exact image selector");
  const entry = await selector.lookup({} as Parameters<typeof selector.lookup>[0], target, { homeDir: "/private/home", projectRoots: [] });
  if (entry?.kind === "path") throw new Error("image selector returned path");
  return entry;
}

function reviewed(target: RegistryAdapterResourceTarget): RegistryResourceTarget {
  return {
    kind: "resource", key: `resource:${JSON.stringify(["docker_context", target.ownerId, target.resourceId])}`,
    ownerId: target.ownerId, resourceId: target.resourceId, fingerprint: target.fingerprint,
    sizeBytes: target.sizeBytes ?? null,
  };
}

function candidate(target: RegistryResourceTarget, ruleId: "docker.image.dangling" | "docker.image.unused"): RegistryCandidate {
  return {
    id: `${ruleId}@${target.key}`,
    ruleId, categoryId: "containers", label: "Docker image", description: "Reviewed image",
    scope: "docker_context", status: "proposed", tier: "review", forceEligible: false,
    action: { kind: "adapter", adapterId: "docker.image.remove_selected" }, target, evidence: [], sources: [],
  };
}

describe("injected exact-ID Docker image bindings", () => {
  test("selects only unreferenced dangling and sole-tag images, pins full IDs, and reports unknown reclaim", async () => {
    const seeded = fixture();
    const binding = createDockerImageBinding({ contextName, endpoint, daemonId, runner: seeded.runner });
    expect(Object.keys(binding.selectorAdapters).sort()).toEqual(["docker.images.dangling", "docker.images.unused"]);
    const dangling = await list(binding.selectorAdapters["docker.images.dangling"]);
    const unused = await list(binding.selectorAdapters["docker.images.unused"]);
    expect(dangling.map((target) => target.resourceId)).toEqual([`image:${danglingId}`]);
    expect(unused.map((target) => target.resourceId)).toEqual([`image:${taggedId}`]);
    expect(dangling[0]?.ownerId).toBe(binding.ownerId);
    expect(dangling[0]?.sizeBytes).toBeNull();
    expect(unused[0]?.evidence?.join(" ")).toContain("sole tag kundol-fixture:stable");
    expect(seeded.calls).toContainEqual(["docker", "--context", contextName, "image", "ls", "--all", "--filter", "dangling=true", "--no-trunc", "--format", "json"]);
    expect(seeded.calls.some((call) => call.includes("rm") || call.includes("--force") || call.includes("prune"))).toBe(false);
  });

  test("target lookup rechecks full ID, fingerprint, owner, and references", async () => {
    const seeded = fixture();
    const binding = createDockerImageBinding({ contextName, endpoint, daemonId, runner: seeded.runner });
    const [first] = await list(binding.selectorAdapters["docker.images.unused"]);
    if (!first) throw new Error("missing tagged fixture");
    const target = reviewed(first);
    expect((await lookup(binding.selectorAdapters["docker.images.unused"], target))?.fingerprint).toBe(first.fingerprint);
    expect(await binding.isStillUnused("docker.image.unused", target)).toBe(true);
    seeded.state.containers.set(containerId, { Id: containerId, Image: taggedId });
    expect(await lookup(binding.selectorAdapters["docker.images.unused"], target)).toBeNull();
    expect(await binding.isStillUnused("docker.image.unused", target)).not.toBe(true);
    seeded.state.containers.clear();
    seeded.state.images.set(childId, image(childId, ["child:stable"], { Parent: taggedId }));
    expect(await lookup(binding.selectorAdapters["docker.images.unused"], target)).toBeNull();
    seeded.state.images.delete(childId);
    seeded.state.images.set(taggedId, image(taggedId, ["new:tag"]));
    expect((await lookup(binding.selectorAdapters["docker.images.unused"], target))?.fingerprint).not.toBe(first.fingerprint);
  });

  test("blocks multi-tag, digest-held, short-ID, and wrong-owner images without action", async () => {
    const seeded = fixture();
    const binding = createDockerImageBinding({ contextName, endpoint, daemonId, runner: seeded.runner });
    seeded.state.images.set(taggedId, image(taggedId, ["one:tag", "two:tag"]));
    expect(await list(binding.selectorAdapters["docker.images.unused"])).toEqual([]);
    seeded.state.images.set(taggedId, image(taggedId, ["one:tag"], { RepoDigests: ["one@sha256:" + "e".repeat(64)] }));
    expect(await list(binding.selectorAdapters["docker.images.unused"])).toEqual([]);
    const fake: RegistryResourceTarget = {
      kind: "resource", key: "foreign", ownerId: "docker:" + "0".repeat(64),
      resourceId: `image:${taggedId}`, fingerprint: "x", sizeBytes: null,
    };
    expect(await lookup(binding.selectorAdapters["docker.images.unused"], fake)).toBeNull();
    expect(await lookup(binding.selectorAdapters["docker.images.unused"], { ...fake, ownerId: binding.ownerId, resourceId: "image:sha256:abc" })).toBeNull();
    expect(seeded.calls.some((call) => call.includes("rm"))).toBe(false);
    expect(() => createDockerImageBinding({ contextName: "--host", endpoint, daemonId, runner: seeded.runner })).toThrow("explicit and bounded");
  });

  test("removes one reviewed full image ID using --no-prune and reports unknown bytes", async () => {
    const seeded = fixture();
    const binding = createDockerImageBinding({ contextName, endpoint, daemonId, runner: seeded.runner });
    const [first] = await list(binding.selectorAdapters["docker.images.dangling"]);
    if (!first) throw new Error("missing dangling fixture");
    const result = await binding.remove(candidate(reviewed(first), "docker.image.dangling"));
    expect(result.reclaimedBytes).toBeNull();
    expect(seeded.calls.at(-1)).toEqual(["docker", "--context", contextName, "image", "rm", "--no-prune", danglingId]);
    expect(seeded.calls.filter((call) => call.includes("rm"))).toHaveLength(1);
    expect(seeded.calls.some((call) => call.includes("--force") || call.slice(3, 5).join(" ") === "image prune")).toBe(false);
    expect(seeded.state.images.has(taggedId)).toBe(true);
  });

  test("fails closed on context/daemon drift, truncation, missing inspect, and changed review", async () => {
    const seeded = fixture();
    const binding = createDockerImageBinding({ contextName, endpoint, daemonId, runner: seeded.runner });
    const [first] = await list(binding.selectorAdapters["docker.images.unused"]);
    if (!first) throw new Error("missing tagged fixture");
    const target = reviewed(first);
    seeded.state.endpoint = "tcp://unexpected:2375";
    await expect(binding.remove(candidate(target, "docker.image.unused"))).rejects.toThrow("endpoint changed");
    seeded.state.endpoint = endpoint;
    seeded.state.daemonId = "changed-daemon";
    await expect(list(binding.selectorAdapters["docker.images.unused"])).rejects.toThrow("daemon identity changed");
    seeded.state.daemonId = daemonId;
    seeded.state.truncateOn = "container ls";
    await expect(binding.remove(candidate(target, "docker.image.unused"))).rejects.toThrow("truncated");
    seeded.state.truncateOn = "";
    seeded.state.images.delete(taggedId);
    await expect(binding.remove(candidate(target, "docker.image.unused"))).rejects.toThrow("changed or became referenced");
    expect(seeded.calls.some((call) => call.includes("rm"))).toBe(false);
  });
});
