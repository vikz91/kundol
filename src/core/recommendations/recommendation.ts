export type RecommendationKind = "clean-preview" | "review-caution" | "archive-later" | "nothing-to-clean";

export interface Recommendation {
  kind: RecommendationKind;
  priority: "low" | "medium" | "high";
  message: string;
  command?: string;
  itemPaths?: string[];
}
