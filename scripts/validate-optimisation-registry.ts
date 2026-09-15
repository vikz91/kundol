import { optimisationRegistrySchema } from "../src/core/optimisation-registry/schema.ts";

const registryPath = new URL("../registry/optimisations.json", import.meta.url);
let value: unknown;
try {
  value = await Bun.file(registryPath).json();
} catch (error) {
  console.error(`Cannot read optimisation registry: ${String(error)}`);
  process.exit(1);
}

const parsed = optimisationRegistrySchema.safeParse(value);
if (!parsed.success) {
  for (const issue of parsed.error.issues) console.error(`${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

console.log(`Registry valid: ${parsed.data.rules.length} rules, ${parsed.data.categories.length} categories, ${Object.keys(parsed.data.sources).length} sources.`);
