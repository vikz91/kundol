import {
  dockerOwnerId, parseDockerInspectArray, parseDockerJsonObject, safeDockerDisplay,
} from "./docker-protected-inventory";
import type { DockerPinnedRunner } from "./docker-stopped-containers";

export interface PinnedDockerContextIdentity {
  contextName: string;
  endpoint: string;
  daemonId: string;
  ownerId: string;
  displayEndpoint: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Docker context endpoint is incomplete");
  return value as Record<string, unknown>;
}

function safeEndpointDisplay(endpoint: string): string {
  // Keep the transport and host visible while withholding user-info and
  // local socket paths that may disclose personal directories.
  try {
    const parsed = new URL(endpoint);
    if (["tcp:", "ssh:"].includes(parsed.protocol)) {
      return safeDockerDisplay(`${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`);
    }
    return safeDockerDisplay(`${parsed.protocol}//(local socket)`);
  } catch {
    return "(endpoint hidden; owner identity pinned)";
  }
}

async function capture(runner: DockerPinnedRunner, argv: readonly string[]) {
  const result = await runner(argv);
  if (result.exitCode !== 0) throw new Error("Docker context identity command failed");
  if (result.stdout.truncated) throw new Error("Docker context identity output was truncated");
  return result.stdout;
}

export async function resolvePinnedDockerContextIdentity(
  contextName: string, runner: DockerPinnedRunner,
): Promise<PinnedDockerContextIdentity> {
  const contexts = parseDockerInspectArray(await capture(runner, ["docker", "context", "inspect", contextName]));
  if (contexts.length !== 1 || contexts[0]?.Name !== contextName) throw new Error("Docker context name changed");
  const host = record(record(contexts[0].Endpoints).docker).Host;
  if (typeof host !== "string" || !host || host.length > 2048) throw new Error("Docker context endpoint is missing");
  const info = parseDockerJsonObject(await capture(runner, ["docker", "--context", contextName, "info", "--format", "{{json .}}"]));
  const daemonId = info.ID;
  if (typeof daemonId !== "string" || !daemonId || daemonId.length > 256) throw new Error("Docker daemon ID is missing");
  return {
    contextName, endpoint: host, daemonId, ownerId: dockerOwnerId(host, daemonId),
    displayEndpoint: safeEndpointDisplay(host),
  };
}
