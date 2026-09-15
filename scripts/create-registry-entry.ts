import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOptimisationRegistry, type OptimisationRegistry } from "../src/core/optimisation-registry/schema.ts";

type Scope = OptimisationRegistry["rules"][number]["scope"];

export interface RegistryEntryRequest {
  id: string;
  categoryId: string;
  label: string;
  description: string;
  scope: Scope;
  source: { kind: "existing"; ref: string } | { kind: "new"; id: string; title: string; url: string };
}

export function scaffoldRegistryEntry(currentText: string, request: RegistryEntryRequest): string {
  const current = parseOptimisationRegistry(JSON.parse(currentText));
  if (current.rules.some((rule) => rule.id === request.id)) throw new Error(`Rule ${request.id} already exists`);
  if (!current.categories.some((category) => category.id === request.categoryId)) {
    throw new Error(`Unknown category ${request.categoryId}; choose an ID from registry/optimisations.json`);
  }

  const sourceRef = request.source.kind === "existing" ? request.source.ref : request.source.id;
  if (request.source.kind === "existing" && !Object.hasOwn(current.sources, sourceRef)) {
    throw new Error(`Unknown source ${sourceRef}; add an owner-maintained source or use --source-id/--source-title/--source-url`);
  }
  if (request.source.kind === "new" && Object.hasOwn(current.sources, sourceRef)) {
    throw new Error(`Source ${sourceRef} already exists; use --source-ref to reuse it`);
  }

  const rule: OptimisationRegistry["rules"][number] = {
    id: request.id,
    status: "proposed",
    categoryId: request.categoryId,
    label: request.label,
    description: request.description,
    scope: request.scope,
    selector: { kind: "adapter", adapterId: request.id },
    review: { tier: "protected", selection: "none", forceEligible: false },
    validators: [],
    action: { kind: "none" },
    sourceRefs: [sourceRef],
  };
  const sources = request.source.kind === "new"
    ? { ...current.sources, [sourceRef]: { title: request.source.title, url: request.source.url } }
    : current.sources;
  parseOptimisationRegistry({ ...current, sources, rules: [...current.rules, rule] });

  let next = currentText;
  if (request.source.kind === "new") {
    const anchor = '\n  },\n  "rules": [';
    const close = next.indexOf(anchor, next.indexOf('  "sources": {'));
    if (close < 0 || !next.slice(0, close).trimEnd().endsWith("}")) {
      throw new Error("Registry source layout changed; add the entry manually");
    }
    next = `${next.slice(0, close)},\n    ${JSON.stringify(sourceRef)}: ${JSON.stringify({ title: request.source.title, url: request.source.url })}${next.slice(close)}`;
  }
  const close = next.lastIndexOf("\n  ]\n}");
  if (close < 0 || !next.slice(0, close).trimEnd().endsWith("}")) {
    throw new Error("Registry rule layout changed; add the entry manually");
  }
  next = `${next.slice(0, close)},\n    ${JSON.stringify(rule)}${next.slice(close)}`;
  parseOptimisationRegistry(JSON.parse(next));
  return next;
}

function optionsFrom(args: string[]): { request: RegistryEntryRequest; path: string; dryRun: boolean } | null {
  const input = args[0] === "--" ? args.slice(1) : args;
  if (input.includes("--help") || input.includes("-h")) {
    console.log("Usage: bun run registry:new -- --id ID --category ID --label TEXT --description TEXT --scope user|workdir|system|docker_context (--source-ref ID | --source-id ID --source-title TEXT --source-url HTTPS_URL) [--dry-run] [--registry PATH]");
    return null;
  }
  const allowed = new Set(["--id", "--category", "--label", "--description", "--scope", "--source-ref", "--source-id", "--source-title", "--source-url", "--registry"]);
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < input.length; index++) {
    const key = input[index]!;
    if (key === "--dry-run") {
      if (dryRun) throw new Error("--dry-run was repeated");
      dryRun = true;
      continue;
    }
    if (!allowed.has(key)) throw new Error(`Unknown option ${key}; run bun run registry:new -- --help`);
    const value = input[++index];
    if (!value || value.startsWith("--")) throw new Error(`${key} needs a value`);
    if (values.has(key)) throw new Error(`${key} was repeated`);
    values.set(key, value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const scope = required("--scope");
  if (!["user", "workdir", "system", "docker_context"].includes(scope)) throw new Error("--scope must be user, workdir, system, or docker_context");
  const existing = values.get("--source-ref");
  if (existing && ["--source-id", "--source-title", "--source-url"].some((key) => values.has(key))) {
    throw new Error("Choose --source-ref or the three new-source options, not both");
  }
  const source: RegistryEntryRequest["source"] = existing
    ? { kind: "existing", ref: existing }
    : { kind: "new", id: required("--source-id"), title: required("--source-title"), url: required("--source-url") };
  return {
    request: {
      id: required("--id"),
      categoryId: required("--category"),
      label: required("--label"),
      description: required("--description"),
      scope: scope as Scope,
      source,
    },
    path: resolve(values.get("--registry") ?? fileURLToPath(new URL("../registry/optimisations.json", import.meta.url))),
    dryRun,
  };
}

async function main(): Promise<void> {
  const options = optionsFrom(process.argv.slice(2));
  if (!options) return;
  const current = await readFile(options.path, "utf8");
  const next = scaffoldRegistryEntry(current, options.request);
  if (options.dryRun) {
    console.log(`Would add protected, inactive proposal ${options.request.id} to ${options.path}.`);
    return;
  }
  await writeFile(options.path, next);
  console.log(`Added protected, inactive proposal ${options.request.id} to ${options.path}. Review its selector, target ownership, validators, and policy before the PR. Run bun run registry:check.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`Registry scaffold failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
