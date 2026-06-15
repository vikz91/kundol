import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectProjectMarkers, groupDetectedRuntimes } from "../../src/core/discovery/markers";
import { calculateDirectorySize } from "../../src/core/discovery/size";
import { discoverWorkspaceProjects, shouldSkipDirectory } from "../../src/core/discovery/traversal";
import { inferProjectType } from "../../src/core/discovery/type-inference";
import { collectGitMetadata } from "../../src/core/discovery/git";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project marker detection", () => {
  test("detects supported runtime marker families", async () => {
    const root = await tempDir();
    await Promise.all([
      writeFile(join(root, "package.json"), JSON.stringify({ scripts: { dev: "bun run src/index.ts" } })),
      writeFile(join(root, "bun.lock"), ""),
      writeFile(join(root, "deno.json"), "{}"),
      writeFile(join(root, "pyproject.toml"), "[project]\nname = 'demo'\n"),
      writeFile(join(root, "go.mod"), "module example.com/demo\n"),
      writeFile(join(root, "Cargo.toml"), "[package]\nname = 'demo'\n"),
      writeFile(join(root, "pom.xml"), "<project />\n"),
      writeFile(join(root, "Demo.csproj"), "<Project />\n"),
    ]);
    await mkdir(join(root, ".git"));

    const markers = await detectProjectMarkers(root);
    const runtimes = new Set(markers.map((marker) => marker.runtime));

    expect(runtimes).toEqual(new Set(["node", "bun", "deno", "python", "go", "rust", "java", "dotnet", "git"]));
  });

  test("does not classify generated output alone as a project", async () => {
    const root = await tempDir();
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "bundle.js"), "console.log('generated');\n");

    expect(await detectProjectMarkers(root)).toEqual([]);
  });
});

describe("project type inference", () => {
  test("preserves all runtimes and chooses a deterministic primary runtime", async () => {
    const root = await tempDir();
    await Promise.all([
      writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.1.0" })),
      writeFile(join(root, "requirements.txt"), "pytest\n"),
      writeFile(join(root, "go.mod"), "module example.com/demo\n"),
    ]);

    const detectedRuntimes = groupDetectedRuntimes(await detectProjectMarkers(root));
    const inference = inferProjectType(detectedRuntimes);

    expect(inference.kind).toBe("mixed");
    expect(inference.primaryRuntime).toBe("bun");
    expect(inference.runtimes).toContain("node");
    expect(inference.runtimes).toContain("python");
    expect(inference.runtimes).toContain("go");
  });

  test("supports git-only projects", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".git"));

    const inference = inferProjectType(groupDetectedRuntimes(await detectProjectMarkers(root)));

    expect(inference.kind).toBe("git-only");
    expect(inference.primaryRuntime).toBe("git");
  });
});

describe("workspace traversal", () => {
  test("uses built-in generated/internal directory skip rules", () => {
    expect(shouldSkipDirectory(".git")).toBe(true);
    expect(shouldSkipDirectory("node_modules")).toBe(true);
    expect(shouldSkipDirectory(".venv")).toBe(true);
    expect(shouldSkipDirectory("target")).toBe(true);
    expect(shouldSkipDirectory("src")).toBe(false);
  });

  test("finds projects while skipping generated directories and exact excluded paths", async () => {
    const workspace = await tempDir();
    const app = join(workspace, "app");
    const ignored = join(workspace, "sensitive-project");
    const generated = join(workspace, "node_modules", "not-a-project");
    await mkdir(app, { recursive: true });
    await mkdir(ignored, { recursive: true });
    await mkdir(generated, { recursive: true });
    await writeFile(join(app, "package.json"), "{}");
    await writeFile(join(ignored, "package.json"), "{}");
    await writeFile(join(generated, "package.json"), "{}");

    const result = await discoverWorkspaceProjects(workspace, { excludedPaths: [ignored] });

    expect(result.projects.map((project) => project.name)).toEqual(["app"]);
    expect(result.skippedDirectories).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some((warning) => warning.code === "EXCLUDED_PATH_SKIPPED")).toBe(true);
  });

  test("does not follow symlinked directories", async () => {
    const workspace = await tempDir();
    const external = await tempDir();
    await writeFile(join(external, "package.json"), "{}");
    await symlink(external, join(workspace, "linked-project"));

    const result = await discoverWorkspaceProjects(workspace);

    expect(result.projects).toEqual([]);
    expect(result.warnings.some((warning) => warning.code === "SYMLINK_SKIPPED")).toBe(true);
  });
});

describe("directory size calculation", () => {
  test("counts files recursively and skips symlinks", async () => {
    const root = await tempDir();
    await mkdir(join(root, "src"));
    await writeFile(join(root, "a.txt"), "12345");
    await writeFile(join(root, "src", "b.txt"), "1234567890");
    await symlink(join(root, "a.txt"), join(root, "linked.txt"));

    const result = await calculateDirectorySize(root);

    expect(result.sizeBytes).toBe(15);
    expect(result.filesCounted).toBe(2);
    expect(result.skippedDirectories).toBe(1);
  });
});

describe("git metadata collection", () => {
  test("reads branch and origin without mutating repository files", async () => {
    const root = await tempDir();
    const gitDir = join(root, ".git");
    await mkdir(gitDir);
    await writeFile(join(gitDir, "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(gitDir, "config"), '[remote "origin"]\n\turl = git@example.com:demo/kundol.git\n');

    const metadata = await collectGitMetadata(root);

    expect(metadata.isGitRepo).toBe(true);
    expect(metadata.branch).toBe("main");
    expect(metadata.remoteUrl).toBe("git@example.com:demo/kundol.git");
    expect(metadata.dirty).toBe(null);
  });

  test("uses injected process runner for dirty status when provided", async () => {
    const root = await tempDir();
    const gitDir = join(root, ".git");
    await mkdir(gitDir);
    await writeFile(join(gitDir, "HEAD"), "ref: refs/heads/main\n");

    const metadata = await collectGitMetadata(root, {
      processRunner: {
        async run() {
          return { exitCode: 0, stdout: " M src/index.ts\n", stderr: "" };
        },
      },
    });

    expect(metadata.dirty).toBe(true);
  });
});

async function tempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "kundol-discovery-"));
  tempRoots.push(root);
  return root;
}
