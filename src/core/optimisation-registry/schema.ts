import { z } from "zod";

const identifier = z.string().min(1).max(50).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);
const command = z.strictObject({ argv: z.array(z.string().min(1)).min(1) });
const adapterSelector = z.strictObject({
  kind: z.literal("adapter"),
  adapterId: identifier,
  variants: z.array(identifier).min(1).optional(),
});
const toolCacheSelector = z.strictObject({
  kind: z.literal("tool_cache"),
  pathCommand: command,
});
const targetKind = z.enum(["file", "directory", "either"]);
const generatedPathSelector = z.strictObject({
  kind: z.literal("generated_path"),
  names: z.array(z.string().min(1).max(50).regex(/^[^/\\]+$/)
    .refine((name) => name !== "." && name !== "..", "path traversal is not allowed")
    .refine((name) => ["*", "?", "[", "]"].every((character) => !name.includes(character)), "wildcards are not allowed in literal path names")).min(1),
  markers: z.array(z.string().min(1).max(80).regex(/^[^/\\]+$/)).min(1),
  targetKind: targetKind.optional(),
});
const generatedSuffixSelector = z.strictObject({
  kind: z.literal("generated_suffix"),
  suffixes: z.array(z.string().min(2).max(30).regex(/^\.[a-z0-9._-]+$/)).min(1),
  markers: z.array(z.string().min(1).max(80).regex(/^[^/\\]+$/)).min(1),
  targetKind,
});
const selector = z.discriminatedUnion("kind", [adapterSelector, toolCacheSelector, generatedPathSelector, generatedSuffixSelector]);
const action = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("adapter"), adapterId: identifier }),
  z.strictObject({ kind: z.literal("command"), argv: command.shape.argv }),
  z.strictObject({ kind: z.literal("remove_generated") }),
  z.strictObject({ kind: z.literal("none") }),
]);
const review = z.strictObject({
  tier: z.enum(["safe", "review", "protected"]),
  selection: z.enum(["suggested", "explicit", "none"]),
  forceEligible: z.boolean(),
});
const rule = z.strictObject({
  id: identifier,
  status: z.enum(["proposed", "wip", "beta", "published"]),
  categoryId: identifier,
  label: z.string().min(1).max(60),
  description: z.string().min(1).max(100),
  scope: z.enum(["user", "workdir", "system", "docker_context"]),
  selector,
  probeCommands: z.array(command).min(1).optional(),
  review,
  validators: z.array(identifier),
  action,
  sourceRefs: z.array(identifier).min(1),
});

const forbiddenExecutables = new Set(["sh", "bash", "zsh", "fish", "csh", "tcsh", "osascript", "env", "sudo", "rm", "rmdir", "find", "dd", "diskutil"]);
function unsafeCommand(argv: string[]): boolean {
  const executable = argv[0]?.split("/").at(-1);
  return !executable || forbiddenExecutables.has(executable) || argv.some((arg) =>
    ["-c", "--command", "-e", "--eval", "--execute"].includes(arg) || /(?:\$\(|`|&&|\|\||[;|<>])/.test(arg)
  );
}

export const optimisationRegistrySchema = z.strictObject({
  schemaVersion: z.literal(2),
  integration: z.enum(["catalogue_only", "engine_ready"]),
  messageTemplates: z.strictObject({
    plan: z.string().min(1),
    success: z.string().min(1),
    skipped: z.string().min(1),
    failure: z.string().min(1),
  }),
  categories: z.array(z.strictObject({ id: identifier, label: z.string().min(1).max(60) })).min(1),
  sources: z.record(identifier, z.strictObject({ title: z.string().min(1), url: z.url().startsWith("https://") })),
  rules: z.array(rule).min(1),
}).superRefine((registry, context) => {
  const categoryIds = new Set<string>();
  for (const [index, category] of registry.categories.entries()) {
    if (categoryIds.has(category.id)) context.addIssue({ code: "custom", path: ["categories", index, "id"], message: "duplicate category ID" });
    categoryIds.add(category.id);
  }

  const ruleIds = new Set<string>();
  for (const [index, entry] of registry.rules.entries()) {
    const path = ["rules", index];
    if (ruleIds.has(entry.id)) context.addIssue({ code: "custom", path: [...path, "id"], message: "duplicate rule ID" });
    ruleIds.add(entry.id);
    if (!categoryIds.has(entry.categoryId)) context.addIssue({ code: "custom", path: [...path, "categoryId"], message: "unknown category" });
    for (const sourceRef of entry.sourceRefs) {
      if (!Object.hasOwn(registry.sources, sourceRef)) context.addIssue({ code: "custom", path: [...path, "sourceRefs"], message: `unknown source: ${sourceRef}` });
    }
    if (new Set(entry.validators).size !== entry.validators.length) context.addIssue({ code: "custom", path: [...path, "validators"], message: "duplicate validator" });
    if (entry.review.tier === "protected" && (entry.review.selection !== "none" || entry.review.forceEligible || entry.action.kind !== "none")) {
      context.addIssue({ code: "custom", path: [...path, "review"], message: "protected rules must be inventory-only" });
    }
    if (entry.review.tier !== "protected" && entry.action.kind === "none") {
      context.addIssue({ code: "custom", path: [...path, "action"], message: "action none requires protected inventory tier" });
    }
    if (entry.review.tier === "review" && (entry.review.selection !== "explicit" || entry.review.forceEligible)) {
      context.addIssue({ code: "custom", path: [...path, "review"], message: "review rules require explicit selection and cannot use force" });
    }
    if (entry.review.tier === "safe" && entry.review.selection !== "suggested") {
      context.addIssue({ code: "custom", path: [...path, "review"], message: "safe rules must be suggested" });
    }
    if (entry.action.kind === "remove_generated" && (entry.scope !== "workdir" || !["generated_path", "generated_suffix"].includes(entry.selector.kind))) {
      context.addIssue({ code: "custom", path: [...path, "action"], message: "generated removal requires a workdir generated selector" });
    }
    if (entry.review.tier === "safe" && entry.action.kind === "remove_generated" &&
      !["target_exists", "path_in_scope", "not_symlink", "project_marker", "target_not_active"].every((validator) => entry.validators.includes(validator))) {
      context.addIssue({ code: "custom", path: [...path, "validators"], message: "safe generated removal needs live path, marker, symlink, and activity checks" });
    }
    if (entry.selector.kind === "tool_cache" && unsafeCommand(entry.selector.pathCommand.argv)) {
      context.addIssue({ code: "custom", path: [...path, "selector", "pathCommand"], message: "shell commands are not allowed" });
    }
    for (const [probeIndex, probe] of (entry.probeCommands ?? []).entries()) {
      if (unsafeCommand(probe.argv)) context.addIssue({ code: "custom", path: [...path, "probeCommands", probeIndex], message: "shell commands are not allowed" });
    }
    if (entry.action.kind === "command" && unsafeCommand(entry.action.argv)) {
      context.addIssue({ code: "custom", path: [...path, "action"], message: "shell commands are not allowed" });
    }
  }
});

export type OptimisationRegistry = z.infer<typeof optimisationRegistrySchema>;

export function parseOptimisationRegistry(value: unknown): OptimisationRegistry {
  return optimisationRegistrySchema.parse(value);
}
