import { appendFile, lstat, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { StartupCommandRunner } from "../src/services/startup-optimizer";

const demoLabels = new Set(["com.kundol.demo-indexer", "com.kundol.demo-sync"]);
const loginItemScript = 'tell application "System Events" to get the name of every login item';

export function createFakeStartupRunner(sandboxRoot: string): StartupCommandRunner {
  const root = resolve(sandboxRoot);
  const launchAgents = join(root, "home", "Library", "LaunchAgents");
  const actionLog = join(root, "fake-startup", "actions.log");

  return {
    async run(command, args) {
      if (command === "osascript" && args.length === 2 && args[0] === "-e" && args[1] === loginItemScript) {
        return { exitCode: 0, output: "Demo Login App, Example Sync\n" };
      }

      if (command !== "launchctl" || args.length !== 3 && args.length !== 2) {
        return { exitCode: 2, output: "Unsupported sandbox startup command." };
      }

      if (args[0] === "bootout" && args.length === 3) {
        const target = resolve(args[2]!);
        const rel = relative(launchAgents, target);
        const label = rel.endsWith(".plist") ? rel.slice(0, -6) : "";
        if (!rel || rel.startsWith("..") || rel.includes("/") || !demoLabels.has(label)) {
          return { exitCode: 2, output: "Sandbox bootout accepts only seeded user LaunchAgents." };
        }
        try {
          const info = await lstat(target);
          if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid demo plist.");
          await readFile(target, "utf8");
        } catch {
          return { exitCode: 1, output: "Demo LaunchAgent plist is missing." };
        }
        await appendFile(actionLog, `bootout ${label}\n`);
        return { exitCode: 0, output: "Demo LaunchAgent booted out.\n" };
      }

      if (args[0] === "disable" && args.length === 2) {
        const label = args[1]?.split("/").at(-1) ?? "";
        if (!demoLabels.has(label)) {
          return { exitCode: 2, output: "Sandbox disable accepts only seeded user LaunchAgents." };
        }
        await appendFile(actionLog, `disable ${label}\n`);
        return { exitCode: 0, output: "Demo LaunchAgent disabled.\n" };
      }

      return { exitCode: 2, output: "Unsupported sandbox startup command." };
    },
  };
}
