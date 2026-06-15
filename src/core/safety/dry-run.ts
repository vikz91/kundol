import type { ScanItem } from "../analysis/cleanable-item";

export interface DryRunCleanupPlan {
  dryRun: true;
  items: ScanItem[];
  recoverableBytes: number;
  warnings: string[];
}

export function createDryRunCleanupPlan(items: ScanItem[]): DryRunCleanupPlan {
  const safeItems = items.filter((item) => item.classification === "safe" && item.canAutoClean);

  return {
    dryRun: true,
    items: safeItems,
    recoverableBytes: safeItems.reduce((sum, item) => sum + item.sizeBytes, 0),
    warnings: ["Dry run only. No files were deleted."],
  };
}
