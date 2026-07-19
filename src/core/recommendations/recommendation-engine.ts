import type { ScanItem, ScanSummary } from "../analysis/cleanable-item";
import type { ProjectLifecycleStatus } from "../safety/types";
import type { Recommendation } from "./recommendation";

export interface RecommendationInput {
  projectName: string;
  projectId?: string;
  status?: ProjectLifecycleStatus;
  summary: ScanSummary;
  items: ScanItem[];
}

const ARCHIVE_CANDIDATE_STATUSES = new Set(["STALE", "ARCHIVED", "PAUSED"]);

export function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const target = input.projectId ?? input.projectName;
  const cautionItems = input.items.filter((item) => item.classification === "caution");

  if (input.summary.safeCleanupBytes > 0) {
    recommendations.push({
      kind: "clean-preview",
      priority: "high",
      message: `Run \`kundol optimise projects <workdir>\` to scan, confirm, and clean safe generated files for ${target}.`,
      command: "kundol optimise projects <workdir>",
      itemPaths: input.items.filter((item) => item.classification === "safe").map((item) => item.path),
    });
  }

  if (cautionItems.length > 0) {
    recommendations.push({
      kind: "review-caution",
      priority: "medium",
      message: "Review caution items manually before cleanup; they may contain deliverables, vendored content, reports, or local state.",
      itemPaths: cautionItems.map((item) => item.path),
    });
  }

  if (input.status && ARCHIVE_CANDIDATE_STATUSES.has(input.status) && input.summary.safeCleanupBytes > 0) {
    recommendations.push({
      kind: "archive-later",
      priority: "low",
      message: "This project looks inactive; archive or compact workflows can be considered after the MVP cleanup flow is available.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      kind: "nothing-to-clean",
      priority: "low",
      message: "No safe generated cleanup candidates were found.",
    });
  }

  return recommendations;
}
