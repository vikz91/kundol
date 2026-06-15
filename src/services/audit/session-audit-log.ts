import { appendFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { getKundolHomePath } from "../../config/paths";

export interface SessionAuditContext {
  databasePath?: string;
  homeDir?: string;
}

export interface SessionAuditEntry {
  action: string;
  projectName?: string | null;
  at?: Date;
}

const sessionStartedAt = new Date();
const sessionId = `${formatFileTimestamp(sessionStartedAt)}-${process.pid}`;

export function recordSessionAudit(context: SessionAuditContext, entry: SessionAuditEntry): string | null {
  try {
    const logPath = getSessionAuditLogPath(context);
    mkdirSync(join(getKundolHomePath(context), "sessions"), { recursive: true });
    appendFileSync(logPath, `${formatSessionAuditLine(entry)}\n`, "utf8");
    return logPath;
  } catch {
    return null;
  }
}

export function getSessionAuditLogPath(context: SessionAuditContext): string {
  return join(getKundolHomePath(context), "sessions", `session-${sessionId}.log`);
}

export function formatSessionAuditLine(entry: SessionAuditEntry): string {
  return [
    (entry.at ?? new Date()).toISOString(),
    deviceName(),
    normalizeAuditField(entry.action),
    normalizeAuditField(entry.projectName || "-"),
  ].join(" : ");
}

function deviceName(): string {
  return normalizeAuditField(process.env.KUNDOL_MACHINE_TAG ?? process.env.KUNDOL_NODE_TAG ?? hostname());
}

function normalizeAuditField(value: string): string {
  return value.replace(/\s+/g, " ").replace(/:/g, "-").trim() || "-";
}

function formatFileTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}
