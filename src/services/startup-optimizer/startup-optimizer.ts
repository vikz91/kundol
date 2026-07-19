import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { getHomeDirectory } from "../../platform/home";

export type StartupSafety = "safe" | "review" | "protected";
export type StartupKind = "launch-agent" | "launch-daemon" | "login-item";

export interface StartupOptimiseOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
  runner?: StartupCommandRunner;
}

export interface StartupCommandRunner {
  run(command: string, args: string[]): Promise<{ exitCode: number; output: string }>;
}

export interface StartupOptimisePlan {
  platform: NodeJS.Platform;
  scannedAt: string;
  candidates: StartupCandidate[];
  safeCount: number;
  reviewCount: number;
  protectedCount: number;
  warnings: string[];
}

export interface StartupCandidate {
  id: string;
  kind: StartupKind;
  label: string;
  name: string;
  displayName: string;
  description: string;
  path: string | null;
  command: string;
  safety: StartupSafety;
  reason: string;
  defaultSelected: boolean;
}

export interface StartupApplyResult {
  disabled: StartupCandidate[];
  skipped: Array<{ candidate: StartupCandidate; reason: string }>;
  failed: Array<{ candidate: StartupCandidate; error: string }>;
}

const macSystemStartupDirs = [
  "/Library/LaunchAgents",
  "/Library/LaunchDaemons",
  "/System/Library/LaunchAgents",
  "/System/Library/LaunchDaemons",
];

export async function scanStartupOptimiseTargets(options: StartupOptimiseOptions = {}): Promise<StartupOptimisePlan> {
  const platform = options.platform ?? process.platform;
  const warnings: string[] = [];
  const candidates: StartupCandidate[] = [];

  if (platform !== "darwin") {
    warnings.push(`Startup optimisation currently supports macOS only; detected ${platform}.`);
    return buildPlan(platform, candidates, warnings);
  }

  const homeDir = options.homeDir ?? getHomeDirectory();
  candidates.push(...(await launchdCandidates(join(homeDir, "Library", "LaunchAgents"), "safe", warnings)));

  for (const directory of macSystemStartupDirs) {
    candidates.push(...(await launchdCandidates(directory, "protected", warnings)));
  }

  candidates.push(...(await loginItemCandidates(options.runner ?? defaultRunner)));
  return buildPlan(platform, candidates, warnings);
}

export async function applyStartupOptimisePlan(
  plan: StartupOptimisePlan,
  options: StartupOptimiseOptions & { candidateIds?: string[] } = {},
): Promise<StartupApplyResult> {
  const runner = options.runner ?? defaultRunner;
  const selectedIds = new Set(options.candidateIds ?? plan.candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected).map((candidate) => candidate.id));
  const disabled: StartupCandidate[] = [];
  const skipped: Array<{ candidate: StartupCandidate; reason: string }> = [];
  const failed: Array<{ candidate: StartupCandidate; error: string }> = [];

  for (const candidate of plan.candidates) {
    if (!selectedIds.has(candidate.id)) continue;
    if (candidate.safety !== "safe" || candidate.kind !== "launch-agent" || !candidate.path) {
      skipped.push({ candidate, reason: "only safe user LaunchAgents can be disabled automatically" });
      continue;
    }

    const verification = await verifySafeLaunchAgent(candidate, options.homeDir);
    if (!verification.ok) {
      skipped.push({ candidate, reason: verification.reason });
      continue;
    }

    const bootout = await runner.run("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}`, verification.path]);
    const disable = await runner.run("launchctl", ["disable", `gui/${process.getuid?.() ?? 501}/${candidate.label}`]);
    if (disable.exitCode === 0) {
      disabled.push(candidate);
    } else {
      failed.push({ candidate, error: disable.output.trim() || bootout.output.trim() || `launchctl disable exited ${disable.exitCode}` });
    }
  }

  return { disabled, skipped, failed };
}

async function launchdCandidates(directory: string, safety: StartupSafety, warnings: string[]): Promise<StartupCandidate[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates: StartupCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".plist")) continue;
    const absolutePath = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    try {
      const content = await readFile(absolutePath, "utf8");
      const metadata = parsePlistMetadata(content);
      const label = metadata.label ?? entry.name.replace(/\.plist$/, "");
      const safe = safety === "safe" && !label.startsWith("com.apple.");
      const kind: StartupKind = directory.endsWith("LaunchDaemons") ? "launch-daemon" : "launch-agent";
      const candidateSafety: StartupSafety = safe ? "safe" : safety === "safe" ? "review" : safety;
      const displayName = metadata.bundleName ?? metadata.processName ?? label;
      const description = metadata.description ?? metadata.program ?? metadata.programArguments ?? "! unknown";
      candidates.push({
        id: `${kind}:${absolutePath}`,
        kind,
        label,
        name: basename(absolutePath),
        displayName,
        description,
        path: absolutePath,
        command: safe ? `launchctl disable gui/$UID/${label}` : "manual review",
        safety: candidateSafety,
        reason: safe
          ? "User LaunchAgent can be disabled without deleting files."
          : safety === "protected"
            ? "System startup item requires manual review."
            : "Apple startup item is not disabled automatically.",
        defaultSelected: safe,
      });
    } catch (error) {
      warnings.push(`Skipped startup item ${absolutePath}: ${errorMessage(error)}`);
    }
  }
  return candidates;
}

async function loginItemCandidates(runner: StartupCommandRunner): Promise<StartupCandidate[]> {
  const script = 'tell application "System Events" to get the name of every login item';
  const result = await runner.run("osascript", ["-e", script]);
  if (result.exitCode !== 0 || result.output.trim() === "") return [];
  return result.output
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      id: `login-item:${name}`,
      kind: "login-item" as const,
      label: name,
      name,
      displayName: name,
      description: "! unknown",
      path: null,
      command: "manual review in System Settings",
      safety: "review" as const,
      reason: "App Login Items are shown for review and are not disabled automatically.",
      defaultSelected: false,
    }));
}

async function verifySafeLaunchAgent(candidate: StartupCandidate, homeDir: string | undefined): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!candidate.path) return { ok: false, reason: "candidate has no path" };
  const launchAgentsRoot = resolve(homeDir ?? getHomeDirectory(), "Library", "LaunchAgents");
  const targetPath = resolve(candidate.path);
  const relativePath = relative(launchAgentsRoot, targetPath);
  if (!relativePath || relativePath.startsWith("..") || resolve(launchAgentsRoot, relativePath) !== targetPath) {
    return { ok: false, reason: "startup item is outside user LaunchAgents" };
  }
  if (candidate.label.startsWith("com.apple.")) {
    return { ok: false, reason: "Apple startup items are protected" };
  }
  try {
    const info = await lstat(targetPath);
    if (!info.isFile() || info.isSymbolicLink()) return { ok: false, reason: "startup item is not a regular plist file" };
  } catch {
    return { ok: false, reason: "startup item no longer exists" };
  }
  return { ok: true, path: targetPath };
}

function buildPlan(platform: NodeJS.Platform, candidates: StartupCandidate[], warnings: string[]): StartupOptimisePlan {
  return {
    platform,
    scannedAt: new Date().toISOString(),
    candidates: candidates.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    safeCount: candidates.filter((candidate) => candidate.safety === "safe" && candidate.defaultSelected).length,
    reviewCount: candidates.filter((candidate) => candidate.safety === "review").length,
    protectedCount: candidates.filter((candidate) => candidate.safety === "protected").length,
    warnings,
  };
}

function parsePlistMetadata(content: string): {
  label: string | null;
  bundleName: string | null;
  processName: string | null;
  description: string | null;
  program: string | null;
  programArguments: string | null;
} {
  return {
    label: parsePlistString(content, "Label"),
    bundleName: parsePlistString(content, "BundleName"),
    processName: parsePlistString(content, "ProcessName"),
    description: parsePlistString(content, "Description"),
    program: parsePlistString(content, "Program"),
    programArguments: parseProgramArguments(content),
  };
}

function parsePlistString(content: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`<key>\\s*${escapedKey}\\s*<\\/key>\\s*<string>\\s*([^<]+)\\s*<\\/string>`));
  return match?.[1]?.trim() ?? null;
}

function parseProgramArguments(content: string): string | null {
  const match = content.match(/<key>\s*ProgramArguments\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!match?.[1]) return null;
  const args = [...match[1].matchAll(/<string>\s*([^<]+)\s*<\/string>/g)].map((arg) => arg[1]?.trim()).filter(Boolean);
  return args.length > 0 ? args.join(" ") : null;
}

const defaultRunner: StartupCommandRunner = {
  async run(command, args) {
    try {
      const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { exitCode, output: `${stdout}${stderr}` };
    } catch (error) {
      return { exitCode: 1, output: errorMessage(error) };
    }
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
