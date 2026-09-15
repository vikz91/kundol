import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldRegistryEntry, type RegistryEntryRequest } from "../../scripts/create-registry-entry.ts";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema.ts";

const registryText = await Bun.file(new URL("../../registry/optimisations.json", import.meta.url)).text();
const request: RegistryEntryRequest = {
  id: "store.example.cache",
  categoryId: "shared_stores",
  label: "Example cache",
  description: "Inventory an example tool cache for maintainer review.",
  scope: "user",
  source: { kind: "new", id: "example_cache", title: "Example cache owner guide", url: "https://example.com/cache" },
};

describe("registry contribution scaffold", () => {
  test("adds a source and one protected catalogue-only proposal without reformatting existing rules", () => {
    const changed = scaffoldRegistryEntry(registryText, request);
    const parsed = parseOptimisationRegistry(JSON.parse(changed));
    expect(parsed.rules).toHaveLength(96);
    expect(parsed.sources.example_cache).toEqual({ title: "Example cache owner guide", url: "https://example.com/cache" });
    expect(parsed.rules.at(-1)).toMatchObject({
      id: request.id,
      status: "proposed",
      selector: { kind: "adapter", adapterId: request.id },
      review: { tier: "protected", selection: "none", forceEligible: false },
      validators: [],
      action: { kind: "none" },
      sourceRefs: ["example_cache"],
    });
    expect(changed).toContain(registryText.split('\n  "rules": [')[0]!.split('\n  "sources": {')[0]!);
    expect(changed).toContain('"id": "project.node_modules"');
  });

  test("can reuse an existing source and rejects duplicate IDs or unknown references", () => {
    const changed = scaffoldRegistryEntry(registryText, { ...request, source: { kind: "existing", ref: "npm_cache" } });
    expect(parseOptimisationRegistry(JSON.parse(changed)).rules.at(-1)?.sourceRefs).toEqual(["npm_cache"]);
    expect(() => scaffoldRegistryEntry(changed, { ...request, source: { kind: "existing", ref: "npm_cache" } })).toThrow("already exists");
    expect(() => scaffoldRegistryEntry(registryText, { ...request, categoryId: "missing" })).toThrow("Unknown category");
    expect(() => scaffoldRegistryEntry(registryText, { ...request, source: { kind: "existing", ref: "missing" } })).toThrow("Unknown source");
    expect(() => scaffoldRegistryEntry(registryText, { ...request, id: "bad/id" })).toThrow();
  });
});

const tempPaths: string[] = [];
afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("dry-run leaves a temp registry untouched; write adds only the requested safe proposal", async () => {
  const folder = await mkdtemp(join(tmpdir(), "kundol-registry-new-"));
  tempPaths.push(folder);
  const path = join(folder, "optimisations.json");
  await writeFile(path, registryText);
  const common = [
    "bun", "run", "scripts/create-registry-entry.ts", "--registry", path,
    "--id", request.id, "--category", request.categoryId,
    "--label", request.label, "--description", request.description,
    "--scope", request.scope,
    "--source-id", "example_cache", "--source-title", "Example cache owner guide",
    "--source-url", "https://example.com/cache",
  ];
  const dry = Bun.spawnSync([...common, "--dry-run"], { stdout: "pipe", stderr: "pipe" });
  expect(dry.exitCode).toBe(0);
  expect(await readFile(path, "utf8")).toBe(registryText);
  const write = Bun.spawnSync(common, { stdout: "pipe", stderr: "pipe" });
  expect(write.exitCode).toBe(0);
  expect(parseOptimisationRegistry(JSON.parse(await readFile(path, "utf8"))).rules.at(-1)?.id).toBe(request.id);
});
