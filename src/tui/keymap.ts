export const tuiKeymap = {
  quit: ["q", "escape", "ctrl+c"],
  dashboard: ["d"],
  projects: ["p"],
  runtimes: ["r"],
  settings: [","],
  refresh: ["shift+r"],
  index: ["i"],
  scan: ["s"],
  help: ["?"],
} as const;

export const keymapHelp = [
  { key: "d", label: "Dashboard" },
  { key: "p", label: "Projects" },
  { key: "r", label: "Runtimes" },
  { key: "i", label: "Index" },
  { key: "s", label: "Scan selected" },
  { key: "q", label: "Quit" },
] as const;

export function matchesKey(input: string, keys: readonly string[]): boolean {
  return keys.includes(input);
}
