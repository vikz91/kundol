import { describe, expect, test } from "bun:test";
import optimisationsJson from "../../registry/optimisations.json";
import { createProgram } from "../../src/cli/program";
import { parseOptimisationRegistry } from "../../src/core/optimisation-registry/schema";
import type { Output } from "../../src/shared/output";

function fixtureRegistry() {
  const registry = structuredClone(parseOptimisationRegistry(optimisationsJson));
  registry.integration = "catalogue_only";
  for (const rule of registry.rules) rule.status = "proposed";
  registry.rules.find((rule) => rule.id === "project.node_modules")!.status = "published";
  registry.rules.find((rule) => rule.id === "apple.xcode.derived_data")!.status = "wip";
  registry.rules.find((rule) => rule.id === "android.avd")!.status = "beta";
  return registry;
}

async function runTools(args: string[], opened = true) {
  const lines: string[] = [];
  const errors: string[] = [];
  const urls: string[] = [];
  const output: Output = {
    writeLine(message = "") { lines.push(message); },
    writeError(message = "") { errors.push(message); },
  };
  await createProgram({
    output,
    registry: fixtureRegistry(),
    openUrl: async (url) => { urls.push(url); return opened; },
  }).parseAsync(args, { from: "user" });
  return { lines: lines.join("\n"), errors, urls };
}

describe("optimisation catalogue CLI", () => {
  test("available and search expose published rules only", async () => {
    const available = await runTools(["tools", "available"]);
    expect(available.lines).toContain("Published optimisations (1)");
    expect(available.lines).toContain("project.node_modules");
    expect(available.lines).not.toContain("apple.xcode.derived_data");

    const search = await runTools(["tools", "search", "project node"]);
    expect(search.lines).toContain("Published matches for project node (1)");
    expect(search.lines).toContain("Project node_modules");

    const hidden = await runTools(["tools", "search", "Xcode"]);
    expect(hidden.lines).toContain("Published matches for Xcode (0)");
    expect(hidden.lines).toContain("No published tools match");
  });

  test("list filters all four delivery states", async () => {
    const all = await runTools(["tools", "list"]);
    expect(all.lines).toContain("Optimisation catalogue: all (" + fixtureRegistry().rules.length + ")");
    for (const status of ["proposed", "wip", "beta", "published"]) {
      const result = await runTools(["tools", "list", "--status", status]);
      expect(result.lines).toContain("Optimisation catalogue: " + status);
      expect(result.lines).toContain("[" + status + "]");
      if (status !== "proposed") expect(result.lines).toContain("(1)");
    }
  });

  test("request opens a prefilled Markdown issue and issue opens the chooser", async () => {
    const request = await runTools(["tools", "request"]);
    expect(request.urls).toHaveLength(1);
    const requestUrl = new URL(request.urls[0]!);
    expect(requestUrl.pathname).toBe("/vikz91/kundol/issues/new");
    expect(requestUrl.searchParams.get("title")).toBe("[Registry request]: ");
    expect(requestUrl.searchParams.get("body")).toContain("Data and safety risks:");
    const issue = await runTools(["issue"], false);
    expect(issue.urls).toEqual(["https://github.com/vikz91/kundol/issues/new/choose"]);
    expect(issue.lines).toContain("Open this link in your browser");
  });
});
