import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { commandReference, generateManual, manualLink } from "../../scripts/generate-manual";

describe("manual generation", () => {
  test("renders nested command help without invoking actions", () => {
    const root = new Command("example");
    let invoked = false;
    root.command("clean").requiredOption("--workdir <path>").action(() => { invoked = true; });
    const markdown = commandReference(root);
    expect(markdown).toContain("## example clean");
    expect(markdown).toContain("--workdir <path>");
    expect(invoked).toBe(false);
  });

  test("maps manual pages and preserves repository paths and anchors", () => {
    expect(manualLink("docs/architecture.md", "usage.md#run-an-optimisation")).toBe("/usage#run-an-optimisation");
    expect(manualLink("docs/demo/docker-sandbox.md", "../architecture.md")).toBe("/architecture");
    expect(manualLink("docs/architecture.md", "../src/cli/program.ts")).toBe("https://github.com/vikz91/kundol/blob/main/src/cli/program.ts");
    expect(manualLink("docs/usage.md", "#local")).toBe("#local");
    expect(manualLink("docs/usage.md", "https://example.org/a#b")).toBe("https://example.org/a#b");
  });

  test("generates real references into a disposable directory", async () => {
    const destination = await mkdtemp(path.join(tmpdir(), "kundol-manual-"));
    try {
      await generateManual(destination);
      const cli = await readFile(path.join(destination, "reference/cli.md"), "utf8");
      expect(cli).toContain("## kundol optimise all");
      expect(cli).toContain("--docker-context <name>");
      expect(cli).toContain("## kundol tools request");
      const rules = await readFile(path.join(destination, "reference/rules.md"), "utf8");
      expect(rules).toContain("store.yarn.cache");
      expect(rules).toContain("Protected entries are inventory only");
      const architecture = await readFile(path.join(destination, "architecture.md"), "utf8");
      expect(architecture).toContain("```mermaid");
      expect(architecture).toContain("https://github.com/vikz91/kundol/blob/main/src/cli/program.ts");
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });
});
