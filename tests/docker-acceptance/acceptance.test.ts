import { expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProtectedDockerContextInventory } from "../../src/services/optimisation-registry/docker-context-inventory";
import { createDockerImageBinding } from "../../src/services/optimisation-registry/docker-images";
import { isPinnedDockerArgv } from "../../src/services/optimisation-registry/docker-pinned-runner";
import { createStoppedDockerContainerBinding, type DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";
import type { RegistryAdapterResourceTarget, RegistryAdapterTarget, RegistryCandidate, RegistryResourceTarget, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const CONTEXT = "kundol-private-daemon";
const ENDPOINT = "tcp://daemon:2376";
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const NETWORK_ID = /^[a-f0-9]{64}$/;
const CONTAINER_ID = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const TEST_TIMEOUT_MS = 180_000;
const CERTS = "/certs/client";
const HOME = "/sandbox/home";

type Captured = { text: string; truncated: boolean };

function isolatedEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("DOCKER_")) delete env[key];
  env.HOME = HOME;
  env.TMPDIR = "/sandbox/tmp";
  return env;
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Captured> {
  if (!stream) return { text: "", truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let remaining = maximumBytes;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const kept = value.subarray(0, Math.max(remaining, 0));
      text += decoder.decode(kept, { stream: true });
      remaining -= kept.byteLength;
      if (kept.byteLength !== value.byteLength) truncated = true;
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
}

async function execute(argv: readonly string[], timeoutMs = 20_000): Promise<{ exitCode: number; stdout: Captured }> {
  const proc = Bun.spawn([...argv], {
    cwd: "/sandbox",
    env: isolatedEnvironment(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, timeoutMs);
  try {
    const [stdout, stderr, exited] = await Promise.all([
      readCapped(proc.stdout, MAX_OUTPUT_BYTES),
      readCapped(proc.stderr, 4096),
      proc.exited,
    ]);
    return {
      exitCode: timedOut || stdout.truncated || stderr.truncated ? 124 : exited,
      stdout,
    };
  } finally {
    clearTimeout(timer);
  }
}

function privateDaemonPrerequisites(): void {
  if (process.env.KUNDOL_ACCEPTANCE_INNER !== "isolated-client" ||
    process.env.KUNDOL_EXPECTED_ENDPOINT !== ENDPOINT ||
    process.env.HOME !== HOME ||
    existsSync("/var/run/docker.sock") ||
    !existsSync(`${CERTS}/ca.pem`) || !existsSync(`${CERTS}/cert.pem`) || !existsSync(`${CERTS}/key.pem`)) {
    throw new Error("Private-daemon acceptance isolation prerequisites are absent");
  }
}

async function owner(argv: readonly string[], timeoutMs?: number): Promise<string> {
  if (!isPinnedDockerArgv(argv, CONTEXT)) throw new Error("Acceptance command escaped its pinned private context");
  const result = await execute(argv, timeoutMs);
  if (result.exitCode !== 0 || result.stdout.truncated) throw new Error("Private-daemon acceptance command failed or was truncated");
  return result.stdout.text.trim();
}

const bindingRunner: DockerPinnedRunner = async (argv) => {
  if (!isPinnedDockerArgv(argv, CONTEXT)) throw new Error("Binding command escaped its pinned private context");
  const result = await execute(argv);
  return { ...result, stderr: "Private-daemon Docker command failed" };
};

function command(...args: string[]): string[] {
  return ["docker", "--context", CONTEXT, ...args];
}

async function createPrivateContext(): Promise<string> {
  // Context credentials are generated only in the disposable daemon's named
  // certificate volume, copied read-only into this client, never from the host.
  const dockerEndpoint = `host=${ENDPOINT},ca=${CERTS}/ca.pem,cert=${CERTS}/cert.pem,key=${CERTS}/key.pem`;
  const created = await execute(["docker", "context", "create", CONTEXT, "--docker", dockerEndpoint]);
  if (created.exitCode !== 0 || created.stdout.truncated) throw new Error("Could not create private TLS Docker context");
  const info = JSON.parse(await owner(command("info", "--format", "{{json .}}"))) as { ID?: unknown };
  if (typeof info.ID !== "string" || !info.ID || info.ID.length > 256) throw new Error("Private daemon omitted its stable ID");
  return info.ID;
}

async function makeFixtureImage(tag: string, label: string): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), "kundol-docker-fixture-"));
  await mkdir(fixture, { recursive: true });
  await copyFile("/bin/busybox", join(fixture, "busybox"));
  await writeFile(join(fixture, "Dockerfile"),
    `FROM scratch\nCOPY busybox /busybox\nLABEL kundol.acceptance=${label}\nENTRYPOINT ["/busybox"]\n`);
  await owner(command("build", "--network", "none", "--quiet", "--tag", tag, fixture), 120_000);
  return tag;
}

async function makeDanglingImage(): Promise<string> {
  const fixture = await mkdtemp(join(tmpdir(), "kundol-dangling-fixture-"));
  await copyFile("/bin/busybox", join(fixture, "busybox"));
  const archive = join(fixture, "rootfs.tar");
  const packed = await execute(["tar", "--create", "--file", archive, "--directory", fixture, "busybox"]);
  if (packed.exitCode !== 0 || packed.stdout.truncated) throw new Error("Could not package private dangling-image fixture");
  const id = await owner(command("image", "import", archive), 120_000);
  if (!IMAGE_ID.test(id)) throw new Error("Private daemon did not return a full dangling image ID");
  return id;
}

async function list(selector: RegistrySelectorAdapter): Promise<readonly RegistryAdapterTarget[]> {
  if (typeof selector === "function") throw new Error("Expected exact Docker selector");
  return selector.list({} as Parameters<typeof selector.list>[0], { homeDir: HOME, projectRoots: [] });
}

async function lookup(selector: RegistrySelectorAdapter, target: RegistryResourceTarget): Promise<RegistryAdapterResourceTarget | null> {
  if (typeof selector === "function") throw new Error("Expected exact Docker selector");
  const live = await selector.lookup({} as Parameters<typeof selector.lookup>[0], target, { homeDir: HOME, projectRoots: [] });
  if (live?.kind === "path") throw new Error("Docker selector returned a path target");
  return live;
}

function reviewed(target: RegistryAdapterResourceTarget): RegistryResourceTarget {
  return {
    kind: "resource",
    key: `resource:${JSON.stringify(["docker_context", target.ownerId, target.resourceId])}`,
    ownerId: target.ownerId, resourceId: target.resourceId,
    fingerprint: target.fingerprint, sizeBytes: target.sizeBytes ?? null,
  };
}

function selectedStoppedContainer(target: RegistryResourceTarget): RegistryCandidate {
  return {
    id: `docker.container.stopped@${target.key}`,
    ruleId: "docker.container.stopped",
    categoryId: "containers",
    label: "Stopped Docker container",
    description: "Private-daemon acceptance fixture",
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

function selectedImage(target: RegistryResourceTarget, ruleId: "docker.image.dangling" | "docker.image.unused"): RegistryCandidate {
  return {
    id: `${ruleId}@${target.key}`,
    ruleId,
    categoryId: "containers",
    label: "Docker image",
    description: "Private-daemon acceptance fixture",
    scope: "docker_context",
    status: "proposed",
    tier: "review",
    forceEligible: false,
    action: { kind: "adapter", adapterId: "docker.image.remove_selected" },
    target,
    evidence: [],
    sources: [],
  };
}

const acceptanceTest = process.env.KUNDOL_ACCEPTANCE_INNER === "isolated-client" ? test : test.skip;

acceptanceTest("private TLS daemon: protected inventories and exact stopped-container action", async () => {
  privateDaemonPrerequisites();
  const daemonId = await createPrivateContext();
  const image = await makeFixtureImage("kundol-acceptance-busybox:local", "active");
  const unusedImage = await makeFixtureImage("kundol-acceptance-unused:local", "unused");
  const unusedImageId = await owner(command("image", "inspect", "--format", "{{.Id}}", unusedImage));
  expect(unusedImageId).toMatch(IMAGE_ID);
  const danglingImageId = await makeDanglingImage();
  const unusedNetwork = "kundol_accept_unused_net";
  const attachedNetwork = "kundol_accept_attached_net";
  const unusedVolume = "kundol_accept_unused_vol";
  const attachedVolume = "kundol_accept_attached_vol";
  const networkId = await owner(command("network", "create", unusedNetwork));
  expect(networkId).toMatch(NETWORK_ID);
  await owner(command("network", "create", attachedNetwork));
  await owner(command("volume", "create", unusedVolume));
  await owner(command("volume", "create", attachedVolume));

  const activeId = await owner(command("container", "create", "--name", "kundol_accept_active",
    "--network", attachedNetwork, "--mount", `type=volume,source=${attachedVolume},target=/data`, image, "sleep", "300"));
  expect(activeId).toMatch(CONTAINER_ID);
  await owner(command("container", "start", activeId));

  const stoppedId = await owner(command("container", "create", "--name", "kundol_accept_stopped", image, "true"));
  expect(stoppedId).toMatch(CONTAINER_ID);
  await owner(command("container", "start", stoppedId));
  expect(await owner(command("container", "wait", stoppedId))).toBe("0");

  const inventory = createProtectedDockerContextInventory({ contextName: CONTEXT, endpoint: ENDPOINT, daemonId, runner: bindingRunner });
  expect("actionAdapters" in inventory).toBe(false);
  expect(Object.keys(inventory.selectorAdapters).sort()).toEqual(["docker.networks.unused", "docker.volumes.unused"]);
  const networks = await list(inventory.selectorAdapters["docker.networks.unused"]);
  const volumes = await list(inventory.selectorAdapters["docker.volumes.unused"]);
  const unusedNet = networks.find((target) => target.kind !== "path" && target.resourceId === `network:${networkId}`);
  const unusedVol = volumes.find((target) => target.kind !== "path" && target.resourceId === `volume:${unusedVolume}`);
  expect(unusedNet).toBeDefined();
  expect(unusedVol).toBeDefined();
  expect(networks.some((target) => target.evidence?.join(" ").includes(attachedNetwork))).toBe(false);
  expect(volumes.some((target) => target.kind !== "path" && target.resourceId === `volume:${attachedVolume}`)).toBe(false);
  if (!unusedNet || unusedNet.kind === "path" || !unusedVol || unusedVol.kind === "path") throw new Error("Private daemon did not expose protected fixtures");
  expect((await lookup(inventory.selectorAdapters["docker.networks.unused"], reviewed(unusedNet)))?.fingerprint).toBe(unusedNet.fingerprint);
  expect((await lookup(inventory.selectorAdapters["docker.volumes.unused"], reviewed(unusedVol)))?.fingerprint).toBe(unusedVol.fingerprint);

  const images = createDockerImageBinding({ contextName: CONTEXT, endpoint: ENDPOINT, daemonId, runner: bindingRunner });
  const danglingImages = await list(images.selectorAdapters["docker.images.dangling"]);
  const unusedImages = await list(images.selectorAdapters["docker.images.unused"]);
  const danglingTarget = danglingImages.find((target) => target.kind !== "path" && target.resourceId === `image:${danglingImageId}`);
  const unusedTarget = unusedImages.find((target) => target.kind !== "path" && target.resourceId === `image:${unusedImageId}`);
  expect(danglingTarget).toBeDefined();
  expect(unusedTarget).toBeDefined();
  if (!danglingTarget || danglingTarget.kind === "path" || !unusedTarget || unusedTarget.kind === "path") {
    throw new Error("Private daemon did not expose both exact-ID image fixtures");
  }
  expect((await lookup(images.selectorAdapters["docker.images.dangling"], reviewed(danglingTarget)))?.fingerprint).toBe(danglingTarget.fingerprint);
  expect((await lookup(images.selectorAdapters["docker.images.unused"], reviewed(unusedTarget)))?.fingerprint).toBe(unusedTarget.fingerprint);

  const stopped = createStoppedDockerContainerBinding({ contextName: CONTEXT, endpoint: ENDPOINT, daemonId, runner: bindingRunner });
  if (typeof stopped.selector === "function") throw new Error("Expected exact Docker container selector");
  const stoppedTargets = await list(stopped.selector);
  const selected = stoppedTargets.find((target) => target.kind !== "path" && target.resourceId === `container:${stoppedId}`);
  expect(selected).toBeDefined();
  if (!selected || selected.kind === "path") throw new Error("Stopped fixture was not inventoried");
  const target = reviewed(selected);
  expect((await lookup(stopped.selector, target))?.fingerprint).toBe(selected.fingerprint);
  expect(await stopped.isStillStopped(target)).toBe(true);
  await stopped.remove(selectedStoppedContainer(target));
  const after = await owner(command("container", "ls", "--all", "--no-trunc", "--format", "json"));
  expect(after).not.toContain(stoppedId);
  expect(after).toContain(activeId);
  await images.remove(selectedImage(reviewed(danglingTarget), "docker.image.dangling"));
  await images.remove(selectedImage(reviewed(unusedTarget), "docker.image.unused"));
  const remainingImages = await owner(command("image", "ls", "--all", "--no-trunc", "--format", "json"));
  expect(remainingImages).not.toContain(danglingImageId);
  expect(remainingImages).not.toContain(unusedImageId);
  expect(remainingImages).toContain(await owner(command("image", "inspect", "--format", "{{.Id}}", image)));
  expect((await lookup(inventory.selectorAdapters["docker.networks.unused"], reviewed(unusedNet)))?.fingerprint).toBe(unusedNet.fingerprint);
  expect((await lookup(inventory.selectorAdapters["docker.volumes.unused"], reviewed(unusedVol)))?.fingerprint).toBe(unusedVol.fingerprint);
}, TEST_TIMEOUT_MS);
