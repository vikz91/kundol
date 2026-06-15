import path from "node:path";

export function toProjectRelativePath(projectPath: string, absolutePath: string): string {
  const relativePath = path.relative(projectPath, absolutePath);
  return normalizeRelativePath(relativePath || ".");
}

export function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return normalized === "" ? "." : normalized;
}

export function pathSegments(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  return normalized === "." ? [] : normalized.split("/").filter(Boolean);
}

export function basename(relativePath: string): string {
  const segments = pathSegments(relativePath);
  return segments.at(-1) ?? ".";
}

export function hasSegment(relativePath: string, candidates: ReadonlySet<string>): boolean {
  return pathSegments(relativePath).some((segment) => candidates.has(segment));
}

export function isInsideSegment(relativePath: string, segmentName: string): boolean {
  return pathSegments(relativePath).includes(segmentName);
}
