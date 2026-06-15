import type { CleanupClassification } from "../safety/types";

export interface ScanItem {
  path: string;
  absolutePath: string;
  classification: CleanupClassification;
  kind: "file" | "directory" | "symlink";
  sizeBytes: number;
  reason: string;
  ruleId: string;
  canAutoClean: boolean;
}

export interface ScanSummary {
  totalSizeBytes: number;
  safeCleanupBytes: number;
  cautionBytes: number;
  protectedBytes: number;
  unknownBytes: number;
}
