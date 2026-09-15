import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import { OptimisationRegistryEngine, type RegistryAuditEvent, type RegistryCommandResult } from "../../src/services/optimisation-registry";

const registryUrl = new URL("../../registry/optimisations.json", import.meta.url);
const catalogue = parseOptimisationRegistry(await Bun.file(registryUrl).json());
const temporaryRoots: string[] = [];

async function pathExists(absolutePath: string): Promise<boolean> {
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

async function tempFixture(): Promise<{ root: string; home: string; project: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "kundol-registry-engine-"));
  temporaryRoots.push(root);
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  await mkdir(home);
  await mkdir(project);
  return { root, home, project };
}

function activeRegistry(...ids: string[]): OptimisationRegistry {
  const registry = structuredClone(catalogue);
  registry.integration = "engine_ready";
  registry.rules = registry.rules.filter((rule) => ids.includes(rule.id));
  if (registry.rules.length !== ids.length) throw new Error("fixture rule not found");
  for (const rule of registry.rules) rule.status = "published";
  return registry;
}

function engineFor(registry: OptimisationRegistry, fixture: { home: string; project: string }, events: RegistryAuditEvent[]) {
  return new OptimisationRegistryEngine({
    registry,
    context: { homeDir: fixture.home, projectRoots: [fixture.project] },
    validators: {
      target_not_active: async () => true,
      owner_verified: async () => true,
    },
    audit: async (event) => { events.push(event); },
  });
}

describe("optimisation registry probe, review, and action engines", () => {
  test("keeps catalogue-only proposals inactive", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    const inactive = structuredClone(catalogue);
    inactive.integration = "catalogue_only";
    for (const rule of inactive.rules) rule.status = "proposed";
    const engine = new OptimisationRegistryEngine({
      registry: inactive,
      context: { homeDir: fixture.home, projectRoots: [fixture.project] },
      runner: async () => { throw new Error("catalogue must not run commands"); },
      audit: async () => { throw new Error("catalogue must not audit actions"); },
    });
    const probe = await engine.probe();
    expect(probe.candidates).toHaveLength(0);
    expect(probe.skippedRules).toHaveLength(inactive.rules.length);
    expect(await pathExists(path.join(fixture.project, "node_modules"))).toBe(true);
  });

  test("force selects safe targets; explicit review can select reports but never protected state", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await writeFile(path.join(fixture.project, "pyproject.toml"), "{}");
    await writeFile(path.join(fixture.project, "example.sln"), "");
    await mkdir(path.join(fixture.project, "node_modules"));
    await writeFile(path.join(fixture.project, "node_modules", "pkg.js"), "generated");
    await mkdir(path.join(fixture.project, "htmlcov"));
    await mkdir(path.join(fixture.project, ".vs"));
    const events: RegistryAuditEvent[] = [];
    const engine = engineFor(activeRegistry("project.node_modules", "project.python.htmlcov", "project.visual_studio.vs_state"), fixture, events);
    const probe = await engine.probe();
    expect(probe.candidates).toHaveLength(3);
    expect(probe.candidates.every((candidate) => candidate.sources.length > 0)).toBe(true);
    expect(probe.candidates.find((candidate) => candidate.ruleId === "project.node_modules")?.action.kind).toBe("remove_generated");
    const forced = engine.review(probe, { force: true });
    expect(forced.selected.map((candidate) => candidate.ruleId)).toEqual(["project.node_modules"]);
    const forcedResult = await engine.apply(forced);
    expect(forcedResult.applied).toHaveLength(1);
    expect(forcedResult.failed).toHaveLength(0);
    expect(await pathExists(path.join(fixture.project, "node_modules"))).toBe(false);
    expect(await pathExists(path.join(fixture.project, "htmlcov"))).toBe(true);
    expect(await pathExists(path.join(fixture.project, ".vs"))).toBe(true);

    const secondProbe = await engine.probe();
    const report = secondProbe.candidates.find((candidate) => candidate.ruleId === "project.python.htmlcov")!;
    const protectedState = secondProbe.candidates.find((candidate) => candidate.ruleId === "project.visual_studio.vs_state")!;
    const reviewed = engine.review(secondProbe, { force: false, confirmed: true, selectedIds: [report.id, protectedState.id] });
    expect(reviewed.selected.map((candidate) => candidate.id)).toEqual([report.id]);
    expect(reviewed.blocked.map((entry) => entry.candidateId)).toContain(protectedState.id);
    const reviewedResult = await engine.apply(reviewed);
    expect(reviewedResult.applied).toHaveLength(1);
    expect(await pathExists(path.join(fixture.project, "htmlcov"))).toBe(false);
    expect(await pathExists(path.join(fixture.project, ".vs"))).toBe(true);
    expect(events.filter((event) => event.phase === "attempt")).toHaveLength(2);
    expect(events.filter((event) => event.phase === "applied")).toHaveLength(2);
  });

  test("rechecks identity and symlink safety after review", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    const outside = path.join(fixture.root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep.txt"), "must remain");
    const events: RegistryAuditEvent[] = [];
    const engine = engineFor(activeRegistry("project.node_modules"), fixture, events);
    const probe = await engine.probe();
    const review = engine.review(probe, { force: true });
    await rm(path.join(fixture.project, "node_modules"), { recursive: true });
    await symlink(outside, path.join(fixture.project, "node_modules"));
    const result = await engine.apply(review);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("must remain");
    expect(events.some((event) => event.phase === "attempt")).toBe(false);
  });

  test("does not trust a recreated target or a modified review plan", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    const target = path.join(fixture.project, "node_modules");
    await mkdir(target);
    await writeFile(path.join(target, "old.js"), "old");
    const engine = engineFor(activeRegistry("project.node_modules"), fixture, []);
    const probe = await engine.probe();
    expect(Object.isFrozen(probe)).toBe(true);
    expect(Object.isFrozen(probe.candidates[0]?.target)).toBe(true);
    const review = engine.review(probe, { force: true });
    expect(() => engine.review({ ...probe, candidates: [] }, { force: true })).toThrow();
    await rm(target, { recursive: true });
    await mkdir(target);
    await writeFile(path.join(target, "new.js"), "new data");
    const result = await engine.apply(review);
    expect(result.skipped).toHaveLength(1);
    expect(result.applied).toHaveLength(0);
    expect(await readFile(path.join(target, "new.js"), "utf8")).toBe("new data");
    expect(engine.apply(review)).rejects.toThrow("review plan was not issued");
  });

  test("missing project ownership marker blocks selected removal", async () => {
    const fixture = await tempFixture();
    const marker = path.join(fixture.project, "package.json");
    await writeFile(marker, "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    const engine = engineFor(activeRegistry("project.node_modules"), fixture, []);
    const probe = await engine.probe();
    const review = engine.review(probe, { force: true });
    await rm(marker);
    const result = await engine.apply(review);
    expect(result.skipped).toHaveLength(1);
    expect(await pathExists(path.join(fixture.project, "node_modules"))).toBe(true);
  });

  test("uses exact code-approved owner commands and rejects altered action flags", async () => {
    const fixture = await tempFixture();
    const store = path.join(fixture.home, "pnpm-store");
    await mkdir(store);
    const registry = activeRegistry("store.pnpm.prune");
    const calls: string[] = [];
    const runner = async (argv: readonly string[]): Promise<RegistryCommandResult> => {
      calls.push(argv.join(" "));
      if (argv.join(" ") === "pnpm store path") return { exitCode: 0, stdout: store, stderr: "" };
      return { exitCode: 0, stdout: "ok", stderr: "" };
    };
    const engine = new OptimisationRegistryEngine({
      registry,
      context: { homeDir: fixture.home, projectRoots: [] },
      runner,
      validators: { tool_available: async () => true, tool_idle: async () => true },
      audit: async () => {},
    });
    const probe = await engine.probe();
    expect(probe.candidates).toHaveLength(1);
    const review = engine.review(probe, { force: true });
    expect((await engine.apply(review)).applied).toHaveLength(1);
    expect(calls).toContain("pnpm store prune");

    const altered = activeRegistry("store.pnpm.prune");
    const rule = altered.rules[0]!;
    rule.action = { kind: "command", argv: ["pnpm", "store", "prune", "--dangerous"] };
    const rejected = new OptimisationRegistryEngine({
      registry: altered,
      context: { homeDir: fixture.home, projectRoots: [] },
      runner: async () => { throw new Error("altered command must not run"); },
      audit: async () => {},
    });
    expect((await rejected.probe()).skippedRules[0]?.reason).toContain("not code-approved");

    const wrongOwner = activeRegistry("store.pnpm.prune");
    const wrongRule = wrongOwner.rules[0]!;
    if (wrongRule.selector.kind !== "tool_cache") throw new Error("expected owner cache selector");
    wrongRule.selector.pathCommand.argv = ["uv", "cache", "dir"];
    const mismatched = new OptimisationRegistryEngine({
      registry: wrongOwner,
      context: { homeDir: fixture.home, projectRoots: [] },
      runner: async () => { throw new Error("mismatched owner command must not run"); },
      audit: async () => {},
    });
    expect((await mismatched.probe()).skippedRules[0]?.reason).toContain("does not match its code-approved owner selector");

    const downgraded = activeRegistry("store.pip.cache");
    downgraded.rules[0]!.review = { tier: "safe", selection: "suggested", forceEligible: true };
    const unsafeTier = new OptimisationRegistryEngine({
      registry: downgraded,
      context: { homeDir: fixture.home, projectRoots: [] },
      runner: async () => { throw new Error("downgraded purge must not run"); },
      audit: async () => {},
    });
    expect((await unsafeTier.probe()).skippedRules[0]?.reason).toContain("does not match its code-approved owner selector");
  });

  test("records an audit warning if outcome logging fails after a real action", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    const target = path.join(fixture.project, "node_modules");
    await mkdir(target);
    const engine = new OptimisationRegistryEngine({
      registry: activeRegistry("project.node_modules"),
      context: { homeDir: fixture.home, projectRoots: [fixture.project] },
      validators: { target_not_active: async () => true },
      audit: async (event) => { if (event.phase === "applied") throw new Error("audit disk full"); },
    });
    const result = await engine.apply(engine.review(await engine.probe(), { force: true }));
    expect(result.applied).toHaveLength(1);
    expect(result.auditWarnings[0]).toContain("audit disk full");
    expect(await pathExists(target)).toBe(false);
  });

  test("fails closed on missing adapters and validators, and gates beta rules", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    const registry = activeRegistry("project.node_modules", "docker.image.unused");
    registry.rules.find((rule) => rule.id === "project.node_modules")!.validators.push("unimplemented_check");
    const engine = engineFor(registry, fixture, []);
    const result = await engine.probe();
    expect(result.candidates).toHaveLength(0);
    expect(result.skippedRules.map((entry) => entry.reason)).toEqual(expect.arrayContaining([
      "validator unavailable: unimplemented_check",
      "selector adapter unavailable: docker.images.unused",
    ]));

    const beta = activeRegistry("project.node_modules");
    beta.rules[0]!.status = "beta";
    const betaEngine = engineFor(beta, fixture, []);
    expect((await betaEngine.probe()).candidates).toHaveLength(0);
    expect((await betaEngine.probe({ includeBeta: true })).candidates).toHaveLength(1);
  });

  test("dispatches owner resources by stable identity and skips a changed resource", async () => {
    const fixture = await tempFixture();
    let fingerprint = "image-v1";
    let removals = 0;
    const events: RegistryAuditEvent[] = [];
    const engine = new OptimisationRegistryEngine({
      registry: activeRegistry("docker.image.unused"),
      context: { homeDir: fixture.home, projectRoots: [] },
      selectorAdapters: {
        "docker.images.unused": async () => [{
          ownerId: "docker:desktop", resourceId: "sha256:image:one", fingerprint, sizeBytes: 7,
          evidence: ["owner reports image unused"],
        }],
      },
      actionAdapters: {
        "docker.image.remove_selected": async (_rule, candidate) => {
          expect(candidate.target.kind).toBe("resource");
          if (candidate.target.kind === "resource") expect(candidate.target.ownerId).toBe("docker:desktop");
          removals++;
          return { reclaimedBytes: 7 };
        },
      },
      validators: {
        tool_available: async () => true,
        resource_still_unused: async () => true,
        target_exists: async () => true,
      },
      audit: async (event) => { events.push(event); },
    });
    const firstProbe = await engine.probe();
    expect(firstProbe.candidates).toHaveLength(1);
    expect(engine.review(firstProbe, { force: true }).selected).toHaveLength(0);
    const firstReview = engine.review(firstProbe, { force: false, confirmed: true, selectedIds: [firstProbe.candidates[0]!.id] });
    fingerprint = "image-v2";
    const stale = await engine.apply(firstReview);
    expect(stale.skipped).toHaveLength(1);
    expect(removals).toBe(0);
    expect(events.some((event) => event.phase === "attempt")).toBe(false);

    const secondProbe = await engine.probe();
    const secondReview = engine.review(secondProbe, { force: false, confirmed: true, selectedIds: [secondProbe.candidates[0]!.id] });
    const applied = await engine.apply(secondReview);
    expect(applied.applied).toHaveLength(1);
    expect(applied.knownReclaimedBytes).toBe(7);
    expect(removals).toBe(1);
  });

  test("rejects unapproved generated names and does not allow overriding path validators", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    const registry = activeRegistry("project.node_modules");
    const unsafe = structuredClone(registry);
    const unsafeRule = unsafe.rules[0]!;
    if (unsafeRule.selector.kind !== "generated_path") throw new Error("expected path selector");
    unsafeRule.selector.names = ["src"];
    const rejected = engineFor(unsafe, fixture, []);
    expect((await rejected.probe()).skippedRules[0]?.reason).toBe("generated selector is not code-approved");

    const releaseOutput = activeRegistry("project.dotnet.bin_obj");
    const releaseRule = releaseOutput.rules[0]!;
    if (releaseRule.selector.kind !== "generated_path") throw new Error("expected path selector");
    releaseRule.selector.targetKind = "directory";
    const releaseEngine = engineFor(releaseOutput, fixture, []);
    expect((await releaseEngine.probe()).skippedRules[0]?.reason).toBe("generated selector is not code-approved");

    const outside = path.join(fixture.root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "keep.txt"), "outside");
    await rm(path.join(fixture.project, "node_modules"), { recursive: true });
    await symlink(outside, path.join(fixture.project, "node_modules"));
    const override = new OptimisationRegistryEngine({
      registry,
      context: { homeDir: fixture.home, projectRoots: [fixture.project] },
      validators: {
        target_not_active: async () => true,
        not_symlink: async () => true,
        path_in_scope: async () => true,
      },
      audit: async () => {},
    });
    expect((await override.probe()).candidates).toHaveLength(0);
    expect(await readFile(path.join(outside, "keep.txt"), "utf8")).toBe("outside");
  });

  test("deduplicates overlapping physical targets and keeps the stricter tier", async () => {
    const fixture = await tempFixture();
    await writeFile(path.join(fixture.project, "package.json"), "{}");
    await mkdir(path.join(fixture.project, "node_modules"));
    await writeFile(path.join(fixture.project, "node_modules", "pkg.js"), "12345");
    const registry = activeRegistry("project.node_modules");
    const inventory = structuredClone(registry.rules[0]!);
    inventory.id = "project.node_modules.inventory";
    inventory.review = { tier: "protected", selection: "none", forceEligible: false };
    inventory.validators = [];
    inventory.action = { kind: "none" };
    registry.rules.push(inventory);
    const engine = engineFor(registry, fixture, []);
    const probe = await engine.probe();
    expect(probe.candidates).toHaveLength(1);
    expect(probe.candidates[0]?.tier).toBe("protected");
    expect(probe.knownBytes).toBe(5);
    expect(engine.review(probe, { force: true }).selected).toHaveLength(0);
  });
});
