import type { RegistryAdapterResourceTarget, RegistryCandidate, RegistrySelectorAdapter, RegistryTarget } from "./types";
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
const FULL_IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const FULL_CONTAINER_ID = /^[a-f0-9]{64}$/;
const INSPECT_BATCH = 16;
const MAX_IMAGES = 128;
const MAX_CONTAINERS = 128;
const MAX_REFERENCES = 64;

type JsonRecord = Record<string, unknown>;
type ImageMode = "dangling" | "unused";

export interface DockerImageBindingOptions {
  contextName: string;
  endpoint: string;
  daemonId: string;
  runner: DockerPinnedRunner;
}

export interface DockerImageBinding {
  ownerId: string;
  selectorAdapters: Readonly<{
    "docker.images.dangling": RegistrySelectorAdapter;
    "docker.images.unused": RegistrySelectorAdapter;
  }>;
  remove: (candidate: RegistryCandidate) => Promise<{ reclaimedBytes: number | null }>;
  isStillUnused: (ruleId: "docker.image.dangling" | "docker.image.unused", target: RegistryTarget) => Promise<true | string>;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maximumLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid Docker image ${key}`);
  return value;
}

function stringReferences(value: unknown, name: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCES ||
    !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 512) ||
    new Set(value).size !== value.length) throw new Error(`invalid Docker image ${name}`);
  return value;
}

function exactTargetId(target: RegistryTarget, ownerId: string): string | null {
  if (target.kind !== "resource" || target.ownerId !== ownerId || !target.resourceId.startsWith("image:")) return null;
  const imageId = target.resourceId.slice("image:".length);
  return FULL_IMAGE_ID.test(imageId) ? imageId : null;
}

function listedImageIds(captured: DockerCapturedJson): string[] {
  const rows = parseDockerJsonLines(captured);
  const ids = new Set<string>();
  for (const row of rows) {
    const id = requiredString(row, "ID", 71);
    if (!FULL_IMAGE_ID.test(id)) throw new Error("Docker image list lacks full sha256 IDs");
    ids.add(id);
  }
  if (ids.size > MAX_IMAGES) throw new Error("Docker image inventory exceeds safe inspect bound");
  return [...ids];
}

function inspectedImage(entry: JsonRecord): {
  id: string; parent: string | null; tags: string[]; digests: string[];
  created: string; virtualBytes: number;
} {
  const id = requiredString(entry, "Id", 71);
  if (!FULL_IMAGE_ID.test(id)) throw new Error("Docker image inspect lacks a full sha256 ID");
  const created = requiredString(entry, "Created", 128);
  if (!Number.isFinite(Date.parse(created))) throw new Error("Docker image creation time is invalid");
  if (!Number.isSafeInteger(entry.Size) || (entry.Size as number) < 0) throw new Error("Docker image virtual size is invalid");
  const parentValue = entry.Parent;
  if (parentValue !== undefined && typeof parentValue !== "string") throw new Error("Docker image parent is invalid");
  const parent = parentValue && parentValue.length > 0 ? parentValue : null;
  if (parent && !FULL_IMAGE_ID.test(parent)) throw new Error("Docker image parent lacks a full sha256 ID");
  const tags = stringReferences(entry.RepoTags, "tags");
  const digests = stringReferences(entry.RepoDigests, "digests");
  if (tags.some((tag) => tag === "<none>:<none>") || digests.some((digest) => digest.includes("<none>"))) {
    throw new Error("Docker image inspect returned placeholder references");
  }
  return { id, parent, tags, digests, created, virtualBytes: entry.Size as number };
}

function targets(
  inspected: readonly JsonRecord[], selectedIds: ReadonlySet<string>, referencedIds: ReadonlySet<string>,
  ownerId: string, mode: ImageMode,
): RegistryAdapterResourceTarget[] {
  const images = inspected.map(inspectedImage);
  const children = new Set(images.flatMap((image) => image.parent ? [image.parent] : []));
  return images.flatMap((image) => {
    if (!selectedIds.has(image.id) || referencedIds.has(image.id) || children.has(image.id)) return [];
    if (mode === "dangling" ? image.tags.length !== 0 || image.digests.length !== 0 :
      image.tags.length !== 1 || image.digests.length !== 0) return [];
    const evidence = [
      `${mode} image ${safeDockerDisplay(image.id)}`,
      `no container or child-image references; created ${safeDockerDisplay(image.created)}`,
      `virtual size ${image.virtualBytes} bytes; shared layers mean actual reclaim is unknown`,
      ...(image.tags.length === 1 ? [`sole tag ${safeDockerDisplay(image.tags[0]!)}`] : []),
    ];
    return [makeDockerResourceTarget(ownerId, `image:${image.id}`, {
      id: image.id, parent: image.parent, tags: image.tags, digests: image.digests,
      created: image.created, virtualBytes: image.virtualBytes, referenced: false, childReference: false,
    }, evidence)];
  });
}

export function createDockerImageBinding(options: DockerImageBindingOptions): DockerImageBinding {
  if (!CONTEXT_NAME.test(options.contextName)) throw new Error("Docker image context name must be explicit and bounded");
  const ownerId = dockerOwnerId(options.endpoint, options.daemonId);
  const command = (...args: string[]) => ["docker", "--context", options.contextName, ...args];

  async function execute(argv: readonly string[]): Promise<DockerCapturedJson> {
    const result = await options.runner(argv);
    if (result.exitCode !== 0) throw new Error(`Docker owner command exited ${result.exitCode}`);
    if (typeof result.stdout?.text !== "string" || typeof result.stdout.truncated !== "boolean") {
      throw new Error("Docker image runner omitted complete output status");
    }
    if (result.stdout.truncated) throw new Error("Docker image owner output was truncated");
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

  async function inspectImages(ids: readonly string[]): Promise<JsonRecord[]> {
    if (ids.length > MAX_IMAGES) throw new Error("Docker image inspect exceeds safe bound");
    const records: JsonRecord[] = [];
    for (let offset = 0; offset < ids.length; offset += INSPECT_BATCH) {
      const batch = ids.slice(offset, offset + INSPECT_BATCH);
      const inspected = parseDockerInspectArray(await execute(command("image", "inspect", ...batch)));
      if (inspected.length !== batch.length) throw new Error("Docker image inspect omitted a listed ID");
      const expected = new Set(batch);
      for (const entry of inspected) {
        const id = requiredString(entry, "Id", 71);
        if (!FULL_IMAGE_ID.test(id) || !expected.delete(id)) throw new Error("Docker image inspect returned an unexpected ID");
        records.push(entry);
      }
    }
    return records;
  }

  async function referencedImageIds(): Promise<Set<string>> {
    const rows = parseDockerJsonLines(await execute(command("container", "ls", "--all", "--no-trunc", "--format", "json")));
    const ids = rows.map((row) => requiredString(row, "ID", 64));
    if (ids.length > MAX_CONTAINERS || new Set(ids).size !== ids.length || ids.some((id) => !FULL_CONTAINER_ID.test(id))) {
      throw new Error("Docker container reference list exceeds safe bound or lacks full IDs");
    }
    const references = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += INSPECT_BATCH) {
      const batch = ids.slice(offset, offset + INSPECT_BATCH);
      const inspected = parseDockerInspectArray(await execute(command("container", "inspect", ...batch)));
      if (inspected.length !== batch.length) throw new Error("Docker container reference inspect omitted a listed ID");
      const expected = new Set(batch);
      for (const entry of inspected) {
        const containerId = requiredString(entry, "Id", 64);
        const imageId = requiredString(entry, "Image", 71);
        if (!FULL_CONTAINER_ID.test(containerId) || !expected.delete(containerId) || !FULL_IMAGE_ID.test(imageId)) {
          throw new Error("Docker container reference inspect returned an unexpected identity");
        }
        references.add(imageId);
      }
    }
    return references;
  }

  async function inventory(mode: ImageMode, onlyId?: string): Promise<RegistryAdapterResourceTarget[]> {
    await assertPinnedDaemon();
    const allIds = listedImageIds(await execute(command("image", "ls", "--all", "--no-trunc", "--format", "json")));
    const selectedIds = mode === "dangling"
      ? listedImageIds(await execute(command("image", "ls", "--all", "--filter", "dangling=true", "--no-trunc", "--format", "json")))
      : allIds;
    if (selectedIds.some((id) => !allIds.includes(id))) throw new Error("Docker dangling image list changed during inventory");
    if (onlyId && !selectedIds.includes(onlyId)) return [];
    const allInspect = await inspectImages(allIds);
    const containerRefs = await referencedImageIds();
    return targets(allInspect, new Set(onlyId ? [onlyId] : selectedIds), containerRefs, ownerId, mode);
  }

  async function lookup(mode: ImageMode, reviewed: RegistryTarget): Promise<RegistryAdapterResourceTarget | null> {
    const id = exactTargetId(reviewed, ownerId);
    if (!id) return null;
    return (await inventory(mode, id))[0] ?? null;
  }

  async function isStillUnused(ruleId: "docker.image.dangling" | "docker.image.unused", target: RegistryTarget): Promise<true | string> {
    try {
      const live = await lookup(ruleId === "docker.image.dangling" ? "dangling" : "unused", target);
      return live && target.kind === "resource" && live.fingerprint === target.fingerprint
        ? true : "Docker image disappeared, gained a reference, or changed its tag state";
    } catch (error) {
      return error instanceof Error ? safeDockerDisplay(error.message) : "Docker image state cannot be verified";
    }
  }

  async function remove(candidate: RegistryCandidate): Promise<{ reclaimedBytes: number | null }> {
    if ((candidate.ruleId !== "docker.image.dangling" && candidate.ruleId !== "docker.image.unused") ||
      candidate.tier !== "review" || candidate.action.kind !== "adapter" ||
      candidate.action.adapterId !== "docker.image.remove_selected") {
      throw new Error("Docker image action is not bound to a reviewed owner rule");
    }
    const id = exactTargetId(candidate.target, ownerId);
    if (!id || candidate.target.kind !== "resource") throw new Error("Docker image target lacks a pinned full ID");
    const mode = candidate.ruleId === "docker.image.dangling" ? "dangling" : "unused";
    const live = await lookup(mode, candidate.target);
    if (!live || live.fingerprint !== candidate.target.fingerprint) throw new Error("Docker image changed or became referenced since review");
    // Important publication blocker: Docker exposes no tag-fingerprint
    // precondition on image deletion. A new sole tag introduced after lookup
    // can still be removed by this exact-ID command. Keep this adapter
    // unbound/proposed until that owner race is explicitly accepted or solved.
    // --no-prune prevents Docker's otherwise implicit deletion of untagged
    // parent images. No force, image-prune, shell expansion, or bulk selector.
    await execute(command("image", "rm", "--no-prune", id));
    return { reclaimedBytes: null };
  }

  return {
    ownerId,
    selectorAdapters: {
      "docker.images.dangling": { list: async () => inventory("dangling"), lookup: async (_rule, target) => lookup("dangling", target) },
      "docker.images.unused": { list: async () => inventory("unused"), lookup: async (_rule, target) => lookup("unused", target) },
    },
    remove,
    isStillUnused,
  };
}
