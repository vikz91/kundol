import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function checkCli(homeDir: string, args: string[], expectedOutput: string): Promise<void> {
  const child = Bun.spawn([process.execPath, "src/cli/index.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, HOME: homeDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  if (exitCode !== 0 || !stdout.includes(expectedOutput)) {
    throw new Error(
      `kundol ${args.join(" ") || "(bare)"} failed (exit ${exitCode}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
}

const homeDir = await mkdtemp(join(tmpdir(), "kundol-cli-smoke-"));
try {
  await checkCli(homeDir, [], "optimise developer storage");
  await checkCli(homeDir, ["--help"], "Usage: kundol");
  console.log("CLI boot smoke passed (bare command and --help).");
} finally {
  await rm(homeDir, { recursive: true, force: true });
}
