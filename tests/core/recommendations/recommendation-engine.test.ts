import { describe, expect, test } from "bun:test";
import { generateRecommendations } from "../../../src/core/recommendations/recommendation-engine";

describe("recommendation engine", () => {
  test("recommends clean preview, caution review, and inactive archive follow-up", () => {
    const recommendations = generateRecommendations({
      projectName: "voice-ai",
      status: "STALE",
      summary: {
        totalSizeBytes: 1_000,
        safeCleanupBytes: 400,
        cautionBytes: 200,
        protectedBytes: 300,
        unknownBytes: 100,
      },
      items: [
        {
          path: "node_modules",
          absolutePath: "/tmp/voice-ai/node_modules",
          classification: "safe",
          kind: "directory",
          sizeBytes: 400,
          reason: "Generated dependency directory.",
          ruleId: "generated-directory",
          canAutoClean: true,
        },
        {
          path: "reports",
          absolutePath: "/tmp/voice-ai/reports",
          classification: "caution",
          kind: "directory",
          sizeBytes: 200,
          reason: "Needs review.",
          ruleId: "review-directory",
          canAutoClean: false,
        },
      ],
    });

    expect(recommendations.map((item) => item.kind)).toEqual(["clean-preview", "review-caution", "archive-later"]);
    expect(recommendations[0]?.command).toBe("kundol clean voice-ai");
  });

  test("emits a calm no-op recommendation when nothing is cleanable", () => {
    const recommendations = generateRecommendations({
      projectName: "tiny-lib",
      summary: {
        totalSizeBytes: 10,
        safeCleanupBytes: 0,
        cautionBytes: 0,
        protectedBytes: 10,
        unknownBytes: 0,
      },
      items: [],
    });

    expect(recommendations).toEqual([
      {
        kind: "nothing-to-clean",
        priority: "low",
        message: "No safe generated cleanup candidates were found.",
      },
    ]);
  });
});
