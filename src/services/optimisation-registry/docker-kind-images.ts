import { createHash } from "node:crypto";
import type { RegistryAdapterResourceTarget, RegistrySelectorAdapter, RegistryTarget } from "./types";
import type { DockerPinnedRunner } from "./docker-stopped-containers";
import {
  dockerOwnerId,
  makeDockerResourceTarget,
  parseDockerInspectArray,
  parseDockerJsonLines,
  parseDockerJsonObject,
  safeDockerDisplay,
  type DockerCapturedJson,
} from "./docker-protected-inventory";

const CONTEXT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const FULL_NODE_ID = /^[a-f0-9]{64}$/;
const FULL_IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const TARGET_ID = /^kind-image:([a-f0-9]{64}):(sha256:[a-f0-9]{64})$/;
const MAX_NODES = 8;
const MAX_IMAGES_PER_NODE = 128;
const MAX_REFERENCES = 64;

type JsonRecord = Record<string, unknown>;
type KindImageRecord = {
  id: string; tags: string[]; digests: string[]; virtualBytes: number | null;
};

export interface DockerKindImageOptions {
  contextName: string;
  endpoint: string;
  daemonId: string;
  runner: DockerPinnedRunner;
  // Labels alone can be spoofed. The caller must explicitly approve the
  // exact kind node IDs on which a read-only CRI process may be executed.
  approvedNodes: readonly { nodeId: string; cluster: string }[];
}

export interface DockerKindImageInventory {
  ownerId: string;
  selectorAdapters: Readonly<{ "cluster.images": RegistrySelectorAdapter }>;
  // Protected inventory; intentionally no actionAdapters.
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maximumLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid kind ${key}`);
  return value;
}

function references(value: unknown, name: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCES ||
    !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 512) ||
    new Set(value).size !== value.length) throw new Error(`invalid kind image ${name}`);
  return value;
}

function clusterKey(name: string): string {
  if (!name || name.length > 128) throw new Error("invalid kind cluster identity");
  return createHash("sha256").update(JSON.stringify(["kind-cluster-v1", name])).digest("hex");
}

function imageFromCri(entry: JsonRecord): KindImageRecord {
  const id = requiredString(entry, "id", 71);
  if (!FULL_IMAGE_ID.test(id)) throw new Error("kind CRI image lacks a full sha256 ID");
  const tags = references(entry.repoTags, "tags");
  const digests = references(entry.repoDigests, "digests");
  const size = entry.size;
  if (size !== undefined && size !== null &&
    !(typeof size === "string" && /^\d{1,16}$/.test(size) && Number.isSafeInteger(Number(size))) &&
    !(typeof size === "number" && Number.isSafeInteger(size) && size >= 0)) {
    throw new Error("kind CRI image virtual size is malformed");
  }
  return { id, tags, digests, virtualBytes: typeof size === "string" ? Number(size) : typeof size === "number" ? size : null };
}

function parseCriImages(captured: DockerCapturedJson): KindImageRecord[] {
  const document = parseDockerJsonObject(captured);
  if (!Array.isArray(document.images) || document.images.length > MAX_IMAGES_PER_NODE || !document.images.every(isRecord)) {
    throw new Error("kind CRI image inventory is absent or oversized");
  }
  const images = document.images.map(imageFromCri);
  if (new Set(images.map((image) => image.id)).size !== images.length) throw new Error("kind CRI image inventory duplicates a full ID");
  return images;
}

function targetImageId(target: RegistryTarget, ownerId: string): string | null {
  if (target.kind !== "resource" || target.ownerId !== ownerId) return null;
  return TARGET_ID.test(target.resourceId) ? target.resourceId : null;
}

export function createDockerKindImageInventory(options: DockerKindImageOptions): DockerKindImageInventory {
  if (!CONTEXT_NAME.test(options.contextName)) throw new Error("kind Docker context name must be explicit and bounded");
  if (!Array.isArray(options.approvedNodes) || options.approvedNodes.length < 1 || options.approvedNodes.length > MAX_NODES ||
    options.approvedNodes.some((node) => !FULL_NODE_ID.test(node.nodeId) || !node.cluster || node.cluster.length > 128) ||
    new Set(options.approvedNodes.map((node) => node.nodeId)).size !== options.approvedNodes.length) {
    throw new Error("kind exec requires an explicit bounded allowlist of full node IDs and clusters");
  }
  const approved = new Map(options.approvedNodes.map((node) => [node.nodeId, node.cluster]));
  const ownerId = dockerOwnerId(options.endpoint, options.daemonId);
  const command = (...args: string[]) => ["docker", "--context", options.contextName, ...args];

  async function execute(argv: readonly string[]): Promise<DockerCapturedJson> {
    const result = await options.runner(argv);
    if (result.exitCode !== 0) throw new Error(`kind owner command exited ${result.exitCode}`);
    if (typeof result.stdout?.text !== "string" || typeof result.stdout.truncated !== "boolean") {
      throw new Error("kind runner omitted complete output status");
    }
    if (result.stdout.truncated) throw new Error("kind owner output was truncated");
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

  async function inventory(): Promise<RegistryAdapterResourceTarget[]> {
    await assertPinnedDaemon();
    // Docker's label filter limits the scan before inspect/exec. Only running
    // kind nodes are in container ls's default result set; exact labels and
    // state are independently verified from inspect before read-only exec.
    const listed = parseDockerJsonLines(await execute(command("container", "ls", "--filter", "label=io.x-k8s.kind.cluster", "--no-trunc", "--format", "json")));
    const listedIds = listed.map((row) => requiredString(row, "ID", 64));
    if (listedIds.length > MAX_NODES || listedIds.some((id) => !FULL_NODE_ID.test(id)) || new Set(listedIds).size !== listedIds.length) {
      throw new Error("kind node list exceeds safe bound or lacks unique full IDs");
    }
    const ids = listedIds.filter((id) => approved.has(id));
    const expected = new Set(ids);
    const nodes = ids.length ? parseDockerInspectArray(await execute(command("container", "inspect", ...ids))) : [];
    if (nodes.length !== ids.length) throw new Error("kind node inspect omitted a listed ID");
    const groups = new Map<string, {
      cluster: string; imageId: string;
      observations: { nodeId: string; nodeImage: string; tags: string[]; digests: string[]; virtualBytes: number | null }[];
    }>();
    for (const node of nodes) {
      const id = requiredString(node, "Id", 64);
      if (!FULL_NODE_ID.test(id) || !expected.delete(id)) throw new Error("kind node inspect returned an unexpected ID");
      const config = node.Config;
      const state = node.State;
      if (!isRecord(config) || !isRecord(config.Labels) || !isRecord(state)) throw new Error("kind node owner state is malformed");
      const labels = config.Labels;
      const cluster = requiredString(labels, "io.x-k8s.kind.cluster", 128);
      if (approved.get(id) !== cluster) throw new Error("kind node cluster differs from its explicit approval");
      const role = requiredString(labels, "io.x-k8s.kind.role", 64);
      if (!["control-plane", "worker"].includes(role) || state.Running !== true ||
        state.Paused !== false || state.Restarting !== false) throw new Error("kind node is not an active recognized cluster node");
      const nodeImage = requiredString(node, "Image", 71);
      if (!FULL_IMAGE_ID.test(nodeImage)) throw new Error("kind node's Docker image identity is malformed");
      const criImages = parseCriImages(await execute(command("container", "exec", id, "crictl", "images", "-o", "json")));
      for (const image of criImages) {
        const resourceId = `kind-image:${clusterKey(cluster)}:${image.id}`;
        const group = groups.get(resourceId);
        const observation = {
          nodeId: id, nodeImage, tags: image.tags, digests: image.digests, virtualBytes: image.virtualBytes,
        };
        if (group) {
          group.observations.push(observation);
        } else {
          groups.set(resourceId, { cluster, imageId: image.id, observations: [observation] });
        }
      }
    }
    const targets: RegistryAdapterResourceTarget[] = [];
    for (const [resourceId, group] of groups) {
      const observations = group.observations.slice().sort((left, right) => left.nodeId.localeCompare(right.nodeId));
      const evidence = [
        `kind cluster ${safeDockerDisplay(group.cluster)}: image ${safeDockerDisplay(group.imageId)}`,
        `present in ${observations.length} node(s); nested containerd storage, not the host Docker image store`,
        `virtual size per node is not counted as reclaimable bytes`,
      ];
      targets.push(makeDockerResourceTarget(ownerId, resourceId, {
        cluster: group.cluster, imageId: group.imageId, observations,
      }, evidence));
    }
    return targets;
  }

  async function lookup(reviewed: RegistryTarget): Promise<RegistryAdapterResourceTarget | null> {
    const id = targetImageId(reviewed, ownerId);
    if (!id) return null;
    return (await inventory()).find((target) => target.resourceId === id) ?? null;
  }

  return {
    ownerId,
    selectorAdapters: {
      "cluster.images": { list: async () => inventory(), lookup: async (_rule, reviewed) => lookup(reviewed) },
    },
  };
}
