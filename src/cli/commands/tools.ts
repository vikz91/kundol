import { Command, Option } from "commander";
import type { OptimisationRegistry } from "../../core/optimisation-registry/schema";
import type { Output } from "../../shared/output";

export type UrlOpener = (url: string) => Promise<boolean>;

export interface ToolsCommandContext {
  output: Output;
  registry: OptimisationRegistry;
  openUrl: UrlOpener;
}

const repositoryUrl = "https://github.com/vikz91/kundol";
const issueChooserUrl = repositoryUrl + "/issues/new/choose";
const statuses = ["all", "proposed", "wip", "beta", "published"] as const;
type StatusFilter = (typeof statuses)[number];
type Rule = OptimisationRegistry["rules"][number];

export async function openExternalUrl(url: string): Promise<boolean> {
  const command = process.platform === "darwin" ? "open" : process.platform === "linux" ? "xdg-open" : undefined;
  if (!command) return false;
  try {
    const child = Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}

export function createToolsCommand(context: ToolsCommandContext): Command {
  const tools = new Command("tools")
    .description("Browse the optimisation catalogue and request new targets.");

  tools.command("available")
    .description("List published optimisation tools.")
    .action(() => {
      const rules = context.registry.rules.filter((rule) => rule.status === "published");
      writeRules(context, rules, "Published optimisations", false);
      if (rules.length === 0) {
        context.output.writeLine("No published registry tools yet. View proposals with kundol tools list --status proposed.");
      }
    });

  tools.command("search")
    .description("Search published optimisation tools.")
    .argument("<query>", "words to find in IDs, labels, descriptions, or categories")
    .action((query: string) => {
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        context.output.writeError("Enter a search term.");
        process.exitCode = 1;
        return;
      }
      const categories = new Map(context.registry.categories.map((category) => [category.id, category.label]));
      const rules = context.registry.rules.filter((rule) => {
        if (rule.status !== "published") return false;
        const text = [rule.id, rule.label, rule.description, categories.get(rule.categoryId) ?? ""].join(" ").toLowerCase();
        return words.every((word) => text.includes(word));
      });
      writeRules(context, rules, "Published matches for " + query.trim(), true);
      if (rules.length === 0) context.output.writeLine("No published tools match that search.");
    });

  tools.command("list")
    .description("List catalogue rules at any delivery status.")
    .addOption(new Option("-s, --status <status>", "all, proposed, wip, beta, or published")
      .choices([...statuses]).default("all"))
    .action((options: { status: StatusFilter }) => {
      const rules = options.status === "all"
        ? context.registry.rules
        : context.registry.rules.filter((rule) => rule.status === options.status);
      writeRules(context, rules, "Optimisation catalogue: " + options.status, false);
    });

  tools.command("request")
    .description("Open a prefilled GitHub Markdown issue for a missing tool.")
    .action(async () => {
      await openGitHubPage(context.output, context.openUrl, toolRequestUrl(), "Tool request");
    });

  return tools;
}

export function createIssueCommand(output: Output, openUrl: UrlOpener): Command {
  return new Command("issue")
    .description("Open GitHub's issue chooser to file a bug or feature request.")
    .action(async () => {
      await openGitHubPage(output, openUrl, issueChooserUrl, "File an issue");
    });
}

async function openGitHubPage(output: Output, openUrl: UrlOpener, url: string, label: string): Promise<void> {
  output.writeLine(label + ": " + url);
  if (!(await openUrl(url))) output.writeLine("Open this link in your browser to continue.");
}

function writeRules(context: ToolsCommandContext, rules: Rule[], title: string, showDescription: boolean): void {
  context.output.writeLine(title + " (" + rules.length + ")");
  const categories = new Map(context.registry.categories.map((category) => [category.id, category.label]));
  for (const rule of rules) {
    const category = categories.get(rule.categoryId) ?? rule.categoryId;
    context.output.writeLine("  " + rule.id + " [" + rule.status + "] " + rule.label + " (" + category + ")");
    if (showDescription) context.output.writeLine("    " + rule.description);
  }
}

function toolRequestUrl(): string {
  const url = new URL(repositoryUrl + "/issues/new");
  url.searchParams.set("title", "[Registry request]: ");
  url.searchParams.set("body", [
    "Owning tool:",
    "",
    "Exact target and scope:",
    "",
    "Owner documentation:",
    "",
    "Why add it:",
    "",
    "Data and safety risks:",
    "",
  ].join("\n"));
  return url.toString();
}
