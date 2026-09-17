import type { RegistryAdapterResourceTarget, RegistryCandidate, RegistrySelectorAdapter, RegistryTarget } from "./types";
import {
  dockerOwnerId,
  makeDockerResourceTarget,
  parseDockerInspectArray,
  parseDockerJsonLines,
  parseDockerJsonObject,
  safeDockerDisplay,
  type DockerCapturedJson,
} from "./docker-protected-inventory";

const FULL_CONTAINER_ID = /^[a-f0-9]{64}$/;
const CONTEXT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const INSPECT_BATCH = 16;
const MAX_MOUNTS = 64;
const MAX_LABELS = 64;
const MAX_CONTAINERS = 512;
const MAX_INSPECTED_CONTAINERS = 128;

type JsonRecord = Record<string, unknown>;

export interface DockerBindingCommandResult {
  exitCode: number;
  stdout: DockerCapturedJson;
  stderr: string;
}

// Implementations must clear ambient DOCKER_HOST, DOCKER_CONTEXT, and
// DOCKER_CONFIG overrides, and must report output truncation accurately.
export type DockerPinnedRunner = (argv: readonly string[]) => Promise<DockerBindingCommandResult>;

export interface DockerStoppedContainerBindingOptions {
  contextName: string;
  endpoint: string;
  daemonId: string;
  runner: DockerPinnedRunner;
}

export interface DockerStoppedContainerBinding {
  ownerId: string;
  selector: RegistrySelectorAdapter;
  remove: (candidate: RegistryCandidate) => Promise<{ reclaimedBytes: number | null }>;
  isStillStopped: (target: RegistryTarget) => Promise<true | string>;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maximumLength = 1024): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid Docker container ${key}`);
  return value;
}

function optionalString(record: JsonRecord, key: string, maximumLength = 1024): string {
  const value = record[key];
  if (typeof value !== "string" || value.length > maximumLength) throw new Error(`invalid Docker container ${key}`);
  return value;
}

function asRecord(value: unknown, name: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`Docker container lacks ${name}`);
  return value;
}

function containerLabels(config: JsonRecord): Record<string, string> {
  const value = config.Labels;
  if (value === null || value === undefined) return Object.create(null) as Record<string, string>;
  if (!isRecord(value) || Object.keys(value).length > MAX_LABELS) throw new Error("invalid Docker container labels");
  const result = Object.create(null) as Record<string, string>;
  for (const [key, labelValue] of Object.entries(value)) {
    if (!key || key.length > 1024 || typeof labelValue !== "string" || labelValue.length > 1024) {
      throw new Error("invalid Docker container label entry");
    }
    result[key] = labelValue;
  }
  return result;
}

function mountsFromInspect(entry: JsonRecord): JsonRecord[] {
  if (!Array.isArray(entry.Mounts) || entry.Mounts.length > MAX_MOUNTS || !entry.Mounts.every(isRecord)) {
    throw new Error("Docker container mount inventory is absent or oversized");
  }
  return entry.Mounts;
}

function attachedReferenceNames(hostConfig: JsonRecord): string[] {
  const values = [hostConfig.VolumesFrom, hostConfig.Links];
  const refs: string[] = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (!Array.isArray(value) || value.length > MAX_CONTAINERS || !value.every((item) => typeof item === "string" && item.length <= 512)) {
      throw new Error("Docker container reference inventory is malformed");
    }
    refs.push(...value);
  }
  return refs;
}

function referencedBy(other: JsonRecord, targetId: string, targetName: string): boolean {
  const hostConfig = asRecord(other.HostConfig, "HostConfig");
  const refs = attachedReferenceNames(hostConfig);
  const normalizedName = targetName.replace(/^\//, "");
  return refs.some((ref) => {
    const head = (ref.split(":", 1)[0] ?? "").replace(/^\//, "");
    return head === targetId || head === normalizedName ||
      (head.length >= 12 && /^[a-f0-9]+$/.test(head) && targetId.startsWith(head));
  });
}

function stoppedState(entry: JsonRecord): true | string {
  const state = asRecord(entry.State, "State");
  if (state.Status !== "exited" || state.Running !== false || state.Restarting !== false || state.Paused !== false || state.Dead === true) {
    return "container is not conclusively exited and idle";
  }
  const hostConfig = asRecord(entry.HostConfig, "HostConfig");
  const policy = asRecord(hostConfig.RestartPolicy, "RestartPolicy");
  if (policy.Name !== "no" && policy.Name !== "") return "container has an automatic restart policy";
  return true;
}

function parsedContainer(entry: JsonRecord, ownerId: string): RegistryAdapterResourceTarget | null {
  const id = requiredString(entry, "Id", 64);
  if (!FULL_CONTAINER_ID.test(id)) throw new Error("Docker container inspect lacks a full ID");
  const stateResult = stoppedState(entry);
  if (stateResult !== true) return null;
  const name = requiredString(entry, "Name", 255);
  const created = requiredString(entry, "Created", 128);
  const image = requiredString(entry, "Image", 128);
  const state = asRecord(entry.State, "State");
  const config = asRecord(entry.Config, "Config");
  const hostConfig = asRecord(entry.HostConfig, "HostConfig");
  const labels = containerLabels(config);
  // Compose retains failed pre-start hook containers for post-mortem
  // inspection; they are not ordinary stale service containers.
  if (labels["com.docker.compose.hook"] === "pre_start") return null;
  const mounts = mountsFromInspect(entry);
  const mountState = mounts.map((mount) => {
    if (typeof mount.RW !== "boolean" ||
      (mount.Name !== null && mount.Name !== undefined && (typeof mount.Name !== "string" || mount.Name.length > 255))) {
      throw new Error("Docker container mount attributes are malformed");
    }
    return {
      type: requiredString(mount, "Type", 32),
      source: optionalString(mount, "Source", 2048),
      destination: requiredString(mount, "Destination", 2048),
      name: typeof mount.Name === "string" ? mount.Name : null,
      rw: mount.RW,
    };
  });
  const sizeRw = entry.SizeRw;
  if (sizeRw !== null && sizeRw !== undefined && (!Number.isSafeInteger(sizeRw) || (sizeRw as number) < 0)) {
    throw new Error("invalid Docker writable-layer size");
  }
  const composeProject = labels["com.docker.compose.project"];
  const composeService = labels["com.docker.compose.service"];
  const evidence = [
    `exited container ${safeDockerDisplay(name)}`,
    `${mounts.length} mounts; writable layer ${sizeRw ?? "unknown"} bytes may contain unique data`,
    ...mountState.slice(0, 3).map((mount) => `mount ${safeDockerDisplay(mount.type)} ${safeDockerDisplay(mount.source || "(none)")} → ${safeDockerDisplay(mount.destination)} (${mount.rw === true ? "rw" : "ro"})`),
    ...(mountState.length > 3 ? [`${mountState.length - 3} additional mounts`] : []),
    ...(composeProject ? [`Compose project: ${safeDockerDisplay(composeProject)}`] : []),
    ...(composeService ? [`Compose service: ${safeDockerDisplay(composeService)}`] : []),
  ];
  return makeDockerResourceTarget(ownerId, `container:${id}`, {
    id, name, created, image, state: {
      status: state.Status, running: state.Running, restarting: state.Restarting,
      paused: state.Paused, dead: state.Dead, exitCode: state.ExitCode,
      finishedAt: state.FinishedAt,
    },
    labels, mounts: mountState,
    restartPolicy: asRecord(hostConfig.RestartPolicy, "RestartPolicy").Name,
    volumesFrom: hostConfig.VolumesFrom ?? null,
    links: hostConfig.Links ?? null,
    sizeRw: sizeRw ?? null,
  }, evidence, typeof sizeRw === "number" ? sizeRw : null);
}

function listedIds(captured: DockerCapturedJson): string[] {
  const entries = parseDockerJsonLines(captured);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = requiredString(entry, "ID", 64);
    if (!FULL_CONTAINER_ID.test(id) || seen.has(id)) throw new Error("Docker container list has invalid or duplicate full ID");
    const state = requiredString(entry, "State", 32);
    seen.add(id);
    if (state === "exited") ids.push(id);
  }
  return ids;
}

function targetContainerId(target: RegistryTarget, ownerId: string): string | null {
  if (target.kind !== "resource" || target.ownerId !== ownerId || !target.resourceId.startsWith("container:")) return null;
  const id = target.resourceId.slice("container:".length);
  return FULL_CONTAINER_ID.test(id) ? id : null;
}

export function createStoppedDockerContainerBinding(options: DockerStoppedContainerBindingOptions): DockerStoppedContainerBinding {
  if (!CONTEXT_NAME.test(options.contextName)) throw new Error("Docker context name is not explicit and bounded");
  const ownerId = dockerOwnerId(options.endpoint, options.daemonId);
  const command = (...args: string[]) => ["docker", "--context", options.contextName, ...args];

  async function execute(argv: readonly string[]): Promise<DockerCapturedJson> {
    const result = await options.runner(argv);
    if (result.exitCode !== 0) throw new Error(`Docker owner command exited ${result.exitCode}`);
    if (typeof result.stdout.truncated !== "boolean") throw new Error("Docker runner omitted truncation status");
    if (result.stdout.truncated) throw new Error("Docker owner output was truncated");
    return result.stdout;
  }

  async function assertPinnedDaemon(): Promise<void> {
    const contexts = parseDockerInspectArray(await execute(["docker", "context", "inspect", options.contextName]));
    if (contexts.length !== 1 || contexts[0]?.Name !== options.contextName) throw new Error("Docker context identity changed");
    const endpoints = asRecord(contexts[0].Endpoints, "context endpoints");
    const dockerEndpoint = asRecord(endpoints.docker, "Docker context endpoint");
    if (dockerEndpoint.Host !== options.endpoint) throw new Error("Docker context endpoint changed");
    const info = parseDockerJsonObject(await execute(command("info", "--format", "{{json .}}")));
    if (info.ID !== options.daemonId) throw new Error("Docker daemon identity changed");
  }

  async function inspectIds(ids: readonly string[]): Promise<JsonRecord[]> {
    if (ids.length > MAX_INSPECTED_CONTAINERS) throw new Error("Docker container inspection exceeds safe scan bound");
    const inspected: JsonRecord[] = [];
    for (let offset = 0; offset < ids.length; offset += INSPECT_BATCH) {
      const batch = ids.slice(offset, offset + INSPECT_BATCH);
      const records = parseDockerInspectArray(await execute(command("container", "inspect", "--size", ...batch)));
      const expected = new Set(batch);
      if (records.length !== batch.length) throw new Error("Docker container inspect omitted a listed ID");
      for (const record of records) {
        const id = requiredString(record, "Id", 64);
        if (!FULL_CONTAINER_ID.test(id) || !expected.delete(id)) throw new Error("Docker container inspect returned an unexpected ID");
        inspected.push(record);
      }
    }
    return inspected;
  }

  async function list(): Promise<RegistryAdapterResourceTarget[]> {
    await assertPinnedDaemon();
    const ids = listedIds(await execute(command("container", "ls", "--all", "--no-trunc", "--format", "json")));
    const records = await inspectIds(ids);
    return records.flatMap((record) => {
      const target = parsedContainer(record, ownerId);
      return target ? [target] : [];
    });
  }

  async function lookup(reviewed: RegistryTarget): Promise<RegistryAdapterResourceTarget | null> {
    const id = targetContainerId(reviewed, ownerId);
    if (!id) return null;
    await assertPinnedDaemon();
    const listed = listedIds(await execute(command("container", "ls", "--all", "--no-trunc", "--format", "json")));
    if (!listed.includes(id)) return null;
    const [record] = await inspectIds([id]);
    return record ? parsedContainer(record, ownerId) : null;
  }

  async function isStillStopped(target: RegistryTarget): Promise<true | string> {
    try {
      const live = await lookup(target);
      return live && target.kind === "resource" && live.fingerprint === target.fingerprint
        ? true
        : "Docker container disappeared, changed, or became active";
    } catch (error) {
      return error instanceof Error ? safeDockerDisplay(error.message) : "Docker state cannot be verified";
    }
  }

  async function remove(candidate: RegistryCandidate): Promise<{ reclaimedBytes: number | null }> {
    if (candidate.ruleId !== "docker.container.stopped" || candidate.tier !== "review" ||
      candidate.action.kind !== "adapter" || candidate.action.adapterId !== "docker.container.remove_selected") {
      throw new Error("Docker container action is not bound to its reviewed owner rule");
    }
    const id = targetContainerId(candidate.target, ownerId);
    if (!id || candidate.target.kind !== "resource") throw new Error("Docker container target lacks a pinned full ID");
    const live = await lookup(candidate.target);
    if (!live || live.fingerprint !== candidate.target.fingerprint) throw new Error("Docker container changed since review");
    // A selected stopped container may still be referenced by another
    // container via volumes-from or legacy links, or belong to a live Compose
    // project. Recheck all owner references before exact-ID removal.
    const allList = parseDockerJsonLines(await execute(command("container", "ls", "--all", "--no-trunc", "--format", "json")));
    const allIds = allList.map((entry) => requiredString(entry, "ID", 64));
    if (new Set(allIds).size !== allIds.length || allIds.some((otherId) => !FULL_CONTAINER_ID.test(otherId))) {
      throw new Error("Docker reference list has invalid IDs");
    }
    const allRecords = await inspectIds(allIds);
    const selected = allRecords.find((entry) => entry.Id === id);
    if (!selected || parsedContainer(selected, ownerId)?.fingerprint !== live.fingerprint) {
      throw new Error("Docker container changed during reference recheck");
    }
    const targetName = requiredString(selected, "Name", 255);
    const selectedLabels = containerLabels(asRecord(selected.Config, "Config"));
    const composeProject = selectedLabels["com.docker.compose.project"];
    for (const record of allRecords) {
      if (record.Id === id) continue;
      if (referencedBy(record, id, targetName)) throw new Error("another Docker container references the selected container");
      if (composeProject) {
        const otherLabels = containerLabels(asRecord(record.Config, "Config"));
        if (otherLabels["com.docker.compose.project"] === composeProject) {
          const otherState = asRecord(record.State, "State");
          if (otherState.Running === true || otherState.Restarting === true || otherState.Paused === true) {
            throw new Error("selected container belongs to an active Compose project");
          }
        }
      }
    }
    // The final owner action is one full ID only. Without --force Docker
    // refuses removal if the container starts during the remaining race.
    await execute(command("container", "rm", id));
    return { reclaimedBytes: live.sizeBytes ?? null };
  }

  return {
    ownerId,
    selector: { list: async () => list(), lookup: async (_rule, reviewed) => lookup(reviewed) },
    remove,
    isStillStopped,
  };
}
