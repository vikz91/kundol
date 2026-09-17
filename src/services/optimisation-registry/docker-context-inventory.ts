import type { RegistryAdapterResourceTarget, RegistrySelectorAdapter, RegistryTarget } from "./types";
import type { DockerPinnedRunner } from "./docker-stopped-containers";
import {
  dockerOwnerId,
  parseDisconnectedDockerNetworks,
  parseDockerInspectArray,
  parseDockerJsonLines,
  parseDockerJsonObject,
  parseUnreferencedDockerVolumes,
  type DockerCapturedJson,
} from "./docker-protected-inventory";

const CONTEXT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const FULL_NETWORK_ID = /^[a-f0-9]{64}$/;
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;
const INSPECT_BATCH = 16;

type JsonRecord = Record<string, unknown>;

export interface ProtectedDockerContextInventoryOptions {
  contextName: string;
  endpoint: string;
  daemonId: string;
  // The injected implementation must clear ambient Docker context/host/config
  // environment overrides and distinguish complete from truncated output.
  runner: DockerPinnedRunner;
}

export interface ProtectedDockerContextInventory {
  ownerId: string;
  selectorAdapters: Readonly<{
    "docker.networks.unused": RegistrySelectorAdapter;
    "docker.volumes.unused": RegistrySelectorAdapter;
  }>;
  // Deliberately no actionAdapters: these registry rules are protected.
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maximumLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid Docker ${key}`);
  return value;
}

function exactTargetId(target: RegistryTarget, ownerId: string, kind: "network" | "volume"): string | null {
  if (target.kind !== "resource" || target.ownerId !== ownerId || !target.resourceId.startsWith(`${kind}:`)) return null;
  const fullId = target.resourceId.slice(kind.length + 1);
  return (kind === "network" ? FULL_NETWORK_ID : VOLUME_NAME).test(fullId) ? fullId : null;
}

function capturedLines(records: readonly JsonRecord[]): DockerCapturedJson {
  return { text: records.map((entry) => JSON.stringify(entry)).join("\n") + (records.length ? "\n" : ""), truncated: false };
}

function capturedArray(records: readonly JsonRecord[]): DockerCapturedJson {
  return { text: JSON.stringify(records), truncated: false };
}

export function createProtectedDockerContextInventory(options: ProtectedDockerContextInventoryOptions): ProtectedDockerContextInventory {
  if (!CONTEXT_NAME.test(options.contextName)) throw new Error("Docker context name is not explicit and bounded");
  const ownerId = dockerOwnerId(options.endpoint, options.daemonId);
  const command = (...argv: string[]) => ["docker", "--context", options.contextName, ...argv];

  async function execute(argv: readonly string[]): Promise<DockerCapturedJson> {
    const result = await options.runner(argv);
    if (result.exitCode !== 0) throw new Error(`Docker owner command exited ${result.exitCode}`);
    if (typeof result.stdout?.truncated !== "boolean" || typeof result.stdout.text !== "string") {
      throw new Error("Docker runner omitted complete output status");
    }
    if (result.stdout.truncated) throw new Error("Docker owner output was truncated");
    return result.stdout;
  }

  async function assertPinnedDaemon(): Promise<void> {
    const contexts = parseDockerInspectArray(await execute(["docker", "context", "inspect", options.contextName]));
    if (contexts.length !== 1 || contexts[0]?.Name !== options.contextName) throw new Error("Docker context identity changed");
    const endpoints = contexts[0].Endpoints;
    if (!isRecord(endpoints) || !isRecord(endpoints.docker) || endpoints.docker.Host !== options.endpoint) {
      throw new Error("Docker context endpoint changed");
    }
    const info = parseDockerJsonObject(await execute(command("info", "--format", "{{json .}}")));
    if (info.ID !== options.daemonId) throw new Error("Docker daemon identity changed");
  }

  async function inspectAll(kind: "network" | "volume", fullIds: readonly string[]): Promise<JsonRecord[]> {
    const records: JsonRecord[] = [];
    for (let offset = 0; offset < fullIds.length; offset += INSPECT_BATCH) {
      const batch = fullIds.slice(offset, offset + INSPECT_BATCH);
      const inspected = parseDockerInspectArray(await execute(command(kind, "inspect", ...batch)));
      if (inspected.length !== batch.length) throw new Error(`Docker ${kind} inspect omitted a listed resource`);
      const expected = new Set(batch);
      for (const entry of inspected) {
        const id = requiredString(entry, kind === "network" ? "Id" : "Name", kind === "network" ? 64 : 255);
        if (!expected.delete(id)) throw new Error(`Docker ${kind} inspect returned an unexpected resource`);
        records.push(entry);
      }
    }
    return records;
  }

  function networkIds(list: DockerCapturedJson): string[] {
    const entries = parseDockerJsonLines(list);
    const seen = new Set<string>();
    for (const entry of entries) {
      const id = requiredString(entry, "ID", 64);
      if (!FULL_NETWORK_ID.test(id) || seen.has(id)) throw new Error("Docker network list lacks unique full IDs");
      seen.add(id);
    }
    return [...seen];
  }

  function volumeNames(list: DockerCapturedJson): string[] {
    const entries = parseDockerJsonLines(list);
    const seen = new Set<string>();
    for (const entry of entries) {
      const name = requiredString(entry, "Name", 255);
      if (!VOLUME_NAME.test(name) || seen.has(name)) throw new Error("Docker volume list lacks unique full names");
      seen.add(name);
    }
    return [...seen];
  }

  async function listNetworks(): Promise<RegistryAdapterResourceTarget[]> {
    await assertPinnedDaemon();
    const list = await execute(command("network", "ls", "--no-trunc", "--format", "json"));
    const inspected = await inspectAll("network", networkIds(list));
    return parseDisconnectedDockerNetworks(list, capturedArray(inspected), ownerId);
  }

  async function lookupNetwork(reviewed: RegistryTarget): Promise<RegistryAdapterResourceTarget | null> {
    const id = exactTargetId(reviewed, ownerId, "network");
    if (!id) return null;
    await assertPinnedDaemon();
    const filtered = await execute(command("network", "ls", "--filter", `id=${id}`, "--no-trunc", "--format", "json"));
    const entries = parseDockerJsonLines(filtered).filter((entry) => entry.ID === id);
    if (entries.length === 0) return null;
    if (entries.length !== 1) throw new Error("Docker targeted network list is ambiguous");
    const [inspected] = await inspectAll("network", [id]);
    if (!inspected) return null;
    return parseDisconnectedDockerNetworks(capturedLines(entries), capturedArray([inspected]), ownerId)[0] ?? null;
  }

  async function listVolumes(): Promise<RegistryAdapterResourceTarget[]> {
    await assertPinnedDaemon();
    const list = await execute(command("volume", "ls", "--filter", "dangling=true", "--format", "json"));
    const inspected = await inspectAll("volume", volumeNames(list));
    return parseUnreferencedDockerVolumes(list, capturedArray(inspected), ownerId);
  }

  async function lookupVolume(reviewed: RegistryTarget): Promise<RegistryAdapterResourceTarget | null> {
    const name = exactTargetId(reviewed, ownerId, "volume");
    if (!name) return null;
    await assertPinnedDaemon();
    const filtered = await execute(command("volume", "ls", "--filter", "dangling=true", "--filter", `name=${name}`, "--format", "json"));
    const entries = parseDockerJsonLines(filtered).filter((entry) => entry.Name === name);
    if (entries.length === 0) return null;
    if (entries.length !== 1) throw new Error("Docker targeted volume list is ambiguous");
    const [inspected] = await inspectAll("volume", [name]);
    if (!inspected) return null;
    return parseUnreferencedDockerVolumes(capturedLines(entries), capturedArray([inspected]), ownerId)[0] ?? null;
  }

  return {
    ownerId,
    selectorAdapters: {
      "docker.networks.unused": { list: async () => listNetworks(), lookup: async (_rule, reviewed) => lookupNetwork(reviewed) },
      "docker.volumes.unused": { list: async () => listVolumes(), lookup: async (_rule, reviewed) => lookupVolume(reviewed) },
    },
  };
}
