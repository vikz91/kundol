#!/usr/bin/env bun

import { mkdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export interface SeedDockerSandboxOptions {
  now?: Date;
}

export async function seedDockerSandbox(sandboxRoot: string, options: SeedDockerSandboxOptions = {}): Promise<void> {
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
  await mkdir(join(root, "home", ".bun", "install", "cache"), { recursive: true });
  await writeFixture(join(root, "home", ".bun", "install", "cache", "demo-package.tgz"), "fake Bun package cache\n");

  await writeFixture(join(root, "fake-docker", "pruneable", "build-cache", "layer.bin"), Buffer.alloc(32 * 1024, "B"));
  await writeFixture(join(root, "fake-docker", "pruneable", "dangling-images", "layer.bin"), Buffer.alloc(16 * 1024, "I"));
  await writeFixture(join(root, "fake-docker", "pruneable", "stopped-containers", "demo.json"), '{"state":"stopped"}\n');
  await writeFixture(join(root, "fake-docker", "pruneable", "unused-networks", "demo.json"), '{"state":"unused"}\n');
  await writeFixture(join(root, "fake-docker", "volumes", "demo-database", "data.sqlite"), "protected fake volume database\n");
  await writeFixture(join(root, "fake-docker", "volumes", "demo-uploads", "photo.png"), "protected fake volume upload\n");
  await writeFixture(join(root, "fake-docker", "running-containers", "demo.json"), '{"state":"running"}\n');

  const launchAgents = join(root, "home", "Library", "LaunchAgents");
  await writeFixture(join(launchAgents, "com.kundol.demo-indexer.plist"), demoPlist("com.kundol.demo-indexer", "Demo Indexer"));
  await writeFixture(join(launchAgents, "com.kundol.demo-sync.plist"), demoPlist("com.kundol.demo-sync", "Demo Sync"));
  await writeFixture(join(launchAgents, "com.apple.demo-protected.plist"), demoPlist("com.apple.demo-protected", "Protected Demo"));
  await writeFixture(join(root, "fake-startup", "actions.log"), "");

  const tmpRoot = join(root, "tmp");
  const oldTemp = join(tmpRoot, "old-demo-temp");
  await writeFixture(join(oldTemp, "cache.bin"), Buffer.alloc(8 * 1024, "T"));
  await writeFixture(join(tmpRoot, "fresh-demo-temp.txt"), "recent temp fixture; should not be selected\n");
  const oldDate = new Date((options.now ?? new Date()).getTime() - 10 * 86_400_000);
  await utimes(join(oldTemp, "cache.bin"), oldDate, oldDate);
  await utimes(oldTemp, oldDate, oldDate);
}

async function writeFixture(path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function demoPlist(label: string, name: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<plist><dict>",
    `<key>Label</key><string>${label}</string>`,
    `<key>BundleName</key><string>${name}</string>`,
    "<key>Description</key><string>Disposable sandbox startup fixture</string>",
    "</dict></plist>",
  ].join("\n");
}

if (import.meta.main) {
  const root = process.argv[2] ?? "/sandbox";
  await seedDockerSandbox(root);
  console.log(`Seeded disposable kundol fixtures in ${resolve(root)}`);
  console.log(`Try: kundol optimise projects ${join(resolve(root), "projects")}`);
  console.log("Try: kundol optimise storage");
  console.log("Try: kundol optimise startup");
}
