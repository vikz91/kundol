#!/usr/bin/env bun

import { lstat, readdir, realpath, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const pruneableNames = ["build-cache", "dangling-images", "stopped-containers", "unused-networks"] as const;

export interface FakeDockerResult {
  exitCode: number;
  output: string;
}

export async function runFakeDockerCommand(args: string[], sandboxRoot: string): Promise<FakeDockerResult> {
  const root = await realpath(resolve(sandboxRoot)).catch(() => resolve(sandboxRoot));
  try {
    await stat(join(root, ".kundol-demo-sandbox"));
  } catch {
    return { exitCode: 2, output: "The kundol Docker demo fixture is missing." };
  }

  if (args.length === 1 && args[0] === "info") {
    return { exitCode: 0, output: "Kundol fake Docker daemon: sandbox fixtures only.\n" };
  }
  if (args.length !== 3 || args[0] !== "system" || args[1] !== "prune" || args[2] !== "--force") {
    return { exitCode: 2, output: "Fake Docker supports only `info` and `system prune --force`." };
  }

  const fakeDockerRoot = await realpath(join(root, "fake-docker"));
  if (!isDirectChild(root, fakeDockerRoot, "fake-docker")) {
    return { exitCode: 2, output: "Fake Docker fixtures must stay inside the sandbox." };
  }
  const pruneableRoot = await realpath(join(fakeDockerRoot, "pruneable"));
  if (!isDirectChild(fakeDockerRoot, pruneableRoot, "pruneable")) {
    return { exitCode: 2, output: "Fake Docker prune fixtures must stay inside the sandbox." };
  }
  let removed = 0;
  for (const name of pruneableNames) {
    const categoryPath = join(pruneableRoot, name);
    let realCategoryPath;
    try {
      realCategoryPath = await realpath(categoryPath);
    } catch {
      continue;
    }
    if (!isDirectChild(pruneableRoot, realCategoryPath, name)) {
      return { exitCode: 2, output: "Fake Docker category escaped the sandbox." };
    }
    let entries;
    try {
      entries = await readdir(categoryPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const target = join(categoryPath, entry.name);
      const info = await lstat(target);
      if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory()) continue;
      const realTarget = await realpath(target);
      if (!isDirectChild(categoryPath, realTarget, entry.name)) continue;
      await rm(realTarget, { recursive: info.isDirectory(), force: false });
      removed += 1;
    }
  }

  return { exitCode: 0, output: `Fake Docker prune removed ${removed} disposable fixture(s); volumes were kept.\n` };
}

function isDirectChild(parent: string, child: string, expectedName: string): boolean {
  return relative(parent, child) === expectedName && resolve(parent, expectedName) === child;
}

if (import.meta.main) {
  const result = await runFakeDockerCommand(process.argv.slice(2), "/sandbox");
  const writer = result.exitCode === 0 ? process.stdout : process.stderr;
  writer.write(result.output);
  process.exitCode = result.exitCode;
}
