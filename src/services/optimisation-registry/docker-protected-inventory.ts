import { createHash } from "node:crypto";
import type { RegistryAdapterResourceTarget } from "./types";

// These parsers only transform bounded, already-captured Docker JSON. They do
// not contact an engine and intentionally expose no removal operation.
export const DOCKER_INVENTORY_MAX_BYTES = 2 * 1024 * 1024;
export const DOCKER_INVENTORY_MAX_RECORDS = 512;
const MAX_LABELS = 64;
const MAX_LABEL_TEXT = 1024;
const FULL_NETWORK_ID = /^[a-f0-9]{64}$/;
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;
const OWNER_ID = /^docker:[a-f0-9]{64}$/;

type JsonRecord = Record<string, unknown>;

export interface DockerCapturedJson {
  text: string;
  // The caller must set this when its bounded process runner cut off output.
  // A syntactically complete prefix of JSON is otherwise indistinguishable
  // from a complete inventory.
  truncated: boolean;
}

export function dockerOwnerId(endpoint: string, daemonId: string): string {
  if (!endpoint || !daemonId || endpoint.length > 2048 || daemonId.length > 256) {
    throw new Error("Docker endpoint and daemon identity are required");
  }
  return `docker:${digest(["docker-owner-v1", endpoint, daemonId])}`;
}

export function safeDockerDisplay(value: string, maximumLength = 160): string {
  if (!Number.isSafeInteger(maximumLength) || maximumLength < 1 || maximumLength > 1024) {
    throw new Error("invalid Docker display bound");
  }
  const safe = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x2028 && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069)
      ? "�"
      : character;
  }).join("");
  return safe.length > maximumLength ? `${safe.slice(0, maximumLength - 1)}…` : safe;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function dockerStableFingerprint(value: unknown): string {
  return digest(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(record: JsonRecord, key: string, maximumLength = 1024): string {
  const value = record[key];
  if (typeof value !== "string" || !value || value.length > maximumLength) throw new Error(`invalid Docker ${key}`);
  return value;
}

function labels(record: JsonRecord): Record<string, string> {
  const value = record.Labels;
  if (value === null || value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > MAX_LABELS) throw new Error("invalid Docker labels");
  const result = Object.create(null) as Record<string, string>;
  for (const [key, labelValue] of Object.entries(value)) {
    if (!key || key.length > MAX_LABEL_TEXT || typeof labelValue !== "string" || labelValue.length > MAX_LABEL_TEXT) {
      throw new Error("invalid Docker label entry");
    }
    result[key] = labelValue;
  }
  return result;
}

function checkedText(captured: DockerCapturedJson): string {
  if (typeof captured.text !== "string" || typeof captured.truncated !== "boolean") {
    throw new Error("Docker inventory capture lacks complete output status");
  }
  if (captured.truncated) throw new Error("Docker inventory output was truncated");
  if (captured.text.length > DOCKER_INVENTORY_MAX_BYTES) throw new Error("Docker inventory output exceeds byte bound");
  const bytes = new TextEncoder().encode(captured.text).byteLength;
  if (bytes > DOCKER_INVENTORY_MAX_BYTES) throw new Error("Docker inventory output exceeds byte bound");
  return captured.text;
}

export function parseDockerInspectArray(captured: DockerCapturedJson): JsonRecord[] {
  const text = checkedText(captured);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("malformed Docker inspect JSON");
  }
  if (!Array.isArray(parsed) || parsed.length > DOCKER_INVENTORY_MAX_RECORDS || !parsed.every(isRecord)) {
    throw new Error("Docker inspect output is not a bounded object array");
  }
  return parsed;
}

export function parseDockerJsonObject(captured: DockerCapturedJson): JsonRecord {
  const text = checkedText(captured);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("malformed Docker object JSON");
  }
  if (!isRecord(parsed)) throw new Error("Docker JSON output is not an object");
  return parsed;
}

export function parseDockerJsonLines(captured: DockerCapturedJson): JsonRecord[] {
  const text = checkedText(captured);
  if (!text.trim()) return [];
  if (!text.endsWith("\n")) throw new Error("Docker JSON-lines output is missing its final newline");
  const lines = text.trimEnd().split("\n");
  if (lines.length > DOCKER_INVENTORY_MAX_RECORDS) throw new Error("Docker inventory exceeds record bound");
  const result: JsonRecord[] = [];
  for (const line of lines) {
    if (new TextEncoder().encode(line).byteLength > 16 * 1024) throw new Error("Docker inventory record exceeds byte bound");
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("malformed Docker JSON-lines record");
    }
    if (!isRecord(value)) throw new Error("Docker JSON-lines record is not an object");
    result.push(value);
  }
  return result;
}

function checkedOwnerId(ownerId: string): void {
  if (!OWNER_ID.test(ownerId)) throw new Error("Docker owner ID must identify a pinned daemon");
}

export function makeDockerResourceTarget(
  ownerId: string,
  resourceId: string,
  reviewedState: unknown,
  evidence: readonly string[],
  sizeBytes: number | null = null,
): RegistryAdapterResourceTarget {
  checkedOwnerId(ownerId);
  if (!resourceId || resourceId.length > 512 || !Number.isFinite(sizeBytes ?? 0) || (sizeBytes ?? 0) < 0) {
    throw new Error("invalid Docker resource identity or size");
  }
  return {
    kind: "resource",
    ownerId,
    resourceId,
    fingerprint: digest(["docker-protected-inventory-v1", ownerId, resourceId, reviewedState]),
    sizeBytes,
    evidence,
  };
}

export function parseDisconnectedDockerNetworks(
  networkList: DockerCapturedJson,
  inspect: DockerCapturedJson,
  ownerId: string,
): RegistryAdapterResourceTarget[] {
  checkedOwnerId(ownerId);
  // The list must be produced with `docker network ls --no-trunc --format
  // json`, then every listed full ID inspected. Missing records are a stale
  // or partial inventory, not evidence that a network is disconnected.
  const listEntries = parseDockerJsonLines(networkList);
  const entries = parseDockerInspectArray(inspect);
  const listed = new Map<string, { name: string; driver: string; scope: string }>();
  for (const entry of listEntries) {
    const id = requiredString(entry, "ID", 64);
    if (!FULL_NETWORK_ID.test(id) || listed.has(id)) throw new Error("Docker network list has invalid or duplicate full ID");
    listed.set(id, {
      name: requiredString(entry, "Name", 255),
      driver: requiredString(entry, "Driver", 80),
      scope: requiredString(entry, "Scope", 32),
    });
  }
  const seen = new Set<string>();
  const targets: RegistryAdapterResourceTarget[] = [];
  for (const entry of entries) {
    const id = requiredString(entry, "Id", 64);
    if (!FULL_NETWORK_ID.test(id) || seen.has(id)) throw new Error("Docker network has invalid or duplicate full ID");
    seen.add(id);
    const name = requiredString(entry, "Name", 255);
    const driver = requiredString(entry, "Driver", 80);
    const scope = requiredString(entry, "Scope", 32);
    const listMetadata = listed.get(id);
    if (!listMetadata || listMetadata.name !== name || listMetadata.driver !== driver || listMetadata.scope !== scope) {
      throw new Error("Docker network identity changed between list and inspect");
    }
    const created = requiredString(entry, "Created", 128);
    const currentLabels = labels(entry);
    const containers = entry.Containers;
    if (!isRecord(containers)) throw new Error("Docker network lacks container attachment inventory");
    // Built-in, ingress, global, and attached networks are deliberately not
    // described as disconnected cleanup candidates, even for protected rules.
    if (scope !== "local" || ["bridge", "host", "none", "ingress"].includes(name) || entry.Ingress === true ||
      Object.keys(containers).length > 0) continue;
    const composeProject = currentLabels["com.docker.compose.project"];
    const evidence = [
      `network ${safeDockerDisplay(name)} (${safeDockerDisplay(driver)} driver)`,
      `disconnected; ${Object.keys(currentLabels).length} labels`,
      ...(composeProject ? [`Compose project: ${safeDockerDisplay(composeProject)}`] : []),
    ];
    targets.push(makeDockerResourceTarget(ownerId, `network:${id}`, {
      id, name, driver, scope, created, labels: currentLabels,
      internal: entry.Internal, attachable: entry.Attachable, ingress: entry.Ingress,
      containers,
    }, evidence));
  }
  if (seen.size !== listed.size) throw new Error("Docker network inspect omitted a listed network");
  return targets;
}

export function parseUnreferencedDockerVolumes(
  danglingList: DockerCapturedJson,
  inspect: DockerCapturedJson,
  ownerId: string,
): RegistryAdapterResourceTarget[] {
  checkedOwnerId(ownerId);
  // The list must be produced with `docker volume ls --filter dangling=true
  // --format json`; inspect alone cannot prove that a volume is unreferenced.
  const listEntries = parseDockerJsonLines(danglingList);
  const inspectEntries = parseDockerInspectArray(inspect);
  const listed = new Set<string>();
  const listedMetadata = new Map<string, { driver: string; scope: string }>();
  for (const entry of listEntries) {
    const name = requiredString(entry, "Name", 255);
    if (!VOLUME_NAME.test(name) || listed.has(name)) throw new Error("Docker volume has invalid or duplicate full name");
    listed.add(name);
    listedMetadata.set(name, { driver: requiredString(entry, "Driver", 80), scope: requiredString(entry, "Scope", 32) });
  }
  const seen = new Set<string>();
  const targets: RegistryAdapterResourceTarget[] = [];
  for (const entry of inspectEntries) {
    const name = requiredString(entry, "Name", 255);
    if (!VOLUME_NAME.test(name) || !listed.has(name) || seen.has(name)) {
      throw new Error("Docker volume inspect does not match dangling inventory");
    }
    seen.add(name);
    const driver = requiredString(entry, "Driver", 80);
    const scope = requiredString(entry, "Scope", 32);
    const listMetadata = listedMetadata.get(name);
    if (!listMetadata || listMetadata.driver !== driver || listMetadata.scope !== scope) {
      throw new Error("Docker volume identity changed between list and inspect");
    }
    const created = requiredString(entry, "CreatedAt", 128);
    const mountpoint = requiredString(entry, "Mountpoint", 2048);
    const currentLabels = labels(entry);
    const options = entry.Options;
    if (options !== null && options !== undefined && !isRecord(options)) throw new Error("invalid Docker volume options");
    const composeProject = currentLabels["com.docker.compose.project"];
    const evidence = [
      `volume ${safeDockerDisplay(name)} (${safeDockerDisplay(driver)} driver)`,
      `unreferenced by containers; ${Object.keys(currentLabels).length} labels; data may be unique`,
      ...(composeProject ? [`Compose project: ${safeDockerDisplay(composeProject)}`] : []),
    ];
    targets.push(makeDockerResourceTarget(ownerId, `volume:${name}`, {
      name, driver, scope, created, mountpoint, labels: currentLabels, options: options ?? null,
    }, evidence));
  }
  if (seen.size !== listed.size) throw new Error("Docker volume inspect omitted a dangling volume");
  return targets;
}
