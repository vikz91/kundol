export function fitCell(value: string, width: number): string {
  if (width <= 0) {
    return "";
  }

  if (value.length <= width) {
    return value.padEnd(width, " ");
  }

  if (width === 1) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 1)}~`;
}

export function formatDirtyLabel(dirty?: boolean): string {
  if (dirty === undefined) {
    return "unknown";
  }

  return dirty ? "dirty" : "clean";
}

export function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}
