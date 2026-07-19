import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyProjectOptimization, planProjectOptimization, scanProjectOptimizer } from "../../src/services/project-optimizer";

describe("project optimizer", () => {
  test("scans safe generated project-local cleanup candidates across runtimes", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "kundol-project-optimizer-"));
    await createNodeProject(path.join(workdir, "node-app"));
    await createPythonProject(path.join(workdir, "py-app"));
    await createGoProject(path.join(workdir, "go-app"));
    await createRustProject(path.join(workdir, "rust-app"));
    await createJavaProject(path.join(workdir, "java-app"));
    await createDotnetProject(path.join(workdir, "dotnet-app"));
    await createDenoProject(path.join(workdir, "deno-app"));

    const result = await scanProjectOptimizer({ workdir });
    const paths = result.candidates.map((candidate) => path.basename(candidate.absolutePath)).sort();

    expect(paths).toContain("node_modules");
    expect(paths).toContain(".next");
    expect(paths).toContain("__pycache__");
    expect(paths).toContain("coverage.out");
    expect(paths).toContain("target");
    expect(paths).toContain(".gradle");
    expect(paths).toContain("obj");
    expect(paths).toContain(".cache");
    expect(result.projects).toHaveLength(7);
    expect(result.reclaimableBytes).toBeGreaterThan(0);
  });

  test("does not descend into generated folders or select protected content", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "kundol-project-optimizer-"));
    const project = path.join(workdir, "node-app");
    await createNodeProject(project);
    await mkdir(path.join(project, "node_modules", "nested-project", "dist"), { recursive: true });
    await writeFile(path.join(project, "node_modules", "nested-project", "package.json"), "{}");
    await writeFile(path.join(project, "node_modules", "nested-project", "dist", "bundle.js"), "generated");
    await mkdir(path.join(project, "assets", "dist"), { recursive: true });
    await writeFile(path.join(project, "assets", "dist", "image.png"), "asset");
    await writeFile(path.join(project, ".env.local"), "SECRET=1");
    await writeFile(path.join(project, "local.sqlite"), "db");

    const result = await scanProjectOptimizer({ workdir });
    const relativePaths = result.candidates.map((candidate) => candidate.projectRelativePath);

    expect(relativePaths).toContain("node_modules");
    expect(relativePaths).not.toContain("node_modules/nested-project/dist");
    expect(relativePaths).not.toContain("assets/dist");
    expect(relativePaths).not.toContain(".env.local");
    expect(relativePaths).not.toContain("local.sqlite");
    expect(relativePaths).not.toContain(".");
  });

  test("honors max depth while finding projects", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "kundol-project-optimizer-"));
    const nestedProject = path.join(workdir, "one", "two", "three", "node-app");
    await createNodeProject(nestedProject);

    const shallow = await scanProjectOptimizer({ workdir, maxDepth: 2 });
    const deep = await scanProjectOptimizer({ workdir, maxDepth: 4 });

    expect(shallow.projects).toHaveLength(0);
    expect(shallow.candidates).toHaveLength(0);
    expect(deep.projects).toHaveLength(1);
    expect(deep.candidates.some((candidate) => candidate.projectRelativePath === "node_modules")).toBe(true);
  });

  test("apply re-checks live paths and deletes only still-safe candidates", async () => {
    const workdir = await mkdtemp(path.join(tmpdir(), "kundol-project-optimizer-"));
    const project = path.join(workdir, "node-app");
    await createNodeProject(project);

    const plan = await planProjectOptimization({ workdir });
    const nodeModules = plan.candidates.find((candidate) => candidate.projectRelativePath === "node_modules");
    expect(nodeModules).toBeDefined();

    if (nodeModules) {
      await rmDir(nodeModules.absolutePath);
      await writeFile(nodeModules.absolutePath, "changed from generated directory to file");
    }

    const result = await applyProjectOptimization(plan);

    expect(result.deleted.map((candidate) => candidate.projectRelativePath)).toContain(".next");
    expect(result.skipped.some((entry) => entry.candidate.projectRelativePath === "node_modules" && entry.reason.includes("type changed"))).toBe(true);
    await expectPathMissing(path.join(project, ".next"));
    await expectPathExists(path.join(project, "node_modules"));
    await expectPathExists(path.join(project, "package.json"));
  });
});

async function createNodeProject(root: string): Promise<void> {
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(path.join(root, ".next"), { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}");
  await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "module");
  await writeFile(path.join(root, ".next", "build-id"), "generated");
}

async function createPythonProject(root: string): Promise<void> {
  await mkdir(path.join(root, "__pycache__"), { recursive: true });
  await writeFile(path.join(root, "pyproject.toml"), "[project]\nname = 'demo'\n");
  await writeFile(path.join(root, "__pycache__", "app.pyc"), "compiled");
}

async function createGoProject(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "go.mod"), "module example.com/demo\n");
  await writeFile(path.join(root, "coverage.out"), "mode: set\n");
}

async function createRustProject(root: string): Promise<void> {
  await mkdir(path.join(root, "target", "debug"), { recursive: true });
  await writeFile(path.join(root, "Cargo.toml"), "[package]\nname = 'demo'\nversion = '0.0.0'\n");
  await writeFile(path.join(root, "target", "debug", "app"), "binary");
}

async function createJavaProject(root: string): Promise<void> {
  await mkdir(path.join(root, ".gradle"), { recursive: true });
  await writeFile(path.join(root, "pom.xml"), "<project />");
  await writeFile(path.join(root, ".gradle", "cache.bin"), "cache");
}

async function createDotnetProject(root: string): Promise<void> {
  await mkdir(path.join(root, "obj"), { recursive: true });
  await writeFile(path.join(root, "app.csproj"), "<Project />");
  await writeFile(path.join(root, "obj", "project.assets.json"), "{}");
}

async function createDenoProject(root: string): Promise<void> {
  await mkdir(path.join(root, ".cache"), { recursive: true });
  await writeFile(path.join(root, "deno.json"), "{}");
  await writeFile(path.join(root, ".cache", "deno.bin"), "cache");
}

async function rmDir(absolutePath: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(absolutePath, { recursive: true, force: true });
}

async function expectPathExists(absolutePath: string): Promise<void> {
  await expect(stat(absolutePath)).resolves.toBeDefined();
}

async function expectPathMissing(absolutePath: string): Promise<void> {
  await expect(stat(absolutePath)).rejects.toThrow();
}
