import { homedir } from "node:os";
import type { DockerPinnedRunner } from "./docker-stopped-containers";

const MAX_DOCKER_JSON_BYTES = 2 * 1024 * 1024;
const MAX_DOCKER_ERROR_BYTES = 4 * 1024;
const DOCKER_COMMAND_TIMEOUT_MS = 15_000;
const CONTEXT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export function dockerPinnedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of Object.keys(env)) {
    if (key.startsWith("DOCKER_")) delete env[key];
  }
  return env;
}

export function isPinnedDockerArgv(argv: readonly string[], contextName: string): boolean {
  if (!CONTEXT_NAME.test(contextName) || argv[0] !== "docker" || argv.length < 4 ||
    argv.some((argument) => !argument || [...argument].some((character) => character.codePointAt(0)! < 32))) return false;
  return (argv[1] === "context" && argv[2] === "inspect" && argv.length === 4 && argv[3] === contextName) ||
    (argv[1] === "--context" && argv[2] === contextName && argv.length >= 4 &&
      !argv.slice(3).some((argument) => argument === "--context" || argument.startsWith("--context=") ||
        argument === "-H" || argument === "--host" || argument.startsWith("--host=") ||
        argument === "--config" || argument.startsWith("--config=")));
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<{ text: string; truncated: boolean }> {
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
      const kept = value.subarray(0, Math.max(0, remaining));
      text += decoder.decode(kept, { stream: true });
      remaining -= kept.byteLength;
      if (kept.byteLength < value.byteLength) truncated = true;
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
}

/** Docker commands are constructed by code-owned bindings, never by registry strings. */
export function createPinnedDockerRunner(contextName: string): DockerPinnedRunner {
  if (!CONTEXT_NAME.test(contextName)) throw new Error("Docker context name must be explicit and bounded");
  const cwd = homedir();
  const env = dockerPinnedEnvironment(process.env);
  return async (argv) => {
    if (!isPinnedDockerArgv(argv, contextName)) throw new Error("Docker command escaped the selected context");
    try {
      const proc = Bun.spawn([...argv], { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; proc.kill(); }, DOCKER_COMMAND_TIMEOUT_MS);
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          readCapped(proc.stdout, MAX_DOCKER_JSON_BYTES),
          readCapped(proc.stderr, MAX_DOCKER_ERROR_BYTES),
          proc.exited,
        ]);
        return {
          exitCode: timedOut ? 124 : exitCode,
          stdout,
          // Docker errors can carry endpoint/credential details. Bindings never
          // echo this into plans or audit rows; retain only a generic reason.
          stderr: timedOut ? "Docker command timed out" : stderr.truncated ? "Docker command failed with oversized error output" : "Docker command failed",
        };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { exitCode: 1, stdout: { text: "", truncated: false }, stderr: "Docker command unavailable" };
    }
  };
}
