import { createHash } from "node:crypto";
import type { RegistryAdapterResourceTarget } from "./types";
import {
  makeDockerResourceTarget, parseDockerJsonLines, safeDockerDisplay,
  type DockerCapturedJson,
} from "./docker-protected-inventory";

const DOCKER_OWNER = /^docker:[a-f0-9]{64}$/;
const BUILDER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const CACHE_ID = /^[a-z0-9]{12,128}$/;
const MAX_PARENTS = 64;
const MINIMUM_AGE_HOURS = 48;

type JsonRecord = Record<string, unknown>;

/** This is externally verified identity, not a guess from current buildx use. */
export interface BuildkitBuilderIdentity {
  dockerOwnerId: string;
  builderName: string;
  driver: "docker" | "docker-container";
  endpoint: string;
  // Docker daemon ID for the docker driver, full builder-container ID for
  // docker-container. The caller must verify it before list and lookup.
  instanceId: string;
}

export interface BuildkitDuParseOptions {
  captured: DockerCapturedJson;
  builder: BuildkitBuilderIdentity;
  now: Date;
  minimumAgeHours?: number;
}

function requiredString(record: JsonRecord, key: string, maximumLength: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid BuildKit ${key}`);
  return value;
}

function cacheSize(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("BuildKit cache size is not a bounded exact byte count");
  }
  return Number(value);
}

function cacheParents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_PARENTS ||
    !value.every((item) => typeof item === "string" && CACHE_ID.test(item)) ||
    new Set(value).size !== value.length) throw new Error("BuildKit cache parents are malformed");
  return value;
}

function builderKey(builder: BuildkitBuilderIdentity): string {
  if (!DOCKER_OWNER.test(builder.dockerOwnerId) || !BUILDER_NAME.test(builder.builderName) ||
    !builder.endpoint || builder.endpoint.length > 2048 || !builder.instanceId || builder.instanceId.length > 256 ||
    (builder.driver === "docker-container" && !/^[a-f0-9]{64}$/.test(builder.instanceId))) {
    throw new Error("BuildKit builder identity is not explicit, immutable, and bounded");
  }
  return createHash("sha256").update(JSON.stringify([
    "buildkit-builder-v1", builder.dockerOwnerId, builder.builderName, builder.driver,
    builder.endpoint, builder.instanceId,
  ])).digest("hex");
}

/**
 * Parse the official `docker buildx du --builder NAME --format=json` NDJSON.
 * No Docker command, builder discovery, or prune operation is provided here.
 */
export function parseBuildkitDu(options: BuildkitDuParseOptions): RegistryAdapterResourceTarget[] {
  const key = builderKey(options.builder);
  if (!(options.now instanceof Date) || !Number.isFinite(options.now.getTime()) ||
    !Number.isSafeInteger(options.minimumAgeHours ?? MINIMUM_AGE_HOURS) ||
    (options.minimumAgeHours ?? MINIMUM_AGE_HOURS) < MINIMUM_AGE_HOURS ||
    (options.minimumAgeHours ?? MINIMUM_AGE_HOURS) > 8760) {
    throw new Error("BuildKit cache clock/age policy is invalid");
  }
  const minimumAgeMs = (options.minimumAgeHours ?? MINIMUM_AGE_HOURS) * 3_600_000;
  const rows = parseDockerJsonLines(options.captured);
  const seen = new Set<string>();
  const targets: RegistryAdapterResourceTarget[] = [];
  for (const row of rows) {
    const id = requiredString(row, "ID", 128);
    if (!CACHE_ID.test(id) || seen.has(id)) throw new Error("BuildKit du lacks unique full opaque cache IDs");
    seen.add(id);
    const created = requiredString(row, "CreatedAt", 128);
    const lastUsed = requiredString(row, "LastUsedAt", 128);
    const createdMs = Date.parse(created);
    const lastUsedMs = Date.parse(lastUsed);
    if (!Number.isFinite(createdMs) || !Number.isFinite(lastUsedMs) ||
      createdMs > options.now.getTime() + 300_000 || lastUsedMs > options.now.getTime() + 300_000) {
      throw new Error("BuildKit cache timestamps are malformed or in the future");
    }
    const size = cacheSize(row.Size);
    const parents = cacheParents(row.Parents);
    const type = requiredString(row, "Type", 64);
    const description = requiredString(row, "Description", 2048);
    if (typeof row.Reclaimable !== "boolean" || typeof row.Shared !== "boolean" || typeof row.Mutable !== "boolean" ||
      !Number.isSafeInteger(row.UsageCount) || (row.UsageCount as number) < 0) {
      throw new Error("BuildKit cache owner state is incomplete");
    }
    // Read-only candidates are intentionally narrower than BuildKit's broad
    // GC set: no active, mutable, image-shared, internal/frontend, or cache
    // mount records, and no records used within the last 48 hours.
    if (!row.Reclaimable || row.Shared || row.Mutable ||
      !["regular", "source.local", "source.git.checkout"].includes(type) ||
      options.now.getTime() - lastUsedMs < minimumAgeMs) continue;
    const evidence = [
      `builder ${safeDockerDisplay(options.builder.builderName)} (${safeDockerDisplay(options.builder.driver)})`,
      `cache ${safeDockerDisplay(id)}: ${size} private bytes, last used ${safeDockerDisplay(lastUsed)}`,
      `${safeDockerDisplay(type)}; ${parents.length} parent(s); ${safeDockerDisplay(description)}`,
      `BuildKit garbage collection may regenerate this cache; no prune action is bound`,
    ];
    targets.push(makeDockerResourceTarget(options.builder.dockerOwnerId, `buildkit-cache:${key}:${id}`, {
      builderKey: key, id, created, lastUsed, size, parents, type, description,
      reclaimable: row.Reclaimable, shared: row.Shared, mutable: row.Mutable,
      usageCount: row.UsageCount,
    }, evidence));
  }
  return targets;
}
