export type CleanupClassification = "safe" | "caution" | "protected" | "unknown";

export type RuntimeFamily =
  | "node"
  | "bun"
  | "deno"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "dotnet"
  | "unity"
  | "unknown";

export type ProjectLifecycleStatus =
  | "NEW"
  | "ACTIVE"
  | "PAUSED"
  | "STALE"
  | "ARCHIVED"
  | "DELETED"
  | string;

export interface CleanupClassificationResult {
  classification: CleanupClassification;
  reason: string;
  ruleId: string;
  canAutoClean: boolean;
}

export interface CleanupPolicyInput {
  relativePath: string;
  isDirectory: boolean;
  runtimes?: RuntimeFamily[];
}
