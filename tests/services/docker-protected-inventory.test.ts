import { describe, expect, test } from "bun:test";
import {
  DOCKER_INVENTORY_MAX_BYTES,
  DOCKER_INVENTORY_MAX_RECORDS,
  dockerOwnerId,
  parseDisconnectedDockerNetworks as parseNetworkInventory,
  parseDockerInspectArray,
  parseDockerJsonLines,
  parseUnreferencedDockerVolumes,
  safeDockerDisplay,
} from "../../src/services/optimisation-registry/docker-protected-inventory";

const ownerId = dockerOwnerId("unix:///isolated/docker.sock", "daemon-fixture-1");
const networkId = "a".repeat(64);

function network(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Id: networkId,
    Name: "sandbox_net",
    Driver: "bridge",
    Scope: "local",
    Created: "2026-09-15T00:00:00Z",
    Containers: {},
    Labels: { "com.docker.compose.project": "sandbox" },
    Internal: false,
    Attachable: false,
    Ingress: false,
    ...overrides,
  };
}

function volume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Name: "sandbox_data",
    Driver: "local",
    Scope: "local",
    CreatedAt: "2026-09-15T00:00:00Z",
    Mountpoint: "/var/lib/docker/volumes/sandbox_data/_data",
    Labels: { "com.docker.compose.project": "sandbox" },
    Options: {},
    ...overrides,
  };
}

function capturedArray(entries: unknown[]): { text: string; truncated: boolean } {
  return { text: JSON.stringify(entries), truncated: false };
}

function networkList(entries: Record<string, unknown>[]): { text: string; truncated: boolean } {
  return { text: entries.map((entry) => JSON.stringify({
    ID: entry.Id, Name: entry.Name, Driver: entry.Driver, Scope: entry.Scope,
  })).join("\n") + (entries.length ? "\n" : ""), truncated: false };
}

function parseDisconnectedDockerNetworks(inspect: { text: string; truncated: boolean }, pinnedOwnerId: string) {
  const entries = JSON.parse(inspect.text) as Record<string, unknown>[];
  return parseNetworkInventory(networkList(entries), inspect, pinnedOwnerId);
}

function danglingLine(name = "sandbox_data", driver = "local", scope = "local"): { text: string; truncated: boolean } {
  return { text: `${JSON.stringify({ Name: name, Driver: driver, Scope: scope })}\n`, truncated: false };
}

function hasUnsafeDisplay(text: string): boolean {
  return Array.from(text).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x2028 && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069);
  });
}

describe("pure protected Docker inventories", () => {
  test("pins a daemon without exposing its endpoint and sanitizes display data", () => {
    expect(ownerId).toMatch(/^docker:[a-f0-9]{64}$/);
    expect(ownerId).not.toContain("docker.sock");
    expect(dockerOwnerId("unix:///isolated/docker.sock", "daemon-fixture-1")).toBe(ownerId);
    expect(dockerOwnerId("unix:///isolated/docker.sock", "daemon-fixture-2")).not.toBe(ownerId);
    expect(hasUnsafeDisplay(safeDockerDisplay("evil\u001b[31m\n\u202Ename"))).toBe(false);
  });

  test("networks use full engine IDs and stable, state-sensitive fingerprints", () => {
    const first = parseDisconnectedDockerNetworks(capturedArray([network()]), ownerId);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "resource", ownerId, resourceId: `network:${networkId}`, sizeBytes: null,
    });
    const reordered = parseDisconnectedDockerNetworks(capturedArray([network({
      Labels: { z: "other", "com.docker.compose.project": "sandbox" },
    })]), ownerId);
    const sameReordered = parseDisconnectedDockerNetworks(capturedArray([network({
      Labels: { "com.docker.compose.project": "sandbox", z: "other" },
    })]), ownerId);
    expect(reordered[0]?.fingerprint).toBe(sameReordered[0]?.fingerprint);
    expect(reordered[0]?.fingerprint).not.toBe(first[0]?.fingerprint);
    const renamed = parseDisconnectedDockerNetworks(capturedArray([network({ Name: "other_net" })]), ownerId);
    expect(renamed[0]?.fingerprint).not.toBe(first[0]?.fingerprint);
  });

  test("excludes attached, built-in, ingress, and nonlocal networks", () => {
    const entries = [
      network({ Containers: { endpoint: { Name: "container" } } }),
      network({ Id: "b".repeat(64), Name: "bridge" }),
      network({ Id: "c".repeat(64), Ingress: true }),
      network({ Id: "d".repeat(64), Scope: "swarm" }),
    ];
    expect(parseDisconnectedDockerNetworks(capturedArray(entries), ownerId)).toEqual([]);
  });

  test("rejects short IDs, duplicate IDs, and missing attachment state", () => {
    expect(() => parseDisconnectedDockerNetworks(capturedArray([network({ Id: "a".repeat(12) })]), ownerId)).toThrow("full ID");
    expect(() => parseDisconnectedDockerNetworks(capturedArray([network(), network({ Name: "duplicate" })]), ownerId)).toThrow("duplicate full ID");
    expect(() => parseDisconnectedDockerNetworks(capturedArray([network({ Containers: null })]), ownerId)).toThrow("attachment inventory");
  });

  test("rejects incomplete or changed network list/inspect pairs", () => {
    expect(() => parseNetworkInventory(networkList([network()]), capturedArray([]), ownerId)).toThrow("omitted");
    expect(() => parseNetworkInventory(networkList([network({ Name: "old" })]), capturedArray([network()]), ownerId)).toThrow("identity changed");
    expect(() => parseNetworkInventory({ text: "", truncated: false }, capturedArray([network()]), ownerId)).toThrow("identity changed");
  });

  test("does not print untrusted label escapes or mutate object prototypes", () => {
    const labels = Object.fromEntries([
      ["com.docker.compose.project", "name\u001b[2J\nsecond"],
      ["__proto__", "polluted"],
    ]);
    const [target] = parseDisconnectedDockerNetworks(capturedArray([network({ Labels: labels })]), ownerId);
    expect(hasUnsafeDisplay(target?.evidence?.join(" ") ?? "")).toBe(false);
    expect(target?.evidence?.join(" ")).toContain("name�[2J�second");
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  test("volumes require a complete dangling list matched to full inspect state", () => {
    const [target] = parseUnreferencedDockerVolumes(danglingLine(), capturedArray([volume()]), ownerId);
    expect(target).toMatchObject({
      kind: "resource", ownerId, resourceId: "volume:sandbox_data", sizeBytes: null,
    });
    expect(target?.evidence?.join(" ")).toContain("data may be unique");
    expect(target?.evidence?.join(" ")).not.toContain("/var/lib/docker");
    const newer = parseUnreferencedDockerVolumes(danglingLine(), capturedArray([volume({ CreatedAt: "2026-09-16T00:00:00Z" })]), ownerId);
    expect(newer[0]?.fingerprint).not.toBe(target?.fingerprint);
    const relabeled = parseUnreferencedDockerVolumes(danglingLine(), capturedArray([volume({ Labels: { owner: "other" } })]), ownerId);
    expect(relabeled[0]?.fingerprint).not.toBe(target?.fingerprint);
  });

  test("rejects mismatched, omitted, duplicate, and changed volume inventories", () => {
    expect(() => parseUnreferencedDockerVolumes(danglingLine("other_data"), capturedArray([volume()]), ownerId)).toThrow("does not match");
    expect(() => parseUnreferencedDockerVolumes(danglingLine(), capturedArray([]), ownerId)).toThrow("omitted");
    expect(() => parseUnreferencedDockerVolumes(danglingLine("sandbox_data", "other"), capturedArray([volume()]), ownerId)).toThrow("identity changed");
    const duplicateList = { text: `${danglingLine().text}${danglingLine().text}`, truncated: false };
    expect(() => parseUnreferencedDockerVolumes(duplicateList, capturedArray([volume()]), ownerId)).toThrow("duplicate full name");
  });

  test("fails closed on malformed, oversized, or runner-truncated JSON", () => {
    expect(() => parseDockerInspectArray({ text: "[{", truncated: false })).toThrow("malformed");
    expect(() => parseDockerJsonLines({ text: "{}", truncated: false })).toThrow("final newline");
    expect(() => parseDockerJsonLines({ text: "{oops}\n", truncated: false })).toThrow("malformed");
    expect(() => parseDockerInspectArray({ text: "[]", truncated: true })).toThrow("truncated");
    expect(() => parseDockerJsonLines({ text: "", truncated: true })).toThrow("truncated");
    expect(() => parseDockerInspectArray({ text: "[]" } as { text: string; truncated: boolean })).toThrow("complete output status");
    expect(() => parseDockerInspectArray({ text: "x".repeat(DOCKER_INVENTORY_MAX_BYTES + 1), truncated: false })).toThrow("byte bound");
    const tooMany = Array.from({ length: DOCKER_INVENTORY_MAX_RECORDS + 1 }, () => ({}));
    expect(() => parseDockerInspectArray(capturedArray(tooMany))).toThrow("bounded object array");
    expect(() => parseDockerJsonLines({ text: tooMany.map(() => "{}").join("\n") + "\n", truncated: false })).toThrow("record bound");
  });
});
