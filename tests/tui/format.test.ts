import { describe, expect, test } from "bun:test";
import { fitCell, formatCount, formatDirtyLabel } from "../../src/tui/format";

describe("TUI formatting helpers", () => {
  test("fitCell pads short values", () => {
    expect(fitCell("Go", 5)).toBe("Go   ");
  });

  test("fitCell truncates long values with ASCII marker", () => {
    expect(fitCell("node-api-orders", 8)).toBe("node-ap~");
  });

  test("fitCell handles tiny widths", () => {
    expect(fitCell("abc", 0)).toBe("");
    expect(fitCell("abc", 1)).toBe("a");
  });

  test("formatDirtyLabel avoids color-only meaning", () => {
    expect(formatDirtyLabel(true)).toBe("dirty");
    expect(formatDirtyLabel(false)).toBe("clean");
    expect(formatDirtyLabel()).toBe("unknown");
  });

  test("formatCount handles singular and plural labels", () => {
    expect(formatCount(1, "project")).toBe("1 project");
    expect(formatCount(2, "project")).toBe("2 projects");
  });
});
