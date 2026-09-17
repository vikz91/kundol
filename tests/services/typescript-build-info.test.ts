import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import {
  typescriptBuildInfoAction,
  typescriptBuildInfoProjectMarker,
  typescriptBuildInfoSelector,
} from "../../src/services/optimisation-registry/typescript-build-info";
import type { RegistryCandidate, RegistryEngineContext, RegistryRule } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function rule(): RegistryRule {
  const found = structuredClone(catalogue.rules.find((entry) => entry.id === "project.typescript.build_info"));
  if (!found) throw new Error("TypeScript build-info rule missing");
  return found;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-ts-build-info-"));
  roots.push(root);
  const workdir = path.join(root, "workdir");
  const project = path.join(workdir, "project");
  await mkdir(project, { recursive: true });
  const context: RegistryEngineContext = { homeDir: path.join(root, "home"), workdirRoot: workdir, projectRoots: [project] };
  await mkdir(context.homeDir);
  return { root, workdir, project, context };
}

async function writeConfig(project: string, source: string, filename = "tsconfig.json") {
  const config = path.join(project, filename);
  await writeFile(config, source);
  return config;
}

async function writeBuildInfo(project: string, filename = "project.tsbuildinfo") {
  const target = path.join(project, filename);
  await writeFile(target, "generated TypeScript metadata");
  const old = new Date("2026-09-01T07:00:00Z");
  await utimes(target, old, old);
  return target;
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

function selectorObject() {
  if (typeof typescriptBuildInfoSelector === "function") throw new Error("targeted TypeScript selector required");
  return typescriptBuildInfoSelector;
}

describe("TypeScript configured build-info adapter", () => {
  test("JSONC config identifies only its explicit incremental metadata path", async () => {
    const f = await fixture();
    await writeConfig(f.project, `{
      // incremental metadata owned by this config
      "compilerOptions": {
        "incremental": true,
        "tsBuildInfoFile": "./project.tsbuildinfo",
      },
    }`);
    const target = await writeBuildInfo(f.project);
    const listed = await selectorObject().list(rule(), f.context);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "path", absolutePath: target, scopeRoot: f.project, targetKind: "file" });
    const captured = await capturePathTarget(target, f.project, "file");
    expect(await selectorObject().lookup(rule(), captured, f.context)).toMatchObject({ absolutePath: target });
    expect(await typescriptBuildInfoProjectMarker(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
  });

  test("rejects extends, implicit paths, disabled incrementality, and outside paths", async () => {
    const f = await fixture();
    const target = await writeBuildInfo(f.project);
    const configs = [
      `{ "extends": "../base.json", "compilerOptions": { "incremental": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`,
      `{ "compilerOptions": { "incremental": true } }`,
      `{ "compilerOptions": { "incremental": false, "tsBuildInfoFile": "project.tsbuildinfo" } }`,
      `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "../outside.tsbuildinfo" } }`,
    ];
    for (const source of configs) {
      await writeConfig(f.project, source);
      expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    }
    expect(await readFile(target, "utf8")).toBe("generated TypeScript metadata");
  });

  test("rejects a symlinked config and bounds config count without traversing descendants", async () => {
    const f = await fixture();
    const outside = path.join(f.root, "outside.json");
    await writeFile(outside, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`);
    await symlink(outside, path.join(f.project, "tsconfig.json"));
    await writeBuildInfo(f.project);
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.project, "tsconfig.json"));
    for (let index = 0; index < 17; index++) {
      await writeConfig(f.project, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`, `tsconfig-${index}.json`);
    }
    expect(await selectorObject().list(rule(), f.context)).toHaveLength(0);
  });

  test("lookup and action refuse a config path changed after review", async () => {
    const f = await fixture();
    await writeConfig(f.project, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`);
    const target = await writeBuildInfo(f.project);
    const captured = await capturePathTarget(target, f.project, "file");
    const candidate = candidateFor(rule(), captured);
    await writeConfig(f.project, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "other.tsbuildinfo" } }`);
    expect(await selectorObject().lookup(rule(), captured, f.context)).toBeNull();
    expect(await typescriptBuildInfoProjectMarker(rule(), candidate, f.context)).toContain("no longer matches");
    await expect(typescriptBuildInfoAction(rule(), candidate, f.context)).rejects.toThrow("no longer matches");
    expect(await readFile(target, "utf8")).toBe("generated TypeScript metadata");
  });

  test("action removes only the verified metadata file through secure path removal", async () => {
    const f = await fixture();
    await writeConfig(f.project, `{ "compilerOptions": { "composite": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`);
    const target = await writeBuildInfo(f.project);
    const retained = path.join(f.project, "release.dll");
    await writeFile(retained, "keep");
    const captured = await capturePathTarget(target, f.project, "file");
    const result = await typescriptBuildInfoAction(rule(), candidateFor(rule(), captured), f.context);
    expect(result).toEqual({ reclaimedBytes: "generated TypeScript metadata".length });
    expect(await readFile(retained, "utf8")).toBe("keep");
    await expect(readFile(target, "utf8")).rejects.toThrow();
  });

  test("refuses a recreated target with a different inode", async () => {
    const f = await fixture();
    await writeConfig(f.project, `{ "compilerOptions": { "incremental": true, "tsBuildInfoFile": "project.tsbuildinfo" } }`);
    const target = await writeBuildInfo(f.project);
    const captured = await capturePathTarget(target, f.project, "file");
    await rm(target);
    await writeFile(target, "new user data");
    await expect(typescriptBuildInfoAction(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("changed before removal");
    expect(await readFile(target, "utf8")).toBe("new user data");
  });
});
