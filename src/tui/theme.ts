import type { ProjectLifecycleStatus, RuntimeFamily } from "./types";

export const tuiTheme = {
  color: {
    title: "cyan",
    text: "white",
    muted: "gray",
    border: "gray",
    ok: "green",
    warning: "yellow",
    danger: "red",
    info: "blue",
    accent: "magenta",
  },
  symbol: {
    app: "kundol",
    divider: "-",
    pointer: ">",
    bullet: "-",
    dirty: "dirty",
    clean: "clean",
    safe: "SAFE",
    caution: "CAUTION",
    protected: "PROTECTED",
  },
  spacing: {
    sectionGap: 1,
    tableGap: 2,
  },
} as const;

export const statusTone: Record<ProjectLifecycleStatus, keyof typeof tuiTheme.color> = {
  NEW: "info",
  ACTIVE: "ok",
  PAUSED: "warning",
  STALE: "warning",
  ARCHIVED: "muted",
  DELETED: "danger",
  UNKNOWN: "muted",
};

export const runtimeLabel: Record<RuntimeFamily, string> = {
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  dotnet: ".NET",
  mixed: "Mixed",
  git: "Git",
  unknown: "Unknown",
};
