#!/usr/bin/env bun

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createProgram } from "../src/cli/program";

const sandboxRoot = "/sandbox";
try {
  await stat(join(sandboxRoot, ".kundol-demo-sandbox"));
} catch {
  throw new Error("The kundol Docker demo fixture is missing; rebuild the image.");
}

await createProgram({
  homeDir: join(sandboxRoot, "home"),
}).parseAsync(["bun", "kundol", ...process.argv.slice(2)]);
