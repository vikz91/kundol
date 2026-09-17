import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import { createPythonTestEnvironmentBindings } from "../../src/services/optimisation-registry/python-test-environments";
import type { RegistryCandidate, RegistryEngineContext, RegistryRule, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2000-01-01T00:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function rule(): RegistryRule {
  const found = structuredClone(catalogue.rules.find((entry) => entry.id === "project.python.test_envs"));
  if (!found) throw new Error("Python test-environment proposal missing");
  return found;
}

function selectorObject(selector: RegistrySelectorAdapter) {
  if (typeof selector === "function") throw new Error("targeted Python test-environment selector required");
  return selector;
}

async function ageTree(current: string): Promise<void> {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const child = path.join(current, entry.name);
    if (entry.isDirectory()) await ageTree(child);
    else if (!entry.isSymbolicLink()) await utimes(child, old, old);
  }
  await utimes(current, old, old);
}

async function fixture(variant: "tox" | "nox") {
  const root = await mkdtemp(path.join(tmpdir(), `kundol-python-${variant}-`));
  roots.push(root);
  const workdir = path.join(root, "workdir");
  const project = path.join(workdir, "project");
  const container = path.join(project, variant === "tox" ? ".tox" : ".nox");
  const session = variant === "tox" ? "py311" : "tests";
  const target = path.join(container, session);
  const config = path.join(project, variant === "tox" ? "tox.ini" : "noxfile.py");
  const pyvenv = path.join(target, "pyvenv.cfg");
  const python = path.join(target, "bin", "python");
  const installed = path.join(target, "lib", "site-packages", "installed.txt");
  await mkdir(path.dirname(python), { recursive: true });
  await mkdir(path.dirname(installed), { recursive: true });
  await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = 'demo'");
  await writeFile(config, variant === "tox" ?
    "[tox]\nenv_list = py311\n[testenv]\ndeps = pytest==8.3.2\ncommands = python -m pytest\n" :
    'import nox\n@nox.session\ndef tests(session):\n    session.install("pytest==8.3.2")\n    session.run("pytest")\n');
  await writeFile(pyvenv, "home = /usr/bin\ninclude-system-site-packages = false\n");
  await symlink("/usr/bin/python3", python);
  await writeFile(installed, "test dependency");
  await ageTree(target);
  const context: RegistryEngineContext = {
    homeDir: path.join(root, "home"), workdirRoot: workdir, projectRoots: [project],
  };
  await mkdir(context.homeDir);
  return { root, workdir, project, container, session, target, config, pyvenv, python, installed, context };
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

describe("exact pinned tox and Nox session-environment adapter", () => {
  test("lists one named tox or Nox virtualenv, with targeted owner lookup and validators", async () => {
    for (const variant of ["tox", "nox"] as const) {
      const f = await fixture(variant);
      const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
      const listed = await selectorObject(bindings.selector).list(rule(), f.context);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ kind: "path", absolutePath: f.target, scopeRoot: f.project, targetKind: "directory" });
      const captured = await capturePathTarget(f.target, f.project, "directory");
      expect(await selectorObject(bindings.selector).lookup(rule(), captured, f.context)).toMatchObject({ absolutePath: f.target });
      expect(await bindings.ownerVerified(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
      expect(await bindings.projectMarker(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
      expect(await bindings.processUnused(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
    }
  });

  test("unpinned, custom, or dynamic configs and competing config precedence fail closed", async () => {
    const tox = await fixture("tox");
    const nox = await fixture("nox");
    const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
    await writeFile(tox.config, "[tox]\nenv_list = py311\n[testenv]\ndeps = pytest\ncommands = python -m pytest");
    expect(await selectorObject(bindings.selector).list(rule(), tox.context)).toHaveLength(0);
    await writeFile(tox.config, "[tox]\nenv_list = py311\nwork_dir = other\n[testenv]\ndeps = pytest==8.3.2\ncommands = python -m pytest");
    expect(await selectorObject(bindings.selector).list(rule(), tox.context)).toHaveLength(0);
    await writeFile(tox.config, "[tox]\nenv_list = py311\n[testenv]\ndeps = pytest==8.3.2\ncommands = python -m pytest");
    await writeFile(path.join(tox.project, "tox.toml"), "[tox]");
    expect(await selectorObject(bindings.selector).list(rule(), tox.context)).toHaveLength(0);
    await writeFile(nox.config, 'import nox\n@nox.session\ndef tests(session):\n    session.install("pytest")\n    session.run("pytest")');
    expect(await selectorObject(bindings.selector).list(rule(), nox.context)).toHaveLength(0);
    await writeFile(nox.config, 'import nox\n@nox.session\ndef tests(session):\n    session.install("pytest==8.3.2")\n    session.run("pytest")\n    session.run("sh", "-c", "other")');
    expect(await selectorObject(bindings.selector).list(rule(), nox.context)).toHaveLength(0);
  });

  test("missing Python metadata, recent files, retained logs, and symlink ancestry suppress candidates", async () => {
    const f = await fixture("tox");
    const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
    await writeFile(f.pyvenv, "home = relative/python");
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await writeFile(f.pyvenv, "home = /usr/bin");
    await utimes(f.pyvenv, old, old);
    await writeFile(path.join(f.target, "current.txt"), "recent test activity");
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.target, "current.txt"));
    await mkdir(path.join(f.target, "log"));
    await writeFile(path.join(f.target, "log", "run.log"), "retained result");
    await ageTree(f.target);
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await rm(f.container, { recursive: true });
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await symlink(outside, f.container);
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    expect(await selectorObject(bindings.selector).list(rule(), { homeDir: f.context.homeDir, projectRoots: [f.project] })).toHaveLength(0);
  });

  test("an active or uninspectable process blocks list, lookup, validators, and action", async () => {
    const f = await fixture("nox");
    const captured = await capturePathTarget(f.target, f.project, "directory");
    for (const reason of ["active Python interpreter", "same-user process visibility incomplete"]) {
      const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => reason });
      expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
      expect(await selectorObject(bindings.selector).lookup(rule(), captured, f.context)).toBeNull();
      expect(await bindings.processUnused(rule(), candidateFor(rule(), captured), f.context)).toBe(reason);
      await expect(bindings.action(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("could not be verified");
    }
    expect(await readFile(f.installed, "utf8")).toBe("test dependency");
  });

  test("selected removal keeps sibling sessions, test evidence outside target, and pins", async () => {
    for (const variant of ["tox", "nox"] as const) {
      const f = await fixture(variant);
      const sibling = path.join(f.container, "other-session", "keep.txt");
      const evidence = path.join(f.container, "run-summary.txt");
      const lock = path.join(f.project, "uv.lock");
      await mkdir(path.dirname(sibling), { recursive: true });
      await writeFile(sibling, "sibling data");
      await writeFile(evidence, "retained test summary");
      await writeFile(lock, "pinned dependencies");
      const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
      const captured = await capturePathTarget(f.target, f.project, "directory");
      expect(await bindings.action(rule(), candidateFor(rule(), captured), f.context)).toEqual({ reclaimedBytes: captured.sizeBytes });
      await expect(readFile(f.installed, "utf8")).rejects.toThrow();
      expect(await readFile(sibling, "utf8")).toBe("sibling data");
      expect(await readFile(evidence, "utf8")).toBe("retained test summary");
      expect(await readFile(lock, "utf8")).toBe("pinned dependencies");
      expect(await readFile(f.config, "utf8")).toContain(variant === "tox" ? "env_list" : "nox.session");
    }
  });

  test("owner changes during review and rule/workdir tampering cannot authorize removal", async () => {
    const f = await fixture("tox");
    const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
    const captured = await capturePathTarget(f.target, f.project, "directory");
    await writeFile(f.config, "[tox]\nenv_list = py312\n[testenv]\ndeps = pytest==8.3.2\ncommands = python -m pytest");
    expect(await selectorObject(bindings.selector).lookup(rule(), captured, f.context)).toBeNull();
    await expect(bindings.action(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("could not be verified");
    const tampered = rule();
    tampered.review.tier = "safe";
    expect(await selectorObject(bindings.selector).list(tampered, f.context)).toHaveLength(0);
    expect(await selectorObject(bindings.selector).list(rule(), { ...f.context, workdirRoot: f.project })).toHaveLength(0);
  });

  test("over-budget project-root inventory is skipped without a partial plan", async () => {
    const f = await fixture("nox");
    const bindings = createPythonTestEnvironmentBindings({ now: () => now, processProbe: async () => true });
    expect(await selectorObject(bindings.selector).list(rule(), { ...f.context, projectRoots: Array(513).fill(f.project) })).toHaveLength(0);
    expect(await readFile(f.installed, "utf8")).toBe("test dependency");
  });
});
