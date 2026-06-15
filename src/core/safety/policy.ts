import { basename, hasSegment, normalizeRelativePath, pathSegments } from "./path-utils";
import type { CleanupClassificationResult, CleanupPolicyInput, RuntimeFamily } from "./types";

const PROTECTED_DIRECTORY_SEGMENTS = new Set([
  ".git",
  "src",
  "source",
  "sources",
  "migrations",
  "migration",
  "assets",
  "asset",
  "uploads",
  "upload",
  "media",
  "public",
  "static",
  "resources",
  "resource",
  "ProjectSettings",
  "Assets",
]);

const PROTECTED_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "deno.json",
  "deno.jsonc",
  "deps.ts",
  "import_map.json",
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "poetry.lock",
  "Pipfile",
  "Pipfile.lock",
  "uv.lock",
  "setup.py",
  "setup.cfg",
  "tox.ini",
  "go.mod",
  "go.sum",
  "go.work",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradlew",
  "gradlew.bat",
  "mvnw",
  "mvnw.cmd",
  "global.json",
  "Directory.Build.props",
  "packages.lock.json",
  "README.md",
  "README.kundol-demo.md",
]);

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".fs",
  ".vb",
  ".kt",
  ".kts",
  ".swift",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
]);

const DATABASE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".duckdb", ".mdb"]);
const MEDIA_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".mp3",
  ".wav",
  ".flac",
]);

const SAFE_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  ".turbo",
  ".parcel-cache",
  ".vite",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".nox",
  ".tox",
  "htmlcov",
  ".gradle",
  "target",
  "obj",
  "TestResults",
  ".vs",
  "Temp",
  "Library",
  "Logs",
]);

const CAUTION_DIRECTORY_NAMES = new Set([
  ".venv",
  "venv",
  "env",
  "reports",
  "report",
  "exports",
  "release",
  "releases",
  "vendor",
]);

const SAFE_FILE_NAMES = new Set([
  ".eslintcache",
  "tsconfig.tsbuildinfo",
  "coverage.out",
  "tarpaulin-report.html",
]);

const SAFE_FILE_SUFFIXES = [".egg-info", ".profraw", ".profdata", ".test"];
const CAUTION_FILE_SUFFIXES = [".user", ".bak", ".tmp"];

export function classifyCleanupPath(input: CleanupPolicyInput): CleanupClassificationResult {
  const relativePath = normalizeRelativePath(input.relativePath);
  const name = basename(relativePath);
  const lowerName = name.toLowerCase();
  const runtimes = new Set(input.runtimes ?? []);

  if (relativePath === ".") {
    return unknown("root", "Project root is not a cleanup candidate.");
  }

  if (hasSegment(relativePath, PROTECTED_DIRECTORY_SEGMENTS)) {
    return protectedItem("protected-path", "Source, VCS, asset, upload, media, resource, or migration paths are protected.");
  }

  if (name === ".env" || name.startsWith(".env.")) {
    return protectedItem("env-file", "Environment files may contain secrets and are protected.");
  }

  if (PROTECTED_FILENAMES.has(name)) {
    return protectedItem("manifest-or-lockfile", "Manifests, lockfiles, wrappers, and project metadata are protected.");
  }

  const extension = fileExtension(lowerName);
  if (DATABASE_EXTENSIONS.has(extension)) {
    return protectedItem("database-file", "Database files are protected and require explicit manual handling.");
  }

  if (MEDIA_EXTENSIONS.has(extension)) {
    return protectedItem("media-file", "Media assets are protected and must not be cleaned automatically.");
  }

  if (!input.isDirectory && SOURCE_EXTENSIONS.has(extension)) {
    return protectedItem("source-file", "Source files are protected.");
  }

  if (input.isDirectory && isSafeDirectory(relativePath, name, runtimes)) {
    return safeItem("generated-directory", safeDirectoryReason(name, runtimes));
  }

  if (!input.isDirectory && isSafeFile(name)) {
    return safeItem("generated-file", safeFileReason(name));
  }

  if (input.isDirectory && CAUTION_DIRECTORY_NAMES.has(name)) {
    return cautionItem("review-directory", cautionDirectoryReason(name));
  }

  if (!input.isDirectory && CAUTION_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
    return cautionItem("review-file", "Temporary or user-specific file needs review before cleanup.");
  }

  return unknown("no-rule", "No cleanup rule matched.");
}

function isSafeDirectory(relativePath: string, name: string, runtimes: ReadonlySet<RuntimeFamily>): boolean {
  if (SAFE_DIRECTORY_NAMES.has(name)) {
    return true;
  }

  if (name === "build") {
    return true;
  }

  if (name === "bin") {
    return runtimes.has("go") || runtimes.has("dotnet");
  }

  if (name.endsWith(".egg-info")) {
    return runtimes.has("python");
  }

  const segments = pathSegments(relativePath);
  return segments.includes(".pytest_cache") || segments.includes("__pycache__");
}

function isSafeFile(name: string): boolean {
  const lowerName = name.toLowerCase();
  return SAFE_FILE_NAMES.has(name) || SAFE_FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix));
}

function safeDirectoryReason(name: string, runtimes: ReadonlySet<RuntimeFamily>): string {
  if (name === "node_modules") return "Generated dependency directory that can be recreated from package manifests.";
  if (name === ".venv" || name === "venv") return "Virtual environment; recreate from Python dependency files if needed.";
  if (name === "bin" && runtimes.has("go")) return "Compiled Go binary output; verify no release artifacts before applying cleanup.";
  if (name === "bin" && runtimes.has("dotnet")) return ".NET build output that can usually be regenerated.";
  if (name === "target") return "Generated Rust, Java, or build-tool output.";
  if (name === "build" || name === "dist") return "Generated build output.";
  return "Generated cache, coverage, dependency, or build output.";
}

function safeFileReason(name: string): string {
  if (name === "coverage.out") return "Generated Go coverage output.";
  if (name.endsWith(".test")) return "Generated Go test binary.";
  if (name === "tsconfig.tsbuildinfo") return "Generated TypeScript incremental build metadata.";
  return "Generated cache, coverage, or profiling output.";
}

function cautionDirectoryReason(name: string): string {
  if (name === "vendor") return "Vendored dependencies may be intentional source-controlled project content.";
  if (name === ".venv" || name === "venv" || name === "env") return "Virtual environments can be large but may take time to recreate.";
  if (name === "release" || name === "releases") return "Release outputs may be deliverables and need review.";
  return "Generated-looking directory needs human review before cleanup.";
}

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot <= 0 ? "" : name.slice(lastDot);
}

function safeItem(ruleId: string, reason: string): CleanupClassificationResult {
  return { classification: "safe", reason, ruleId, canAutoClean: true };
}

function cautionItem(ruleId: string, reason: string): CleanupClassificationResult {
  return { classification: "caution", reason, ruleId, canAutoClean: false };
}

function protectedItem(ruleId: string, reason: string): CleanupClassificationResult {
  return { classification: "protected", reason, ruleId, canAutoClean: false };
}

function unknown(ruleId: string, reason: string): CleanupClassificationResult {
  return { classification: "unknown", reason, ruleId, canAutoClean: false };
}
