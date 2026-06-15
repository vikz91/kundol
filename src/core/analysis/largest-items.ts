import type { ScanItem } from "./cleanable-item";

export function largestScanItems(items: ScanItem[], limit = 20): ScanItem[] {
  return [...items]
    .sort((left, right) => right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path))
    .slice(0, Math.max(0, limit));
}
