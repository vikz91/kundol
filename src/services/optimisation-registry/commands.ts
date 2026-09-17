import type { RegistryCommandResult, RegistryCommandRunner, RegistryRule } from "./types";

const READ_ONLY_SIGNATURES = [
  ["npm", "config", "get", "cache"],
  ["npm", "--version"],
  ["python3", "-m", "pip", "cache", "dir"],
  ["python3", "-m", "pip", "--version"],
  ["uv", "cache", "dir"],
  ["uv", "--version"],
  ["go", "env", "GOCACHE"],
  ["go", "env", "GOMODCACHE"],
  ["go", "version"],
  ["bun", "pm", "cache"],
  ["bun", "--version"],
  ["pnpm", "store", "path"],
  ["pnpm", "--version"],
  ["yarn", "--version"],
  ["deno", "info"],
  ["conda", "clean", "--dry-run", "--all", "--json"],
  ["docker", "system", "df", "--verbose"],
  ["dotnet", "nuget", "locals", "http-cache", "--list"],
  ["dotnet", "nuget", "locals", "global-packages", "--list"],
] as const;

const ACTION_SIGNATURES = [
  ["npm", "cache", "verify"],
  ["python3", "-m", "pip", "cache", "purge"],
  ["uv", "cache", "prune"],
  ["go", "clean", "-cache", "-testcache"],
  ["go", "clean", "-modcache"],
  ["dotnet", "nuget", "locals", "http-cache", "--clear"],
  ["dotnet", "nuget", "locals", "global-packages", "--clear"],
  ["pnpm", "store", "prune"],
] as const;

const readOnly = new Set(READ_ONLY_SIGNATURES.map((argv) => JSON.stringify(argv)));
const actions = new Set(ACTION_SIGNATURES.map((argv) => JSON.stringify(argv)));
const TIER_PRIORITY = { safe: 0, review: 1, protected: 2 } as const;
const OWNER_ACTIONS = [
  { action: ["npm", "cache", "verify"], pathProbe: ["npm", "config", "get", "cache"], minimumTier: "safe" },
  { action: ["python3", "-m", "pip", "cache", "purge"], pathProbe: ["python3", "-m", "pip", "cache", "dir"], minimumTier: "review" },
  { action: ["uv", "cache", "prune"], pathProbe: ["uv", "cache", "dir"], minimumTier: "safe" },
  { action: ["go", "clean", "-cache", "-testcache"], pathProbe: ["go", "env", "GOCACHE"], minimumTier: "safe" },
  { action: ["go", "clean", "-modcache"], pathProbe: ["go", "env", "GOMODCACHE"], minimumTier: "review" },
  { action: ["pnpm", "store", "prune"], pathProbe: ["pnpm", "store", "path"], minimumTier: "safe" },
  { action: ["dotnet", "nuget", "locals", "http-cache", "--clear"], selectorAdapter: "nuget.http_cache", minimumTier: "review" },
  { action: ["dotnet", "nuget", "locals", "global-packages", "--clear"], selectorAdapter: "nuget.global_packages", minimumTier: "review" },
] as const;

export function isKnownProbeCommand(argv: readonly string[]): boolean {
  return readOnly.has(JSON.stringify(argv));
}

export function isKnownActionCommand(argv: readonly string[]): boolean {
  return actions.has(JSON.stringify(argv));
}

export function isApprovedOwnerCommandRule(rule: RegistryRule): boolean {
  if (rule.action.kind !== "command") return false;
  const actionArgv = rule.action.argv;
  const signature = OWNER_ACTIONS.find((entry) => JSON.stringify(entry.action) === JSON.stringify(actionArgv));
  if (!signature) return false;
  if (TIER_PRIORITY[rule.review.tier] < TIER_PRIORITY[signature.minimumTier]) return false;
  if ("pathProbe" in signature) {
    return rule.selector.kind === "tool_cache" && JSON.stringify(rule.selector.pathCommand.argv) === JSON.stringify(signature.pathProbe);
  }
  return rule.selector.kind === "adapter" && rule.selector.adapterId === signature.selectorAdapter;
}

const MAX_OUTPUT_BYTES = 64 * 1024;
const COMMAND_TIMEOUT_MS = 15_000;

async function readBounded(stream: ReadableStream<Uint8Array> | null): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let remaining = MAX_OUTPUT_BYTES;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (remaining > 0) {
        const slice = value.subarray(0, remaining);
        output += decoder.decode(slice, { stream: true });
        remaining -= slice.byteLength;
        if (slice.byteLength < value.byteLength) truncated = true;
      } else if (value.byteLength > 0) {
        truncated = true;
      }
    }
    output += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  return { text: output, truncated };
}

export const runRegistryCommand: RegistryCommandRunner = async (argv, cwd): Promise<RegistryCommandResult> => {
  try {
    const proc = Bun.spawn([...argv], { cwd, stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, COMMAND_TIMEOUT_MS);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        readBounded(proc.stdout),
        readBounded(proc.stderr),
        proc.exited,
      ]);
      return {
        exitCode: timedOut ? 124 : exitCode,
        stdout: stdout.text,
        stderr: timedOut ? `${stderr.text}\ncommand timed out` : stderr.text,
        truncated: stdout.truncated || stderr.truncated,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
};
