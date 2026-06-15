import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatSessionAuditLine, getSessionAuditLogPath, recordSessionAudit } from "../../src/services/audit";

describe("session audit log", () => {
  test("formats timestamped device action project lines", () => {
    const previousTag = process.env.KUNDOL_MACHINE_TAG;
    process.env.KUNDOL_MACHINE_TAG = "dev-box";
    try {
      const line = formatSessionAuditLine({
        at: new Date("2026-06-15T16:15:00.000Z"),
        action: "PROJECT_SCAN",
        projectName: "api:orders",
      });

      expect(line).toBe("2026-06-15T16:15:00.000Z : dev-box : PROJECT_SCAN : api-orders");
    } finally {
      if (previousTag === undefined) {
        delete process.env.KUNDOL_MACHINE_TAG;
      } else {
        process.env.KUNDOL_MACHINE_TAG = previousTag;
      }
    }
  });

  test("appends records under the per-run sessions directory", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "kundol-audit-"));
    const logPath = recordSessionAudit({ homeDir }, { action: "LIST" });

    expect(logPath).toBe(getSessionAuditLogPath({ homeDir }));
    const content = await readFile(logPath!, "utf8");
    expect(content).toContain(" : LIST : -\n");
  });
});
