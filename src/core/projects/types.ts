export type RuntimeFamily =
  | "node"
  | "bun"
  | "deno"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "dotnet"
  | "git";

export type ProjectKind = "runtime" | "mixed" | "git-only" | "unknown";

export type LifecycleStatus =
  | "NEW"
  | "ACTIVE"
  | "PAUSED"
  | "STALE"
  | "ARCHIVED"
  | "DELETED";

export interface RuntimeMarker {
  runtime: RuntimeFamily;
  marker: string;
  path: string;
  strength: "strong" | "medium" | "weak";
}

export interface DetectedRuntime {
  runtime: RuntimeFamily;
  markers: RuntimeMarker[];
  score: number;
}

export interface ProjectTypeInference {
  kind: ProjectKind;
  primaryRuntime: RuntimeFamily | null;
  runtimes: RuntimeFamily[];
  displayType: string;
  confidence: "high" | "medium" | "low";
}

export interface GitMetadata {
  isGitRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  dirty: boolean | null;
  lastModifiedAt: Date | null;
  warnings: DiscoveryWarning[];
}

export interface DiscoveryWarning {
  code:
    | "PERMISSION_DENIED"
    | "UNREADABLE_DIRECTORY"
    | "UNREADABLE_FILE"
    | "SYMLINK_SKIPPED"
    | "GIT_METADATA_FAILED"
    | "SIZE_CALCULATION_FAILED"
    | "EXCLUDED_PATH_SKIPPED";
  path: string;
  message: string;
}

export interface DiscoveredProject {
  name: string;
  path: string;
  markers: RuntimeMarker[];
  detectedRuntimes: DetectedRuntime[];
  type: ProjectTypeInference;
}
