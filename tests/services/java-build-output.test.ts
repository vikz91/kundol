import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import {
  javaBuildOutputAction, javaBuildOutputOwnerVerified, javaBuildOutputProjectMarker, javaBuildOutputSelector,
} from "../../src/services/optimisation-registry/java-build-output";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import type { RegistryCandidate, RegistryEngineContext, RegistryRule, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const old = new Date("2000-01-01T00:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function rule(): RegistryRule {
  const found = structuredClone(catalogue.rules.find((entry) => entry.id === "project.java.build_output"));
  if (!found) throw new Error("Java build-output proposal missing");
  return found;
}

function selectorObject(selector: RegistrySelectorAdapter) {
  if (typeof selector === "function") throw new Error("targeted Java selector required");
  return selector;
}

async function ageTree(current: string): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const child = path.join(current, entry.name);
    if (entry.isDirectory()) await ageTree(child);
    else await utimes(child, old, old);
  }
  await utimes(current, old, old);
}

function pom() {
  return `<project xmlns="http://maven.apache.org/POM/4.0.0">
<modelVersion>4.0.0</modelVersion><groupId>dev.example</groupId>
<artifactId>demo</artifactId><version>1.0</version></project>`;
}

async function fixture(variant: "maven" | "gradle") {
  const root = await mkdtemp(path.join(tmpdir(), `kundol-java-${variant}-`));
  roots.push(root);
  const workdir = path.join(root, "workdir");
  const project = path.join(workdir, "demo");
  const output = path.join(project, variant === "maven" ? "target" : "build");
  const generated = path.join(output, variant === "maven" ? "classes" : "classes/java/main", "App.class");
  const marker = path.join(project, variant === "maven" ? "pom.xml" : "build.gradle.kts");
  await mkdir(path.dirname(generated), { recursive: true });
  await writeFile(generated, "compiled class");
  await writeFile(marker, variant === "maven" ? pom() : "plugins { java }\n");
  if (variant === "gradle") await writeFile(path.join(project, "settings.gradle.kts"), 'rootProject.name = "demo"\n');
  await ageTree(output);
  const context: RegistryEngineContext = {
    homeDir: path.join(root, "home"), workdirRoot: workdir, projectRoots: [project],
  };
  await mkdir(context.homeDir);
  return { root, workdir, project, output, generated, marker, context };
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

describe("Java exact Maven and Gradle build-output adapter", () => {
  test("lists both default output variants and targeted lookup rechecks the exact owner", async () => {
    const maven = await fixture("maven");
    const gradle = await fixture("gradle");
    for (const f of [maven, gradle]) {
      const listed = await selectorObject(javaBuildOutputSelector).list(rule(), f.context);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ kind: "path", absolutePath: f.output, scopeRoot: f.project });
    }
    const mavenCaptured = await capturePathTarget(maven.output, maven.project, "directory");
    const gradleCaptured = await capturePathTarget(gradle.output, gradle.project, "directory");
    expect(await selectorObject(javaBuildOutputSelector).lookup(rule(), mavenCaptured, maven.context)).toMatchObject({ absolutePath: maven.output });
    expect(await selectorObject(javaBuildOutputSelector).lookup(rule(), gradleCaptured, gradle.context)).toMatchObject({ absolutePath: gradle.output });
    expect(await javaBuildOutputProjectMarker(rule(), candidateFor(rule(), gradleCaptured), gradle.context)).toBe(true);
    expect(await javaBuildOutputOwnerVerified(rule(), candidateFor(rule(), mavenCaptured), maven.context)).toBe(true);
  });

  test("Maven parent, build overrides, profiles, and malformed POMs are unsupported", async () => {
    const f = await fixture("maven");
    for (const source of [
      pom().replace("</project>", "<build><directory>target</directory></build></project>"),
      pom().replace("</project>", "<parent><artifactId>parent</artifactId></parent></project>"),
      pom().replace("</project>", "<profiles></profiles></project>"),
      pom().replace("4.0.0</modelVersion>", "3.0.0</modelVersion>"),
      pom().replace("</project>", "<packaging>ear</packaging></project>"),
      pom().replace("<groupId>dev.example</groupId>", ""),
      pom().replace("</project>", "<broken></project>"),
    ]) {
      await writeFile(f.marker, source);
      expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    }
    await writeFile(f.marker, pom());
    await mkdir(path.join(f.project, ".mvn"));
    await writeFile(path.join(f.project, ".mvn", "maven.config"), "-Dbuild.directory=other");
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
  });

  test("Gradle custom build locations and nonlocal/dynamic settings are unsupported", async () => {
    const f = await fixture("gradle");
    const settings = path.join(f.project, "settings.gradle.kts");
    for (const script of [
      'plugins { java }\nlayout.buildDirectory = layout.projectDirectory.dir("out")',
      'plugins { id("com.android.application") }',
      'plugins { java }\ntasks.register("archive") { }',
    ]) {
      await writeFile(f.marker, script);
      expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    }
    await writeFile(f.marker, "plugins { java }");
    await writeFile(settings, 'include("subproject")');
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    await writeFile(settings, 'rootProject.name = "demo"');
    await symlink(f.marker, path.join(f.project, "build.gradle"));
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.project, "build.gradle"));
    await writeFile(path.join(f.project, "gradle.properties"), "org.gradle.project.buildDir=other");
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
  });

  test("a simple Groovy Gradle Java project has the same exact default-build contract", async () => {
    const f = await fixture("gradle");
    await rm(f.marker);
    await rm(path.join(f.project, "settings.gradle.kts"));
    await writeFile(path.join(f.project, "build.gradle"), "plugins { id 'java' }");
    await writeFile(path.join(f.project, "settings.gradle"), "rootProject.name = 'demo'");
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(1);
  });

  test("release archives, protected data, symlinks, and fresh trees suppress review candidates", async () => {
    const f = await fixture("gradle");
    const retained = path.join(f.output, "libs", "demo.jar");
    await mkdir(path.dirname(retained));
    await writeFile(retained, "unique release");
    await ageTree(f.output);
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.dirname(retained), { recursive: true });
    await writeFile(path.join(f.output, "metadata.sqlite"), "database");
    await ageTree(f.output);
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.output, "metadata.sqlite"));
    await ageTree(f.output);
    await symlink(f.marker, path.join(f.output, "linked-owner"));
    await utimes(f.output, old, old);
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.output, "linked-owner"));
    await ageTree(f.output);
    await writeFile(path.join(f.output, "recent.txt"), "currently active");
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    expect(await readFile(f.generated, "utf8")).toBe("compiled class");
  });

  test("lookup and action refuse changed owner metadata or a review target replaced by a symlink", async () => {
    const f = await fixture("maven");
    const captured = await capturePathTarget(f.output, f.project, "directory");
    await writeFile(f.marker, pom().replace("</project>", "<build/></project>"));
    expect(await selectorObject(javaBuildOutputSelector).lookup(rule(), captured, f.context)).toBeNull();
    await expect(javaBuildOutputAction(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("could not be verified");
    await writeFile(f.marker, pom());
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await rm(f.output, { recursive: true });
    await symlink(outside, f.output);
    expect(await selectorObject(javaBuildOutputSelector).lookup(rule(), captured, f.context)).toBeNull();
    await expect(javaBuildOutputAction(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("could not be verified");
  });

  test("explicit action removes only the reviewed generated tree and retains project data", async () => {
    for (const variant of ["maven", "gradle"] as const) {
      const f = await fixture(variant);
      const pinned = path.join(f.project, "dependency-lock.txt");
      await writeFile(pinned, "pinned dependencies");
      const captured = await capturePathTarget(f.output, f.project, "directory");
      expect(await javaBuildOutputAction(rule(), candidateFor(rule(), captured), f.context)).toEqual({ reclaimedBytes: captured.sizeBytes });
      await expect(readFile(f.generated, "utf8")).rejects.toThrow();
      expect(await readFile(pinned, "utf8")).toBe("pinned dependencies");
      expect(await readFile(f.marker, "utf8")).toContain(variant === "maven" ? "artifactId" : "plugins");
    }
  });

  test("rule tier/binding and workdir boundary are not caller-overridable", async () => {
    const f = await fixture("maven");
    const tampered = rule();
    tampered.review.tier = "safe";
    expect(await selectorObject(javaBuildOutputSelector).list(tampered, f.context)).toHaveLength(0);
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), { homeDir: f.context.homeDir, projectRoots: [f.project] })).toHaveLength(0);
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), { ...f.context, workdirRoot: f.root, projectRoots: [f.project, f.root] })).toHaveLength(1);
  });

  test("an over-budget project root is omitted instead of producing a partial plan", async () => {
    const f = await fixture("maven");
    for (let index = 0; index < 4_097; index++) {
      await writeFile(path.join(f.project, `entry-${index}`), "other project data");
    }
    expect(await selectorObject(javaBuildOutputSelector).list(rule(), f.context)).toHaveLength(0);
    expect(await readFile(f.generated, "utf8")).toBe("compiled class");
  });
});
