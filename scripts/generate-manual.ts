import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { createProgram } from "../src/cli/program";
import registryJson from "../registry/optimisations.json";
import { parseOptimisationRegistry } from "../src/core/optimisation-registry/schema";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = "https://github.com/vikz91/kundol/blob/main/";
const pages: Readonly<Record<string, string>> = {
  "docs/architecture.md": "architecture.md",
  "docs/usage.md": "usage.md",
  "docs/optimisation-registry.md": "registry.md",
  "docs/CONTRIBUTING.md": "contributing.md",
  "docs/demo/docker-sandbox.md": "sandbox.md",
};

/** Translate repository-relative links while retaining shared docs as the source. */
export function manualLink(source: string, href: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return href;
  const [pathname = "", fragment] = href.split("#", 2);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(source), pathname));
  const suffix = fragment === undefined ? "" : `#${fragment}`;
  if (pages[target]) return `/${pages[target].replace(/\.md$/, "")}${suffix}`;
  return `${repository}${target}${suffix}`;
}

export function commandReference(command: Command, parents: readonly string[] = []): string {
  const names = [...parents, command.name()];
  const heading = names.join(" ");
  return [
    `## ${heading}\n\n\`\`\`text\n${command.helpInformation().trimEnd()}\n\`\`\`\n`,
    ...command.commands.map((child) => commandReference(child, names)),
  ].join("\n");
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/</g, "&lt;");

export async function generateManual(destination = path.join(root, "website")): Promise<void> {
  await mkdir(path.join(destination, "reference"), { recursive: true });
  await mkdir(path.join(destination, "public"), { recursive: true });
  for (const [source, output] of Object.entries(pages)) {
    const text = await readFile(path.join(root, source), "utf8");
    const translated = text.replace(/(\[[^\]]*\])\(([^\s)]+)\)/g,
      (_match, label: string, href: string) => `${label}(${manualLink(source, href)})`);
    await writeFile(path.join(destination, output), `<!-- Generated from ${source}; edit the source document. -->\n\n${translated}`);
  }
  // Constructing Commander and reading help never invokes a command action.
  await writeFile(path.join(destination, "reference/cli.md"),
    "# Command reference\n\nGenerated from the current Commander command definitions. Your installed version may differ; run `kundol --help` to check it.\n\n" + commandReference(createProgram()));
  const registry = parseOptimisationRegistry(registryJson);
  const sections = registry.categories.map((category) => {
    const rules = registry.rules.filter((rule) => rule.categoryId === category.id);
    return `## ${category.label}\n\n| Rule | Status | Scope | Review tier | Description |\n|---|---|---|---|---|\n` +
      rules.map((rule) => `| \`${rule.id}\` | ${rule.status} | ${rule.scope} | ${rule.review.tier} | ${cell(rule.description)} |`).join("\n");
  });
  await writeFile(path.join(destination, "reference/rules.md"),
    "# Rule catalogue\n\nGenerated from the bundled JSON registry. Status describes catalogue maturity, not a guarantee that a rule can execute on your machine.\n\n" +
    "Published rules still need supported handlers and live checks. `--allow-beta` admits only exact code-approved beta bindings. Protected entries are inventory only. See [safety](/safety) and the [registry guide](/registry).\n\n" + sections.join("\n\n") + "\n");
  await copyFile(path.join(root, "assets/logo.png"), path.join(destination, "public/logo.png"));
}

if (import.meta.main) await generateManual();
