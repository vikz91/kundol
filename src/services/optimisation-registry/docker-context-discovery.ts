import { homedir } from "node:os";
import { dockerPinnedEnvironment } from "./docker-pinned-runner";

const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_CONTEXTS = 256;
const TIMEOUT_MS = 15_000;
const CONTEXT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface DiscoveryOutput { text: string; truncated: boolean }
type DiscoveryRunner = (
  argv: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ exitCode: number; stdout: DiscoveryOutput }>;

export function parseDockerContextNames(output: DiscoveryOutput): readonly string[] {
  if (output.truncated || Buffer.byteLength(output.text, "utf8") > MAX_OUTPUT_BYTES) {
    throw new Error("Docker context inventory exceeded its output limit");
  }
  const text = output.text.trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_CONTEXTS) throw new Error("Docker context inventory exceeded its record limit");
  const names = new Set<string>();
  for (const line of lines) {
    let name: unknown;
    try { name = JSON.parse(line); } catch { throw new Error("Docker context inventory is malformed"); }
    if (typeof name !== "string" || !CONTEXT_NAME.test(name) || names.has(name)) {
      throw new Error("Docker context inventory contains invalid or duplicate names");
    }
    names.add(name);
  }
  return [...names];
}

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<DiscoveryOutput> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let remaining = MAX_OUTPUT_BYTES;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const kept = value.subarray(0, remaining);
      text += decoder.decode(kept, { stream: true });
      remaining -= kept.byteLength;
      if (kept.byteLength < value.byteLength) truncated = true;
    }
    return { text: text + decoder.decode(), truncated };
  } finally {
    reader.releaseLock();
  }
}

const runDiscovery: DiscoveryRunner = async (argv, options) => {
  const child = Bun.spawn([...argv], { ...options, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT_MS);
  try {
    const [stdout, exitCode] = await Promise.all([readBounded(child.stdout), child.exited]);
    return { stdout, exitCode: timedOut ? 124 : exitCode };
  } finally {
    clearTimeout(timer);
  }
};

/** Lists local CLI context names only; does not contact a daemon or choose a context. */
export async function discoverDockerContexts(options: { runner?: DiscoveryRunner } = {}): Promise<readonly string[]> {
  let result: Awaited<ReturnType<DiscoveryRunner>>;
  try {
    result = await (options.runner ?? runDiscovery)(["docker", "context", "ls", "--format", "{{json .Name}}"], {
      cwd: homedir(), env: dockerPinnedEnvironment(process.env),
    });
  } catch {
    throw new Error("Docker context discovery is unavailable");
  }
  if (result.exitCode !== 0) throw new Error("Docker context discovery failed");
  return parseDockerContextNames(result.stdout);
}
