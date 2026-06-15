import type { DetectedRuntime, ProjectTypeInference, RuntimeFamily } from "../projects/types";

const primaryRuntimePriority: Record<RuntimeFamily, number> = {
  bun: 90,
  deno: 85,
  node: 80,
  python: 70,
  go: 65,
  rust: 60,
  java: 55,
  dotnet: 50,
  git: 1,
};

const displayNames: Record<RuntimeFamily, string> = {
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  dotnet: ".NET",
  git: "Git",
};

export function inferProjectType(detectedRuntimes: DetectedRuntime[]): ProjectTypeInference {
  const sortedRuntimes = [...detectedRuntimes].sort(compareDetectedRuntimes);
  const runtimeFamilies = sortedRuntimes.map((runtime) => runtime.runtime);
  const nonGitRuntimes = sortedRuntimes.filter((runtime) => runtime.runtime !== "git");

  if (sortedRuntimes.length === 0) {
    return {
      kind: "unknown",
      primaryRuntime: null,
      runtimes: [],
      displayType: "Unknown",
      confidence: "low",
    };
  }

  if (nonGitRuntimes.length === 0) {
    return {
      kind: "git-only",
      primaryRuntime: "git",
      runtimes: runtimeFamilies,
      displayType: "Git repository",
      confidence: "low",
    };
  }

  const primaryDetectedRuntime = nonGitRuntimes[0];
  if (!primaryDetectedRuntime) {
    return {
      kind: "unknown",
      primaryRuntime: null,
      runtimes: runtimeFamilies,
      displayType: "Unknown",
      confidence: "low",
    };
  }

  const primaryRuntime = primaryDetectedRuntime.runtime;
  const kind = nonGitRuntimes.length > 1 ? "mixed" : "runtime";
  const displayType =
    kind === "mixed"
      ? `Mixed (${nonGitRuntimes.map((runtime) => displayNames[runtime.runtime]).join(" + ")})`
      : displayNames[primaryRuntime];

  return {
    kind,
    primaryRuntime,
    runtimes: runtimeFamilies,
    displayType,
    confidence: confidenceFor(primaryDetectedRuntime),
  };
}

function compareDetectedRuntimes(a: DetectedRuntime, b: DetectedRuntime): number {
  if (a.runtime === "git" && b.runtime !== "git") {
    return 1;
  }

  if (b.runtime === "git" && a.runtime !== "git") {
    return -1;
  }

  return (
    b.score - a.score ||
    primaryRuntimePriority[b.runtime] - primaryRuntimePriority[a.runtime] ||
    a.runtime.localeCompare(b.runtime)
  );
}

function confidenceFor(runtime: DetectedRuntime): ProjectTypeInference["confidence"] {
  if (runtime.markers.some((marker) => marker.strength === "strong")) {
    return "high";
  }

  if (runtime.markers.some((marker) => marker.strength === "medium")) {
    return "medium";
  }

  return "low";
}
