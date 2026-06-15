import { describe, expect, test } from "bun:test";
import { classifyCleanupPath } from "../../../src/core/safety/policy";

describe("cleanup safety policy", () => {
  test("classifies generated dependency and build artifacts as safe", () => {
    expect(classifyCleanupPath({ relativePath: "node_modules", isDirectory: true, runtimes: ["node"] }).classification).toBe("safe");
    expect(classifyCleanupPath({ relativePath: ".next", isDirectory: true, runtimes: ["node"] }).classification).toBe("safe");
    expect(classifyCleanupPath({ relativePath: "target", isDirectory: true, runtimes: ["rust"] }).classification).toBe("safe");
    expect(classifyCleanupPath({ relativePath: "coverage.out", isDirectory: false, runtimes: ["go"] }).classification).toBe("safe");
  });

  test("never classifies protected project material as safe", () => {
    const protectedPaths = [
      ".git",
      ".env",
      ".env.local",
      "src/index.ts",
      "migrations/001_init.sql",
      "assets/logo.png",
      "uploads/avatar.jpg",
      "package-lock.json",
      "go.mod",
      "local.sqlite",
    ];

    for (const relativePath of protectedPaths) {
      const result = classifyCleanupPath({ relativePath, isDirectory: !relativePath.includes("."), runtimes: ["node", "go"] });
      expect(result.classification, relativePath).not.toBe("safe");
      expect(result.canAutoClean, relativePath).toBe(false);
    }
  });

  test("classifies review-only artifacts as caution", () => {
    expect(classifyCleanupPath({ relativePath: "vendor", isDirectory: true, runtimes: ["go"] }).classification).toBe("caution");
    expect(classifyCleanupPath({ relativePath: "reports", isDirectory: true, runtimes: ["python"] }).classification).toBe("caution");
    expect(classifyCleanupPath({ relativePath: "release", isDirectory: true, runtimes: ["go"] }).classification).toBe("caution");
  });
});
