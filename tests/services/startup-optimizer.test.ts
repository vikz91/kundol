import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyStartupOptimisePlan, scanStartupOptimiseTargets, type StartupCommandRunner } from "../../src/services/startup-optimizer";

describe("startup optimizer", () => {
  test("scans user LaunchAgents as safe and app Login Items as review", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kundol-startup-home-"));
    const launchAgents = path.join(homeDir, "Library", "LaunchAgents");
    await mkdir(launchAgents, { recursive: true });
    await writeFile(path.join(launchAgents, "com.example.agent.plist"), plist("com.example.agent", { bundleName: "Example Agent", description: "Keeps examples warm" }));
    await writeFile(path.join(launchAgents, "com.example.unknown.plist"), plist("com.example.unknown"));
    await writeFile(path.join(launchAgents, "com.apple.safe-nope.plist"), plist("com.apple.safe-nope"));
    const runner = fakeRunner({ osascript: "Dropbox, Rectangle\n" });

    const plan = await scanStartupOptimiseTargets({ homeDir, platform: "darwin", runner });

    expect(plan.candidates.find((candidate) => candidate.label === "com.example.agent")?.safety).toBe("safe");
    expect(plan.candidates.find((candidate) => candidate.label === "com.example.agent")?.displayName).toBe("Example Agent");
    expect(plan.candidates.find((candidate) => candidate.label === "com.example.agent")?.description).toBe("Keeps examples warm");
    expect(plan.candidates.find((candidate) => candidate.label === "com.example.unknown")?.description).toBe("! unknown");
    expect(plan.candidates.find((candidate) => candidate.label === "com.apple.safe-nope")?.safety).toBe("review");
    expect(plan.candidates.find((candidate) => candidate.label === "Dropbox")?.safety).toBe("review");
    expect(plan.candidates.find((candidate) => candidate.label === "Dropbox")?.description).toBe("! unknown");
    expect(plan.safeCount).toBe(2);
  });

  test("force apply disables only still-safe user LaunchAgents", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kundol-startup-home-"));
    const launchAgents = path.join(homeDir, "Library", "LaunchAgents");
    await mkdir(launchAgents, { recursive: true });
    const agentPath = path.join(launchAgents, "com.example.agent.plist");
    await writeFile(agentPath, plist("com.example.agent"));
    const commands: string[] = [];
    const runner: StartupCommandRunner = {
      async run(command, args) {
        commands.push([command, ...args].join(" "));
        return { exitCode: 0, output: "" };
      },
    };
    const plan = await scanStartupOptimiseTargets({ homeDir, platform: "darwin", runner });

    const result = await applyStartupOptimisePlan(plan, { homeDir, runner });

    expect(result.disabled.map((candidate) => candidate.label)).toEqual(["com.example.agent"]);
    expect(commands.some((command) => command.includes("launchctl bootout"))).toBe(true);
    expect(commands.some((command) => command.includes("launchctl disable") && command.includes("com.example.agent"))).toBe(true);
    await expect(stat(agentPath)).resolves.toBeDefined();
  });

  test("non-mac platforms return a warning and no candidates", async () => {
    const plan = await scanStartupOptimiseTargets({ platform: "linux" });

    expect(plan.candidates).toEqual([]);
    expect(plan.warnings[0]).toContain("macOS only");
  });
});

function plist(label: string, metadata: { bundleName?: string; description?: string; program?: string; programArguments?: string[] } = {}): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<plist>",
    "<dict>",
    "<key>Label</key>",
    `<string>${label}</string>`,
  ];
  if (metadata.bundleName) {
    lines.push("<key>BundleName</key>", `<string>${metadata.bundleName}</string>`);
  }
  if (metadata.description) {
    lines.push("<key>Description</key>", `<string>${metadata.description}</string>`);
  }
  if (metadata.program) {
    lines.push("<key>Program</key>", `<string>${metadata.program}</string>`);
  }
  if (metadata.programArguments) {
    lines.push("<key>ProgramArguments</key>", "<array>", ...metadata.programArguments.map((arg) => `<string>${arg}</string>`), "</array>");
  }
  lines.push("</dict>", "</plist>");
  return lines.join("\n");
}

function fakeRunner(outputs: Record<string, string>): StartupCommandRunner {
  return {
    async run(command) {
      return { exitCode: 0, output: outputs[command] ?? "" };
    },
  };
}
