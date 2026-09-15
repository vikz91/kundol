import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

function outputPath(args: string[]): string {
  if (args.length === 0) return resolve("dist/kundol-macos-universal");
  if (args.length !== 2 || args[0] !== "--outfile" || !args[1]) {
    throw new Error("Usage: bun run scripts/build-release.ts [--outfile <path>]");
  }
  return resolve(args[1]);
}

async function run(command: string[], cwd?: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const child = Bun.spawn(command, {
    cwd: cwd ?? process.cwd(),
    env: env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command[0]} failed (exit ${exitCode}):\n${stdout}${stderr}`);
  }
  return stdout.trim();
}

async function compile(target: "bun-darwin-arm64" | "bun-darwin-x64", outfile: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [resolve("src/cli/index.ts")],
    compile: {
      target,
      outfile,
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    minify: true,
  });
  if (!result.success) {
    throw new Error(`Bun failed to compile ${target}:\n${result.logs.map(String).join("\n")}`);
  }
}

if (process.platform !== "darwin") {
  throw new Error("The universal macOS release executable must be built on macOS (lipo is required).");
}

const outfile = outputPath(process.argv.slice(2));
const workdir = await mkdtemp(join(tmpdir(), "kundol-release-build-"));
try {
  const arm64 = join(workdir, "kundol-arm64");
  const x64 = join(workdir, "kundol-x64");
  const universal = join(workdir, "kundol-macos-universal");
  const smokeHome = join(workdir, "home");

  await compile("bun-darwin-arm64", arm64);
  await compile("bun-darwin-x64", x64);
  await run(["lipo", "-create", arm64, x64, "-output", universal]);
  await chmod(universal, 0o755);
  // lipo changes each Mach-O slice, so Bun's original signature needs to be replaced.
  await run(["codesign", "--force", "--sign", "-", universal]);
  await run(["codesign", "--verify", universal]);

  const architectures = await run(["lipo", "-archs", universal]);
  if (!architectures.split(/\s+/).includes("arm64") || !architectures.split(/\s+/).includes("x86_64")) {
    throw new Error(`Expected arm64 and x86_64 slices, got: ${architectures}`);
  }

  await mkdir(smokeHome);
  const smokeEnv = { ...process.env, HOME: smokeHome };
  const welcome = await run([universal], workdir, smokeEnv);
  const help = await run([universal, "--help"], workdir, smokeEnv);
  const reportedVersion = await run([universal, "--version"], workdir, smokeEnv);
  const packageJson = await Bun.file(resolve("package.json")).json() as { version?: unknown };
  if (!welcome.includes("optimise developer storage") || !help.includes("Usage: kundol")) {
    throw new Error("The standalone executable did not pass its welcome/help smoke checks.");
  }
  if (reportedVersion !== packageJson.version) {
    throw new Error(`The executable reports ${reportedVersion}, but package.json declares ${String(packageJson.version)}.`);
  }

  await mkdir(dirname(outfile), { recursive: true });
  await copyFile(universal, outfile);
  await chmod(outfile, 0o755);
  await run(["codesign", "--verify", outfile]);
  console.log(`Built ${outfile} (${architectures})`);
} finally {
  await rm(workdir, { recursive: true, force: true });
}
