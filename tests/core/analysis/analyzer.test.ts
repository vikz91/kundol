import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeProjectCleanup } from "../../../src/core/analysis/analyzer";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("project cleanup analyzer", () => {
  test("aggregates safe, caution, and protected bytes without deleting anything", async () => {
    const projectPath = await makeTempProject();
    await writeFile(path.join(projectPath, "package.json"), "{}");
    await writeFile(path.join(projectPath, ".env"), "SECRET=1");
    await mkdir(path.join(projectPath, "src"));
    await writeFile(path.join(projectPath, "src", "index.ts"), "console.log('hello');");
    await mkdir(path.join(projectPath, "node_modules", "dep"), { recursive: true });
    await writeFile(path.join(projectPath, "node_modules", "dep", "index.js"), "x".repeat(128));
    await mkdir(path.join(projectPath, "reports"));
    await writeFile(path.join(projectPath, "reports", "summary.json"), "x".repeat(64));

    const result = await analyzeProjectCleanup({
      projectPath,
      projectName: "sample",
      runtimes: ["node"],
      status: "STALE",
    });

    expect(result.summary.totalSizeBytes).toBeGreaterThan(0);
    expect(result.summary.safeCleanupBytes).toBeGreaterThanOrEqual(128);
    expect(result.summary.cautionBytes).toBeGreaterThanOrEqual(64);
    expect(result.items.some((item) => item.path === "node_modules" && item.classification === "safe")).toBe(true);
    expect(result.items.some((item) => item.path === ".env" && item.classification === "protected")).toBe(true);
    expect(result.recommendations.some((item) => item.kind === "clean-preview")).toBe(true);
    expect(result.recommendations.some((item) => item.kind === "archive-later")).toBe(true);
  });
});

async function makeTempProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "kundol-analysis-test-"));
  roots.push(root);
  return root;
}
