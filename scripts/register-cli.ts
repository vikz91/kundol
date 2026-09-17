import { chmod, copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Runner = (args: readonly string[], cwd: string) => Promise<void>;

async function run(args: readonly string[], cwd: string): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    cwd,
    // Installation also works in a source ZIP, where Git hooks cannot be set up.
    env: { ...process.env, HUSKY: "0" },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`bun ${args[0]} failed (exit ${code}); existing CLI was not replaced.`);
}

export async function registerCli(options: {
  repositoryRoot?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  runner?: Runner;
} = {}): Promise<string> {
  if ((options.platform ?? process.platform) !== "darwin") {
    throw new Error("register:cli currently requires macOS with Apple's Command Line Tools (lipo and codesign).");
  }
  const repositoryRoot = resolve(options.repositoryRoot ?? fileURLToPath(new URL("../", import.meta.url)));
  const binDir = join(resolve(options.homeDir ?? homedir()), ".local", "bin");
  const destination = join(binDir, "kundol");
  const artifact = join(repositoryRoot, "dist", "kundol-macos-universal");
  const runner = options.runner ?? run;

  // Intentionally run every step on every invocation, even when artifacts exist.
  await runner(["install", "--frozen-lockfile", "--force"], repositoryRoot);
  await runner(["run", "scripts/build-release.ts", "--outfile", artifact], repositoryRoot);

  await mkdir(binDir, { recursive: true });
  const staging = await mkdtemp(join(binDir, ".kundol-install-"));
  try {
    const stagedBinary = join(staging, "kundol");
    await copyFile(artifact, stagedBinary);
    await chmod(stagedBinary, 0o755);
    // Same-filesystem rename replaces an old file/symlink without following it.
    // A failed install leaves the previous executable intact.
    await rename(stagedBinary, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return destination;
}

if (import.meta.main) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: bun run register:cli (no arguments)");
    const destination = await registerCli();
    console.log(`Installed standalone CLI: ${destination}`);
    const binDir = join(homedir(), ".local", "bin");
    if (!(process.env.PATH ?? "").split(delimiter).some((entry) => entry && resolve(entry) === binDir)) {
      console.log('Add this to your shell configuration (for example ~/.zshrc), then run it in this terminal:');
      console.log('export PATH="$HOME/.local/bin:$PATH"');
    }
    console.log("Run kundol --help from any directory. Rerun bun run register:cli after updating the source.");
  } catch (error) {
    console.error(`CLI registration failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
