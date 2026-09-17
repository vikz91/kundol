#!/usr/bin/env node

// Run only in an ephemeral no-socket container created from Dockerfile.runtime-seed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";

const HOME = "/sandbox/home";
const PROJECTS = "/sandbox/projects";

if (process.env.KUNDOL_RUNTIME_SEED_CONTAINER !== "1" || process.env.HOME !== HOME ||
  existsSync("/var/run/docker.sock")) {
  throw new Error("Safe-rule exercise requires the disposable no-socket runtime image");
}

async function exists(absolutePath) {
  try { await lstat(absolutePath); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

const child = spawn("bun", ["run", "src/cli/index.ts", "optimise", "projects", PROJECTS, "-f"], {
  cwd: "/opt/kundol",
  env: { PATH: process.env.PATH, HOME, TMPDIR: "/sandbox/tmp", KUNDOL_RUNTIME_SEED_CONTAINER: "1" },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output += chunk.toString("utf8");
    if (output.length > 64 * 1024) child.kill();
  });
}
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code) => resolve(code));
});
if (exitCode !== 0 || !output.includes("Removed/optimised: 4") ||
  !output.includes("Failed: 0")) throw new Error("Disposable safe-rule exercise did not apply its four expected targets");

const removed = [
  "node-npm/node_modules", "node-pnpm/node_modules",
  "node-pnpm/.cache/tsconfig.tsbuildinfo", "dotnet-console/obj",
];
const preserved = [
  "node-npm/dist/index.mjs", "node-pnpm/dist/index.js",
  "java-maven/target/classes/seed/App.class", "python-venv/.venv/pyvenv.cfg",
  "go-module/bin/seed-go", "dotnet-console/bin",
];
for (const relative of removed) if (await exists(path.join(PROJECTS, relative))) {
  throw new Error(`Published safe rule left expected generated artifact: ${relative}`);
}
for (const relative of preserved) if (!(await exists(path.join(PROJECTS, relative)))) {
  throw new Error(`Published safe rule removed a review or retained artifact: ${relative}`);
}
for (const project of ["node-npm", "node-pnpm", "java-maven", "python-venv", "go-module", "dotnet-console"]) {
  if (!(await exists(path.join(PROJECTS, project, "KEEP.user-data")))) {
    throw new Error(`Published safe rule removed user data from ${project}`);
  }
}
console.log("Four published safe targets removed; all review outputs and six user-data files preserved in the throwaway container.");
