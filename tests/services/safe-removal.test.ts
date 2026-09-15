import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import { removeGeneratedPathSafely } from "../../src/services/optimisation-registry/safe-removal";

const temporaryRoots: string[] = [];

async function fixture(): Promise<{ root: string; project: string }> {
  const temporary = await mkdtemp(path.join(tmpdir(), "kundol-safe-removal-"));
  temporaryRoots.push(temporary);
  // macOS /tmp is a symlink; the helper intentionally rejects symlinked
  // ancestors, so use the canonical path for its descriptor chain.
  const root = await realpath(temporary);
  const project = path.join(root, "project");
  await mkdir(project);
  return { root, project };
}

async function exists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("descriptor-relative generated removal", () => {
  test("removes a reviewed generated directory without traversing nested symlinks", async () => {
    const { root, project } = await fixture();
    const targetPath = path.join(project, "node_modules");
    const outside = path.join(root, "outside");
    await mkdir(targetPath);
    await mkdir(outside);
    await writeFile(path.join(targetPath, "generated.js"), "generated");
    await writeFile(path.join(outside, "keep.txt"), "keep");
    await symlink(outside, path.join(targetPath, "outside-link"));

    const target = await capturePathTarget(targetPath, project, "directory");
    await removeGeneratedPathSafely(target);

    expect(await exists(targetPath)).toBe(false);
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("keep");
  });

  test("removes a reviewed generated file", async () => {
    const { project } = await fixture();
    const targetPath = path.join(project, ".eslintcache");
    await writeFile(targetPath, "generated");
    const target = await capturePathTarget(targetPath, project, "file");

    await removeGeneratedPathSafely(target);

    expect(await exists(targetPath)).toBe(false);
  });

  test("accepts macOS /var temporary paths via the reviewed canonical target path", async () => {
    if (process.platform !== "darwin") return;
    const temporary = await mkdtemp(path.join(tmpdir(), "kundol-safe-removal-var-"));
    temporaryRoots.push(temporary);
    const project = path.join(temporary, "project");
    const targetPath = path.join(project, "node_modules");
    await mkdir(project);
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "generated.js"), "generated");
    const target = await capturePathTarget(targetPath, project, "directory");
    expect(target.absolutePath.startsWith("/var/")).toBe(true);
    expect(target.realPath.startsWith("/private/var/")).toBe(true);

    await removeGeneratedPathSafely(target);

    expect(await exists(targetPath)).toBe(false);
  });

  test("refuses an ancestor replaced by a symlink rather than deleting outside scope", async () => {
    const { root, project } = await fixture();
    const targetPath = path.join(project, "node_modules");
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "generated.js"), "generated");
    const target = await capturePathTarget(targetPath, project, "directory");

    const outside = path.join(root, "outside");
    await mkdir(outside);
    await mkdir(path.join(outside, "node_modules"));
    await writeFile(path.join(outside, "node_modules", "keep.txt"), "keep");
    const movedProject = path.join(root, "project-moved");
    await rename(project, movedProject);
    await symlink(outside, project);

    await expect(removeGeneratedPathSafely(target)).rejects.toThrow();
    expect(await readFile(path.join(outside, "node_modules", "keep.txt"), "utf8")).toBe("keep");
    expect(await exists(path.join(movedProject, "node_modules", "generated.js"))).toBe(true);
  });

  test("fails closed when the descriptor-relative interpreter is unavailable", async () => {
    const { project } = await fixture();
    const targetPath = path.join(project, "node_modules");
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "keep.js"), "keep");
    const target = await capturePathTarget(targetPath, project, "directory");

    await expect(removeGeneratedPathSafely(target, { pythonExecutable: "/nonexistent/kundol-python3" })).rejects.toThrow();
    expect(await readFile(path.join(targetPath, "keep.js"), "utf8")).toBe("keep");
  });
});
