#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function seedDockerSandbox(sandboxRoot: string): Promise<void> {
  const root = resolve(sandboxRoot);
  if (root === "/" || root === resolve(process.env.HOME ?? "/unlikely-kundol-home")) {
    throw new Error("Choose a dedicated demo sandbox directory, not a system or home root.");
  }

  const projectsRoot = join(root, "projects");
  await mkdir(projectsRoot, { recursive: true });
  const seedWorkspace = join(import.meta.dir, "seed-demo-workspace.ts");
  const spawnedProcess = Bun.spawn(["bun", seedWorkspace, projectsRoot], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(spawnedProcess.stdout).text(),
    new Response(spawnedProcess.stderr).text(),
    spawnedProcess.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`Demo project seeder failed: ${stderr.trim() || stdout.trim()}`);
  }

  await writeFixture(join(root, ".kundol-demo-sandbox"), "kundol disposable Docker demo\n");
  await mkdir(join(root, "home"), { recursive: true });
}

async function writeFixture(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

if (import.meta.main) {
  const root = process.argv[2] ?? "/sandbox";
  await seedDockerSandbox(root);
  console.log(`Seeded disposable kundol fixtures in ${resolve(root)}`);
  console.log(`Try: kundol optimise projects ${join(resolve(root), "projects")}`);
  console.log("Try: kundol optimise storage");
}
