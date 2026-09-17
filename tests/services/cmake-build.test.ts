import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import {
  cmakeBuildAction,
  cmakeBuildOwnerVerified,
  cmakeBuildProjectMarker,
  cmakeBuildSelector,
} from "../../src/services/optimisation-registry/cmake-build";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import type { RegistryCandidate, RegistryEngineContext, RegistryRule } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function rule(): RegistryRule {
  const found = structuredClone(catalogue.rules.find((entry) => entry.id === "project.cmake.build"));
  if (!found) throw new Error("CMake rule missing");
  return found;
}

function selectorObject() {
  if (typeof cmakeBuildSelector === "function") throw new Error("targeted CMake selector required");
  return cmakeBuildSelector;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-cmake-build-"));
  roots.push(root);
  const workdir = path.join(root, "workdir");
  const project = path.join(workdir, "project");
  const build = path.join(project, "build");
  const marker = path.join(project, "CMakeLists.txt");
  const cache = path.join(build, "CMakeCache.txt");
  const object = path.join(build, "CMakeFiles", "app.dir", "main.o");
  await mkdir(path.dirname(object), { recursive: true });
  await writeFile(marker, "cmake_minimum_required(VERSION 3.20)\nproject(Demo)");
  await writeFile(cache, cacheText(project, build));
  await writeFile(object, "generated object");
  const old = new Date("2026-09-01T07:00:00Z");
  for (const item of [cache, object, path.dirname(object), path.join(build, "CMakeFiles"), build]) await utimes(item, old, old);
  const context: RegistryEngineContext = {
    homeDir: path.join(root, "home"), workdirRoot: workdir, projectRoots: [project],
  };
  await mkdir(context.homeDir);
  return { root, workdir, project, build, marker, cache, object, context };
}

function cacheText(source: string, build: string, extra = "") {
  return [
    "# CMake-generated cache fixture",
    `CMAKE_HOME_DIRECTORY:INTERNAL=${source}`,
    `CMAKE_CACHEFILE_DIR:INTERNAL=${build}`,
    "CMAKE_GENERATOR:INTERNAL=Ninja",
    "CMAKE_INSTALL_PREFIX:PATH=/usr/local",
    extra,
  ].join("\n");
}

function candidateFor(ruleEntry: RegistryRule, target: Awaited<ReturnType<typeof capturePathTarget>>): RegistryCandidate {
  return {
    id: `${ruleEntry.id}@${target.key}`, ruleId: ruleEntry.id,
    categoryId: ruleEntry.categoryId, label: ruleEntry.label, description: ruleEntry.description,
    scope: ruleEntry.scope, status: ruleEntry.status, tier: ruleEntry.review.tier,
    forceEligible: ruleEntry.review.forceEligible, action: ruleEntry.action,
    target, evidence: [], sources: ruleEntry.sourceRefs.map((reference) => catalogue.sources[reference]!),
  };
}

describe("CMake verified project build trees", () => {
  test("lists a project-local build with exact cache source/build identity and generated marker", async () => {
    const f = await fixture();
    const listed = await selectorObject().list(rule(), f.context);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "path", absolutePath: f.build, scopeRoot: f.project, targetKind: "directory" });
    const captured = await capturePathTarget(f.build, f.project, "directory");
    expect(await selectorObject().lookup(rule(), captured, f.context)).toMatchObject({ absolutePath: f.build });
    expect(await cmakeBuildProjectMarker(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
    expect(await cmakeBuildOwnerVerified(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
  });

  test("cache source/build mismatch or duplicate owner entries fail closed", async () => {
    const f = await fixture();
    const captured = await capturePathTarget(f.build, f.project, "directory");
    for (const source of [
      cacheText(path.join(f.root, "other"), f.build),
      cacheText(f.project, path.join(f.root, "other")),
      cacheText(f.project, f.build, `CMAKE_HOME_DIRECTORY:INTERNAL=${f.project}`),
    ]) {
      await writeFile(f.cache, source);
      expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
      expect(await selectorObject().lookup(rule(), captured, f.context)).toBeNull();
    }
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });

  test("rejects installation into build tree, release packages, protected files, and symlinks", async () => {
    const f = await fixture();
    await writeFile(f.cache, cacheText(f.project, f.build).replace(
      "CMAKE_INSTALL_PREFIX:PATH=/usr/local", `CMAKE_INSTALL_PREFIX:PATH=${path.join(f.build, "install")}`,
    ));
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    await writeFile(f.cache, cacheText(f.project, f.build));
    const packageFile = path.join(f.build, "release.tar.gz");
    await writeFile(packageFile, "retained package");
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    await rm(packageFile);
    const secret = path.join(f.build, ".env.production");
    await writeFile(secret, "user secret");
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    await rm(secret);
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await symlink(outside, path.join(f.build, "linked"));
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
  });

  test("rejects release-like build names and an in-source build", async () => {
    const f = await fixture();
    const release = path.join(f.project, "build-release");
    await mkdir(path.join(release, "CMakeFiles"), { recursive: true });
    await writeFile(path.join(release, "CMakeCache.txt"), cacheText(f.project, release));
    const inSource = path.join(f.project, "CMakeCache.txt");
    await writeFile(inSource, cacheText(f.project, f.project));
    const listed = await selectorObject().list(rule(), f.context);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ absolutePath: f.build });
  });

  test("lookup and action recheck changed owner metadata before removal", async () => {
    const f = await fixture();
    const captured = await capturePathTarget(f.build, f.project, "directory");
    const candidate = candidateFor(rule(), captured);
    await writeFile(f.cache, cacheText(path.join(f.root, "other"), f.build));
    expect(await selectorObject().lookup(rule(), captured, f.context)).toBeNull();
    expect(await cmakeBuildOwnerVerified(rule(), candidate, f.context)).toContain("could not be verified");
    await expect(cmakeBuildAction(rule(), candidate, f.context)).rejects.toThrow("could not be verified");
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });

  test("explicit action removes only the verified build tree through secure removal", async () => {
    const f = await fixture();
    const retained = path.join(f.project, "release.pkg");
    await writeFile(retained, "outside build retention");
    const captured = await capturePathTarget(f.build, f.project, "directory");
    const result = await cmakeBuildAction(rule(), candidateFor(rule(), captured), f.context);
    expect(result).toEqual({ reclaimedBytes: captured.sizeBytes });
    await expect(readFile(f.object, "utf8")).rejects.toThrow();
    expect(await readFile(retained, "utf8")).toBe("outside build retention");
    expect(await readFile(f.marker, "utf8")).toContain("project(Demo)");
  });

  test("tampered rule tier or action binding never inventories a removable target", async () => {
    const f = await fixture();
    const lowered = rule();
    lowered.review = { tier: "safe", selection: "suggested", forceEligible: true };
    expect(await selectorObject().list(lowered, f.context)).toHaveLength(0);
    const rebound = rule();
    rebound.action = { kind: "adapter", adapterId: "other.remove" };
    expect(await selectorObject().list(rebound, f.context)).toHaveLength(0);
  });

  test("over-budget build roots are omitted rather than returning a partial plan", async () => {
    const f = await fixture();
    for (let index = 0; index < 16; index++) {
      const build = path.join(f.project, `cmake-build-debug-${index}`);
      await mkdir(path.join(build, "CMakeFiles"), { recursive: true });
      await writeFile(path.join(build, "CMakeCache.txt"), cacheText(f.project, build));
    }
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    expect(await readFile(f.object, "utf8")).toBe("generated object");
  });
});
