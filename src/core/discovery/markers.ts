import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DetectedRuntime, RuntimeFamily, RuntimeMarker } from "../projects/types";

type MarkerDefinition = {
  runtime: RuntimeFamily;
  marker: string;
  strength: RuntimeMarker["strength"];
  match: (entryNames: Set<string>, entries: DirectoryEntrySummary[]) => boolean;
};

type DirectoryEntrySummary = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
};

const literalMarkers: Array<Omit<MarkerDefinition, "match">> = [
  { runtime: "git", marker: ".git", strength: "strong" },
  { runtime: "node", marker: "package.json", strength: "strong" },
  { runtime: "node", marker: "package-lock.json", strength: "medium" },
  { runtime: "node", marker: "npm-shrinkwrap.json", strength: "medium" },
  { runtime: "node", marker: "pnpm-lock.yaml", strength: "medium" },
  { runtime: "node", marker: "yarn.lock", strength: "medium" },
  { runtime: "node", marker: ".nvmrc", strength: "weak" },
  { runtime: "node", marker: ".node-version", strength: "weak" },
  { runtime: "bun", marker: "bun.lock", strength: "strong" },
  { runtime: "bun", marker: "bun.lockb", strength: "strong" },
  { runtime: "bun", marker: ".bun-version", strength: "medium" },
  { runtime: "deno", marker: "deno.json", strength: "strong" },
  { runtime: "deno", marker: "deno.jsonc", strength: "strong" },
  { runtime: "deno", marker: "deps.ts", strength: "medium" },
  { runtime: "deno", marker: "import_map.json", strength: "medium" },
  { runtime: "python", marker: "pyproject.toml", strength: "strong" },
  { runtime: "python", marker: "requirements.txt", strength: "strong" },
  { runtime: "python", marker: "poetry.lock", strength: "medium" },
  { runtime: "python", marker: "Pipfile", strength: "medium" },
  { runtime: "python", marker: "Pipfile.lock", strength: "medium" },
  { runtime: "python", marker: "uv.lock", strength: "medium" },
  { runtime: "python", marker: "setup.py", strength: "medium" },
  { runtime: "python", marker: "setup.cfg", strength: "medium" },
  { runtime: "python", marker: "tox.ini", strength: "weak" },
  { runtime: "go", marker: "go.mod", strength: "strong" },
  { runtime: "go", marker: "go.sum", strength: "medium" },
  { runtime: "go", marker: "go.work", strength: "strong" },
  { runtime: "rust", marker: "Cargo.toml", strength: "strong" },
  { runtime: "rust", marker: "Cargo.lock", strength: "medium" },
  { runtime: "rust", marker: "rust-toolchain", strength: "medium" },
  { runtime: "rust", marker: "rust-toolchain.toml", strength: "medium" },
  { runtime: "java", marker: "pom.xml", strength: "strong" },
  { runtime: "java", marker: "build.gradle", strength: "strong" },
  { runtime: "java", marker: "build.gradle.kts", strength: "strong" },
  { runtime: "java", marker: "settings.gradle", strength: "medium" },
  { runtime: "java", marker: "settings.gradle.kts", strength: "medium" },
  { runtime: "java", marker: "gradlew", strength: "medium" },
  { runtime: "java", marker: "mvnw", strength: "medium" },
  { runtime: "dotnet", marker: "global.json", strength: "medium" },
  { runtime: "dotnet", marker: "Directory.Build.props", strength: "medium" },
  { runtime: "dotnet", marker: "packages.lock.json", strength: "medium" },
];

const markerDefinitions: MarkerDefinition[] = [
  ...literalMarkers.map((definition) => ({
    ...definition,
    match: (entryNames: Set<string>) => entryNames.has(definition.marker),
  })),
  {
    runtime: "dotnet",
    marker: "*.csproj",
    strength: "strong",
    match: (_entryNames, entries) => entries.some((entry) => entry.isFile && entry.name.endsWith(".csproj")),
  },
  {
    runtime: "dotnet",
    marker: "*.sln",
    strength: "strong",
    match: (_entryNames, entries) => entries.some((entry) => entry.isFile && entry.name.endsWith(".sln")),
  },
];

const markerScores: Record<RuntimeMarker["strength"], number> = {
  strong: 4,
  medium: 2,
  weak: 1,
};

export async function detectProjectMarkers(directoryPath: string): Promise<RuntimeMarker[]> {
  const entries = await readDirectorySummary(directoryPath);
  const entryNames = new Set(entries.map((entry) => entry.name));
  const markers: RuntimeMarker[] = [];

  for (const definition of markerDefinitions) {
    if (definition.match(entryNames, entries)) {
      markers.push({
        runtime: definition.runtime,
        marker: definition.marker,
        path: join(directoryPath, definition.marker),
        strength: definition.strength,
      });
    }
  }

  const bunPackageJsonMarker = await detectBunPackageJsonMarker(directoryPath, entryNames);
  if (bunPackageJsonMarker) {
    markers.push(bunPackageJsonMarker);
  }

  return markers.sort(compareRuntimeMarkers);
}

export function groupDetectedRuntimes(markers: RuntimeMarker[]): DetectedRuntime[] {
  const grouped = new Map<RuntimeFamily, RuntimeMarker[]>();

  for (const marker of markers) {
    const runtimeMarkers = grouped.get(marker.runtime) ?? [];
    runtimeMarkers.push(marker);
    grouped.set(marker.runtime, runtimeMarkers);
  }

  return Array.from(grouped.entries())
    .map(([runtime, runtimeMarkers]) => ({
      runtime,
      markers: runtimeMarkers.sort(compareRuntimeMarkers),
      score: runtimeMarkers.reduce((total, marker) => total + markerScores[marker.strength], 0),
    }))
    .sort((a, b) => b.score - a.score || a.runtime.localeCompare(b.runtime));
}

export function hasProjectMarkers(markers: RuntimeMarker[]): boolean {
  return markers.length > 0;
}

async function readDirectorySummary(directoryPath: string): Promise<DirectoryEntrySummary[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
  }));
}

async function detectBunPackageJsonMarker(
  directoryPath: string,
  entryNames: Set<string>,
): Promise<RuntimeMarker | null> {
  if (!entryNames.has("package.json")) {
    return null;
  }

  try {
    const packageJsonPath = join(directoryPath, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };
    const packageManager = packageJson.packageManager?.toLowerCase() ?? "";
    const scripts = Object.values(packageJson.scripts ?? {}).join("\n").toLowerCase();

    if (packageManager.startsWith("bun@") || scripts.includes("bun ")) {
      return {
        runtime: "bun",
        marker: "package.json#bun",
        path: packageJsonPath,
        strength: "strong",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function compareRuntimeMarkers(a: RuntimeMarker, b: RuntimeMarker): number {
  return (
    a.runtime.localeCompare(b.runtime) ||
    markerScores[b.strength] - markerScores[a.strength] ||
    a.marker.localeCompare(b.marker)
  );
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
