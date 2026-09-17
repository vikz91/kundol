import { describe, expect, test } from "bun:test";
import type { RegistryCandidate, RegistryResourceTarget } from "../../src/services/optimisation-registry/types";
import {
  createStoppedDockerContainerBinding,
  type DockerBindingCommandResult,
  type DockerPinnedRunner,
} from "../../src/services/optimisation-registry/docker-stopped-containers";

const contextName = "isolated-test";
const endpoint = "unix:///isolated/docker.sock";
const daemonId = "daemon-fixture-1";
const selectedId = "a".repeat(64);
const otherId = "b".repeat(64);

function selectedContainer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: selectedId,
    Name: "/sandbox_job",
    Created: "2026-09-15T00:00:00Z",
    Image: `sha256:${"c".repeat(64)}`,
    State: {
      Status: "exited", Running: false, Restarting: false, Paused: false,
      Dead: false, ExitCode: 0, FinishedAt: "2026-09-15T01:00:00Z",
    },
    Config: { Labels: { "com.docker.compose.project": "sandbox", "com.docker.compose.service": "job" } },
    HostConfig: { RestartPolicy: { Name: "no" }, VolumesFrom: null, Links: null },
    Mounts: [
      { Type: "bind", Source: "/isolated/work", Destination: "/work", RW: true },
      { Type: "volume", Source: "/var/lib/docker/volumes/data/_data", Destination: "/data", Name: "data", RW: true },
    ],
    SizeRw: 2048,
    ...overrides,
  };
}

function otherContainer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...selectedContainer(),
    Id: otherId,
    Name: "/other_job",
    Config: { Labels: { "com.docker.compose.project": "sandbox", "com.docker.compose.service": "other" } },
    ...overrides,
  };
}

function outcome(text: string, exitCode = 0, truncated = false): DockerBindingCommandResult {
  return { exitCode, stdout: { text, truncated }, stderr: exitCode ? "owner error" : "" };
}

function fixtureRunner() {
  const calls: string[][] = [];
  const state = {
    endpoint,
    daemonId,
    records: new Map<string, Record<string, unknown>>([[selectedId, selectedContainer()]]),
    listedStates: new Map<string, string>([[selectedId, "exited"]]),
    truncateOn: "",
    removeExitCode: 0,
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
    if (joined === `docker --context ${contextName} container ls --all --no-trunc --format json`) {
      const lines = [...state.listedStates].map(([ID, State]) => JSON.stringify({ ID, State }));
      return outcome(lines.join("\n") + (lines.length ? "\n" : ""), 0, state.truncateOn === "ls");
    }
    if (args.slice(0, 6).join(" ") === `docker --context ${contextName} container inspect --size`) {
      const ids = args.slice(6);
      return outcome(JSON.stringify(ids.flatMap((id) => state.records.get(id) ? [state.records.get(id)] : [])), 0, state.truncateOn === "inspect");
    }
    if (args.slice(0, 5).join(" ") === `docker --context ${contextName} container rm`) {
      return outcome(`${args[5]}\n`, state.removeExitCode);
    }
    throw new Error(`unexpected injected command: ${joined}`);
  };
  return { state, calls, runner };
}

function resourceTarget(ownerId: string, selected: { resourceId: string; fingerprint: string; sizeBytes?: number | null }): RegistryResourceTarget {
  return {
    kind: "resource",
    key: `resource:${JSON.stringify(["docker_context", ownerId, selected.resourceId])}`,
    ownerId,
    resourceId: selected.resourceId,
    fingerprint: selected.fingerprint,
    sizeBytes: selected.sizeBytes ?? null,
  };
}

function candidate(target: RegistryResourceTarget): RegistryCandidate {
  return {
    id: `docker.container.stopped@${target.key}`,
    ruleId: "docker.container.stopped",
    categoryId: "containers",
    label: "Stopped Docker container",
    description: "Review stopped container",
    scope: "docker_context",
    status: "proposed",
    tier: "review",
    forceEligible: false,
    action: { kind: "adapter", adapterId: "docker.container.remove_selected" },
    target,
    evidence: [],
    sources: [],
  };
}

async function listedTarget(fixture: ReturnType<typeof fixtureRunner>) {
  const binding = createStoppedDockerContainerBinding({ contextName, endpoint, daemonId, runner: fixture.runner });
  if (typeof binding.selector === "function") throw new Error("expected targeted selector binding");
  const [target] = await binding.selector.list({} as Parameters<typeof binding.selector.list>[0], {
    homeDir: "/isolated/home", projectRoots: [],
  });
  if (!target || target.kind === "path") throw new Error("expected resource target");
  return { binding, target, reviewed: resourceTarget(binding.ownerId, target) };
}

describe("injected stopped Docker container owner binding", () => {
  test("lists only exited containers, pins daemon/context, and discloses mounts and Compose membership", async () => {
    const fixture = fixtureRunner();
    const { binding, target } = await listedTarget(fixture);
    expect(target.resourceId).toBe(`container:${selectedId}`);
    expect(target.sizeBytes).toBe(2048);
    expect(target.evidence?.join(" ")).toContain("/isolated/work");
    expect(target.evidence?.join(" ")).toContain("Compose project: sandbox");
    expect(target.evidence?.join(" ")).toContain("Compose service: job");
    expect(binding.ownerId).toMatch(/^docker:[a-f0-9]{64}$/);
    expect(fixture.calls[0]).toEqual(["docker", "context", "inspect", contextName]);
    expect(fixture.calls[1]).toEqual(["docker", "--context", contextName, "info", "--format", "{{json .}}"]) ;
    expect(fixture.calls.some((call) => call.includes("prune") || call.includes("--force") || call.includes("--volumes"))).toBe(false);
  });

  test("lookup targets a single full ID and skips active or missing containers", async () => {
    const fixture = fixtureRunner();
    const { binding, reviewed } = await listedTarget(fixture);
    if (typeof binding.selector === "function") throw new Error("expected targeted selector binding");
    const live = await binding.selector.lookup({} as Parameters<typeof binding.selector.lookup>[0], reviewed, {
      homeDir: "/isolated/home", projectRoots: [],
    });
    expect(live && live.kind !== "path" ? live.resourceId : null).toBe(`container:${selectedId}`);
    expect(fixture.calls.at(-1)).toEqual(["docker", "--context", contextName, "container", "inspect", "--size", selectedId]);
    fixture.state.listedStates.set(selectedId, "running");
    expect(await binding.selector.lookup({} as Parameters<typeof binding.selector.lookup>[0], reviewed, {
      homeDir: "/isolated/home", projectRoots: [],
    })).toBeNull();
    fixture.state.listedStates.delete(selectedId);
    expect(await binding.isStillStopped(reviewed)).not.toBe(true);
  });

  test("never offers retained pre-start hook diagnostics or restartable containers", async () => {
    const fixture = fixtureRunner();
    fixture.state.records.set(selectedId, selectedContainer({
      Config: { Labels: { "com.docker.compose.project": "sandbox", "com.docker.compose.hook": "pre_start" } },
    }));
    const binding = createStoppedDockerContainerBinding({ contextName, endpoint, daemonId, runner: fixture.runner });
    if (typeof binding.selector === "function") throw new Error("expected targeted selector binding");
    expect(await binding.selector.list({} as Parameters<typeof binding.selector.list>[0], {
      homeDir: "/isolated/home", projectRoots: [],
    })).toEqual([]);
    fixture.state.records.set(selectedId, selectedContainer({
      HostConfig: { RestartPolicy: { Name: "always" }, VolumesFrom: null, Links: null },
    }));
    expect(await binding.selector.list({} as Parameters<typeof binding.selector.list>[0], {
      homeDir: "/isolated/home", projectRoots: [],
    })).toEqual([]);
  });

  test("removes only the reviewed full ID, with no force, volume, or prune flags", async () => {
    const fixture = fixtureRunner();
    const { binding, reviewed } = await listedTarget(fixture);
    const result = await binding.remove(candidate(reviewed));
    expect(result.reclaimedBytes).toBe(2048);
    expect(fixture.calls.at(-1)).toEqual(["docker", "--context", contextName, "container", "rm", selectedId]);
    expect(fixture.calls.filter((call) => call.includes("rm"))).toHaveLength(1);
  });

  test("fails closed on context drift, daemon drift, and truncated inventory", async () => {
    const fixture = fixtureRunner();
    const { binding, reviewed } = await listedTarget(fixture);
    fixture.state.endpoint = "tcp://elsewhere:2375";
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("context endpoint changed");
    fixture.state.endpoint = endpoint;
    fixture.state.daemonId = "different-daemon";
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("daemon identity changed");
    fixture.state.daemonId = daemonId;
    fixture.state.truncateOn = "ls";
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("truncated");
    expect(fixture.calls.some((call) => call.includes("rm"))).toBe(false);
  });

  test("refuses changed mounts, running state, restart policy, and action mismatch", async () => {
    const fixture = fixtureRunner();
    const { binding, reviewed } = await listedTarget(fixture);
    fixture.state.records.set(selectedId, selectedContainer({ Mounts: [] }));
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("changed since review");
    fixture.state.records.set(selectedId, selectedContainer({
      State: { Status: "running", Running: true, Restarting: false, Paused: false },
    }));
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("changed since review");
    fixture.state.records.set(selectedId, selectedContainer({
      HostConfig: { RestartPolicy: { Name: "always" }, VolumesFrom: null, Links: null },
    }));
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("changed since review");
    const wrong = { ...candidate(reviewed), ruleId: "docker.image.unused" };
    await expect(binding.remove(wrong)).rejects.toThrow("not bound");
    expect(fixture.calls.some((call) => call.includes("rm"))).toBe(false);
  });

  test("refuses volumes-from references and active Compose sibling services", async () => {
    const fixture = fixtureRunner();
    const { binding, reviewed } = await listedTarget(fixture);
    fixture.state.records.set(otherId, otherContainer({
      HostConfig: { RestartPolicy: { Name: "no" }, VolumesFrom: ["sandbox_job:ro"], Links: null },
    }));
    fixture.state.listedStates.set(otherId, "exited");
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("references");
    fixture.state.records.set(otherId, otherContainer({
      State: { Status: "running", Running: true, Restarting: false, Paused: false },
    }));
    fixture.state.listedStates.set(otherId, "running");
    await expect(binding.remove(candidate(reviewed))).rejects.toThrow("active Compose project");
    expect(fixture.calls.some((call) => call.includes("rm"))).toBe(false);
  });
});
