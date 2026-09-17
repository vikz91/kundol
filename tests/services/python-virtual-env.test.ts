import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { capturePathTarget } from "../../src/services/optimisation-registry/path-targets";
import {
  createPythonVirtualEnvBindings,
  linuxVirtualEnvProcessProbe,
} from "../../src/services/optimisation-registry/python-virtual-env";
import type { RegistryCandidate, RegistryEngineContext, RegistryRule, RegistrySelectorAdapter } from "../../src/services/optimisation-registry/types";

const catalogue = parseOptimisationRegistry(await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).json());
const roots: string[] = [];
const now = new Date("2026-09-15T07:00:00Z");
const old = new Date("2026-09-01T07:00:00Z");

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function rule(): RegistryRule {
  const found = structuredClone(catalogue.rules.find((entry) => entry.id === "project.python.virtual_envs"));
  if (!found) throw new Error("Python venv proposal missing");
  return found;
}

function selectorObject(selector: RegistrySelectorAdapter) {
  if (typeof selector === "function") throw new Error("targeted venv selector required");
  return selector;
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-python-venv-"));
  roots.push(root);
  const workdir = path.join(root, "workdir");
  const project = path.join(workdir, "project");
  const venv = path.join(project, ".venv");
  const marker = path.join(project, "pyproject.toml");
  const config = path.join(venv, "pyvenv.cfg");
  const python = path.join(venv, "bin", "python");
  await mkdir(path.dirname(python), { recursive: true });
  await writeFile(marker, "[project]\nname = 'demo'");
  await writeFile(config, "home = /usr/bin\ninclude-system-site-packages = false\n");
  await symlink("/usr/bin/python3", python);
  await writeFile(path.join(venv, "installed.txt"), "reproducible package");
  for (const item of [config, path.join(venv, "installed.txt"), path.join(venv, "bin"), venv]) await utimes(item, old, old);
  const context: RegistryEngineContext = {
    homeDir: path.join(root, "home"), workdirRoot: workdir, projectRoots: [project],
  };
  await mkdir(context.homeDir);
  return { root, workdir, project, venv, marker, config, python, context };
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

describe("Python project-local virtual-environment adapter", () => {
  test("lists only a quiet pyvenv.cfg-owned environment under a Python project marker", async () => {
    const f = await fixture();
    const bindings = createPythonVirtualEnvBindings({ now: () => now, processProbe: async () => true });
    const listed = await selectorObject(bindings.selector).list(rule(), f.context);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: "path", absolutePath: f.venv, scopeRoot: f.project, targetKind: "directory" });
    const captured = await capturePathTarget(f.venv, f.project, "directory");
    expect(await selectorObject(bindings.selector).lookup(rule(), captured, f.context)).toMatchObject({ absolutePath: f.venv });
    expect(await bindings.projectMarker(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
    expect(await bindings.ownerVerified(rule(), candidateFor(rule(), captured), f.context)).toBe(true);
  });

  test("rejects missing/malformed owner metadata and a non-Python project", async () => {
    const f = await fixture();
    const bindings = createPythonVirtualEnvBindings({ now: () => now, processProbe: async () => true });
    await writeFile(f.config, "home = relative/base\n");
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await writeFile(f.config, "home = /usr/bin\nhome = /opt/bin\n");
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await writeFile(f.config, "home = /usr/bin\n");
    await utimes(f.config, old, old);
    await rm(f.marker);
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    expect(await readFile(path.join(f.venv, "installed.txt"), "utf8")).toBe("reproducible package");
  });

  test("recent activity, an outside symlink, or missing workdir boundary suppresses candidates", async () => {
    const f = await fixture();
    const bindings = createPythonVirtualEnvBindings({ now: () => now, processProbe: async () => true });
    await writeFile(path.join(f.venv, "recent.txt"), "active");
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    await rm(path.join(f.venv, "recent.txt"));
    const outside = path.join(f.root, "outside");
    await mkdir(outside);
    await rm(f.venv, { recursive: true });
    await symlink(outside, f.venv);
    expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
    expect(await selectorObject(bindings.selector).list(rule(), {
      homeDir: f.context.homeDir, projectRoots: f.context.projectRoots,
    })).toHaveLength(0);
  });

  test("an active or uninspectable process fails closed at list, lookup, and action", async () => {
    const f = await fixture();
    const captured = await capturePathTarget(f.venv, f.project, "directory");
    for (const reason of ["active interpreter", "process visibility unavailable"]) {
      const bindings = createPythonVirtualEnvBindings({ now: () => now, processProbe: async () => reason });
      expect(await selectorObject(bindings.selector).list(rule(), f.context)).toHaveLength(0);
      expect(await selectorObject(bindings.selector).lookup(rule(), captured, f.context)).toBeNull();
      expect(await bindings.processUnused(rule(), candidateFor(rule(), captured), f.context)).toBe(reason);
      await expect(bindings.action(rule(), candidateFor(rule(), captured), f.context)).rejects.toThrow("could not be verified");
    }
    expect(await readFile(path.join(f.venv, "installed.txt"), "utf8")).toBe("reproducible package");
  });

  test("Linux /proc inspector detects a live interpreter through VIRTUAL_ENV without disclosing environment", async () => {
    if (process.platform !== "linux") return;
    const f = await fixture();
    const active = Bun.spawn(["/usr/bin/python3", "-I", "-S", "-c", "import time; time.sleep(5)"], {
      env: { ...process.env, VIRTUAL_ENV: f.venv }, stdin: "ignore", stdout: "ignore", stderr: "ignore",
    });
    try {
      await Bun.sleep(75);
      const result = await linuxVirtualEnvProcessProbe(f.venv);
      expect(result).toContain("process is using the virtual environment");
    } finally {
      active.kill();
      await active.exited;
    }
  });

  test("explicit action removes only the reviewed venv and preserves pinned data outside it", async () => {
    const f = await fixture();
    const pinned = path.join(f.project, "uv.lock");
    await writeFile(pinned, "pinned dependencies");
    const bindings = createPythonVirtualEnvBindings({ now: () => now, processProbe: async () => true });
    const captured = await capturePathTarget(f.venv, f.project, "directory");
    const result = await bindings.action(rule(), candidateFor(rule(), captured), f.context);
    expect(result).toEqual({ reclaimedBytes: captured.sizeBytes });
    await expect(readFile(f.config, "utf8")).rejects.toThrow();
    expect(await readFile(pinned, "utf8")).toBe("pinned dependencies");
    expect(await readFile(f.marker, "utf8")).toContain("demo");
  });
});
