import { createReadStream, existsSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

type Bump = "major" | "minor" | "patch" | "skip";

function git(args: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

function gitPath(name: string, cwd: string): string {
  const result = git(["rev-parse", "--git-path", name], cwd);
  if (result.exitCode !== 0) throw new Error(result.stderr || `Cannot locate Git path ${name}`);
  return resolve(cwd, result.stdout);
}

function versionOf(content: string): string {
  const value: unknown = JSON.parse(content);
  if (typeof value !== "object" || value === null || !("version" in value) || typeof value.version !== "string") {
    throw new Error("package.json must have a string version");
  }
  return value.version;
}

export function bumpVersion(version: string, bump: Exclude<Bump, "skip">): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error(`Unsupported package version ${version}; expected major.minor.patch`);
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) throw new Error(`Unsupported package version ${version}`);
  const [major = 0, minor = 0, patch = 0] = parts;
  const next = bump === "major" ? [major + 1, 0, 0] : bump === "minor" ? [major, minor + 1, 0] : [major, minor, patch + 1];
  if (next.some((part) => !Number.isSafeInteger(part))) throw new Error("Version increment exceeds the safe integer range");
  return next.join(".");
}

async function prompt(version: string): Promise<Bump | null> {
  if (process.env.CI === "true" || process.env.CI === "1") return null;
  let fd: number;
  try {
    fd = openSync("/dev/tty", "r");
  } catch {
    return null;
  }

  const input = createReadStream("/dev/tty", { fd, autoClose: true });
  const readline = createInterface({ input, output: process.stderr });
  try {
    const answer = await new Promise<string>((done, reject) => {
      let answered = false;
      readline.once("close", () => {
        if (!answered) reject(new Error("No version choice entered; commit aborted without a version change"));
      });
      readline.question(`Version ${version} → bump [major/minor/patch/skip]: `, (value) => {
        answered = true;
        done(value);
      });
    });
    const choice = answer.trim().toLowerCase();
    if (choice === "major" || choice === "minor" || choice === "patch" || choice === "skip") return choice;
    throw new Error("Choose major, minor, patch, or skip; commit aborted without a version change");
  } finally {
    readline.close();
    input.destroy();
  }
}

function requestedBump(): Bump | undefined {
  const value = process.env.KUNDOL_VERSION_BUMP;
  if (value === undefined) return undefined;
  if (value === "major" || value === "minor" || value === "patch" || value === "skip") return value;
  throw new Error("KUNDOL_VERSION_BUMP must be major, minor, patch, or skip");
}

export async function runVersionBump(cwd = process.cwd()): Promise<void> {
  const choiceFromEnv = requestedBump();
  if (choiceFromEnv === "skip") {
    console.error("Version bump skipped (KUNDOL_VERSION_BUMP=skip).");
    return;
  }

  for (const state of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
    if (existsSync(gitPath(state, cwd))) {
      console.error(`Version bump skipped during ${state}.`);
      return;
    }
  }

  const staged = git(["diff", "--cached", "--quiet", "--"], cwd);
  if (staged.exitCode === 0) {
    console.error("Version bump skipped: nothing staged.");
    return;
  }
  if (staged.exitCode !== 1) throw new Error(staged.stderr || "Cannot inspect staged changes");

  const indexFile = git(["show", ":package.json"], cwd);
  if (indexFile.exitCode !== 0) throw new Error("Stage package.json before committing so its version can be bumped safely");
  const currentVersion = versionOf(indexFile.stdout);

  const headFile = git(["show", "HEAD:package.json"], cwd);
  if (headFile.exitCode === 0 && versionOf(headFile.stdout) !== currentVersion) {
    console.error(`Version bump skipped: package.json already stages version ${currentVersion}.`);
    return;
  }

  const choice = choiceFromEnv ?? (await prompt(currentVersion));
  if (choice === null) {
    console.error("Version bump skipped: no terminal available (set KUNDOL_VERSION_BUMP to major, minor, or patch to bump).");
    return;
  }
  if (choice === "skip") {
    console.error("Version bump skipped by choice.");
    return;
  }

  const unstaged = git(["diff", "--quiet", "--", "package.json"], cwd);
  if (unstaged.exitCode === 1) {
    throw new Error("package.json has unstaged edits; stage or stash them before bumping the version");
  }
  if (unstaged.exitCode !== 0) throw new Error(unstaged.stderr || "Cannot inspect package.json edits");

  const nextVersion = bumpVersion(currentVersion, choice);
  const packageFile = resolve(cwd, "package.json");
  const text = await Bun.file(packageFile).text();
  const packageValue: unknown = JSON.parse(text);
  if (typeof packageValue !== "object" || packageValue === null || !("version" in packageValue)) {
    throw new Error("package.json must have a version");
  }
  const replacement = text.replace(/("version"\s*:\s*")([^"\n]+)(")/, (_, prefix: string, oldVersion: string, suffix: string) => {
    if (oldVersion !== currentVersion) throw new Error("package.json version differs from the Git index");
    return `${prefix}${nextVersion}${suffix}`;
  });
  if (replacement === text) throw new Error("Cannot find the package.json version field to update");
  await Bun.write(packageFile, replacement);

  const added = git(["add", "--", "package.json"], cwd);
  if (added.exitCode !== 0) throw new Error(added.stderr || "Cannot stage the bumped package.json");
  console.error(`Version bumped ${currentVersion} → ${nextVersion} and staged in this commit.`);
}

if (import.meta.main) {
  try {
    await runVersionBump();
  } catch (error) {
    console.error(`Version bump failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
