import { describe, expect, test } from "bun:test";
import { optimisationRegistrySchema, parseOptimisationRegistry } from "../../../src/core/optimisation-registry/schema.ts";

const registryUrl = new URL("../../../registry/optimisations.json", import.meta.url);
const registry = parseOptimisationRegistry(await Bun.file(registryUrl).json());

describe("optimisation registry", () => {
  test("covers every developer cleanup category with linked primary sources", () => {
    expect(registry.categories).toHaveLength(13);
    expect(registry.rules).toHaveLength(95);
    expect(new Set(registry.rules.map((rule) => rule.categoryId))).toEqual(new Set(registry.categories.map((category) => category.id)));
    expect(registry.rules.every((rule) => rule.sourceRefs.length > 0)).toBe(true);
    expect(registry.rules.every((rule) => rule.status === "proposed")).toBe(true);
    expect(registry.rules.every((rule) => !rule.id.startsWith("startup."))).toBe(true);
    expect(registry.schemaVersion).toBe(2);
    expect(registry.integration).toBe("catalogue_only");
  });

  test("requires a known lifecycle status for every rule", () => {
    const changed = structuredClone(registry);
    const rule = changed.rules[0]!;
    Reflect.deleteProperty(rule, "status");
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
    rule.status = "published";
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(true);
    (rule as { status: string }).status = "unverified";
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
  });

  test("rejects wildcard names and accepts typed generated suffix targets", () => {
    const changed = structuredClone(registry);
    const parcel = changed.rules.find((rule) => rule.id === "project.parcel.cache")!;
    if (parcel.selector.kind !== "generated_path") throw new Error("parcel selector changed");
    parcel.selector.names = ["*.cache"];
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
    expect(registry.rules.find((rule) => rule.id === "project.python.egg_info")?.selector.kind).toBe("generated_suffix");
  });

  test("rejects duplicate rule IDs and unknown references", () => {
    const changed = structuredClone(registry);
    changed.rules[1]!.id = changed.rules[0]!.id;
    changed.rules[1]!.sourceRefs = ["missing_source"];
    changed.rules[1]!.categoryId = "missing_category";
    const parsed = optimisationRegistrySchema.safeParse(changed);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(["duplicate rule ID", "unknown category", "unknown source: missing_source"]));
  });

  test("keeps protected inventory entries non-actionable", () => {
    const changed = structuredClone(registry);
    const volume = changed.rules.find((rule) => rule.id === "docker.volume.unused")!;
    volume.review.selection = "explicit";
    volume.action = { kind: "adapter", adapterId: "docker.volume.remove" };
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
  });

  test("requires live safety checks for suggested generated removal", () => {
    const changed = structuredClone(registry);
    const project = changed.rules.find((rule) => rule.id === "project.node_modules")!;
    project.validators = ["target_exists"];
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
  });

  test("rejects shell command strings in registry actions", () => {
    const changed = structuredClone(registry);
    const cache = changed.rules.find((rule) => rule.id === "store.npm.cache_verify")!;
    cache.action = { kind: "command", argv: ["zsh", "-c", "rm -rf ~/Library"] };
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
    cache.action = { kind: "command", argv: ["rm", "-rf", "~/Library"] };
    expect(optimisationRegistrySchema.safeParse(changed).success).toBe(false);
  });
});
