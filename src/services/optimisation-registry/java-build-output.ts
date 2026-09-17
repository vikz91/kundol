import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import path from "node:path";
import { hasRecentChanges } from "./cli-bindings";
import { capturePathTarget, samePathIdentity } from "./path-targets";
import { removeGeneratedPathSafely } from "./safe-removal";
import type {
  RegistryActionAdapter, RegistryAdapterPathTarget, RegistryEngineContext, RegistryPathTarget,
  RegistryRule, RegistrySelectorAdapter, RegistryTarget, RegistryValidator,
} from "./types";

const RULE_ID = "project.java.build_output";
const SELECTOR_ID = "jvm.project_build_outputs";
const ACTION_ID = "jvm.project_build.remove_verified";
const MAX_ROOT_ENTRIES = 4_096;
const MAX_OUTPUT_ENTRIES = 20_000;
const MAX_MARKER_BYTES = 128 * 1024;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const RELEASE_EXTENSIONS = [".jar", ".war", ".ear", ".zip", ".tar", ".tar.gz", ".tgz", ".dmg", ".pkg", ".deb", ".rpm", ".exe", ".msi"];
const PROTECTED_NAMES = new Set([".git", ".env", "assets", "uploads", "release", "releases", "distribution", "distributions", "publish", "published", "installer", "installers", "src", "vendor"]);
const PROTECTED_EXTENSIONS = [".db", ".sqlite", ".sqlite3"];
const MAVEN_MARKERS = new Set(["classes", "test-classes", "maven-status", "generated-sources", "generated-test-sources", "surefire-reports"]);
const GRADLE_MARKERS = new Set(["classes", "tmp", "test-results", "resources", "generated"]);

type Variant = "maven" | "gradle";
type BuildMatch = { root: string; output: string; variant: Variant };

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function approvedRoot(root: string, context: RegistryEngineContext): boolean {
  if (!context.workdirRoot || !context.projectRoots.includes(root)) return false;
  const workdir = path.resolve(context.workdirRoot);
  return root === workdir || inside(workdir, root);
}

function approvedRule(rule: RegistryRule): boolean {
  return rule.id === RULE_ID && rule.scope === "workdir" && rule.selector.kind === "adapter" &&
    rule.selector.adapterId === SELECTOR_ID && rule.selector.variants?.length === 2 &&
    rule.selector.variants.includes("maven") && rule.selector.variants.includes("gradle") &&
    rule.action.kind === "adapter" && rule.action.adapterId === ACTION_ID &&
    rule.review.tier === "review" && rule.review.selection === "explicit" && !rule.review.forceEligible;
}

async function markerText(filename: string, root: string): Promise<string | null> {
  try {
    const reviewed = await capturePathTarget(filename, root, "file", false);
    const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.dev !== reviewed.device || before.ino !== reviewed.inode ||
        before.size > MAX_MARKER_BYTES) return null;
      const content = Buffer.alloc(MAX_MARKER_BYTES + 1);
      let read = 0;
      while (read < content.length) {
        const result = await handle.read(content, read, content.length - read, null);
        if (result.bytesRead === 0) break;
        read += result.bytesRead;
      }
      if (read > MAX_MARKER_BYTES) return null;
      const source = content.toString("utf8", 0, read);
      const after = await handle.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || source.includes("\0")) return null;
      const recaptured = await capturePathTarget(filename, root, "file", false);
      return samePathIdentity(reviewed, recaptured) ? source : null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function maybePresent(filename: string): Promise<boolean> {
  try { await lstat(filename); return true; }
  catch (error) { return !isMissing(error); }
}

function simpleMavenPom(source: string): boolean {
  if (/<!\s*(?:DOCTYPE|ENTITY|\[CDATA)/i.test(source) || /<(?:parent|profiles|modules|build|reporting)\b/i.test(source)) return false;
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*<\?xml\s+[^?]*\?>/, "");
  if (withoutComments.includes("<!--") || withoutComments.includes("-->") || withoutComments.includes("<?") ||
    /<(?:parent|profiles|modules|build|reporting)\b/i.test(withoutComments)) return false;
  const tags = /<\/?([A-Za-z][\w.-]*)(?:\s[^<>]*?)?\s*\/?>/g;
  const stack: string[] = [];
  let cursor = 0;
  let modelVersion = false;
  let artifactId = false;
  let groupId = false;
  let version = false;
  for (const match of withoutComments.matchAll(tags)) {
    const index = match.index;
    if (withoutComments.slice(cursor, index).includes("<")) return false;
    const token = match[0];
    const name = match[1]!;
    if (token.startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else {
      if (stack.length === 0 && (name !== "project" || index !== withoutComments.search(/\S/))) return false;
      const directContent = withoutComments.slice(index + token.length);
      if (stack.length === 1 && name === "modelVersion" &&
        /^\s*4\.0\.0\s*<\/modelVersion>/.test(directContent)) modelVersion = true;
      if (stack.length === 1 && name === "artifactId" &&
        /^\s*[A-Za-z0-9_.-]+\s*<\/artifactId>/.test(directContent)) artifactId = true;
      if (stack.length === 1 && name === "groupId" &&
        /^\s*[A-Za-z0-9_.-]+\s*<\/groupId>/.test(directContent)) groupId = true;
      if (stack.length === 1 && name === "version" &&
        /^\s*[A-Za-z0-9_.-]+\s*<\/version>/.test(directContent)) version = true;
      if (stack.length === 1 && name === "packaging" &&
        !/^\s*jar\s*<\/packaging>/.test(directContent)) return false;
      if (!token.endsWith("/>")) stack.push(name);
    }
    cursor = index + token.length;
  }
  return stack.length === 0 && !withoutComments.slice(cursor).includes("<") && modelVersion && artifactId && groupId && version;
}

async function mavenOwner(root: string): Promise<boolean> {
  if (await maybePresent(path.join(root, "build.gradle")) ||
    await maybePresent(path.join(root, "build.gradle.kts"))) return false;
  const source = await markerText(path.join(root, "pom.xml"), root);
  if (!source || !simpleMavenPom(source)) return false;
  for (const config of ["extensions.xml", "maven.config", "jvm.config"]) {
    try { await lstat(path.join(root, ".mvn", config)); return false; }
    catch (error) { if (!isMissing(error)) return false; }
  }
  return true;
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function simpleGradleBuild(source: string): boolean {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
  if (clean.includes("/*") || clean.includes("*/")) return false;
  return /^plugins\s*\{\s*(?:java|id\s*\(?\s*["'](?:java|java-library)["']\s*\)?)\s*\}\s*;?$/.test(clean);
}

function simpleGradleSettings(source: string): boolean {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").trim();
  if (clean.includes("/*") || clean.includes("*/")) return false;
  return clean === "" || /^rootProject\.name\s*=\s*["'][A-Za-z0-9_.-]+["']\s*;?$/.test(clean);
}

async function gradleOwner(root: string): Promise<boolean> {
  if (await maybePresent(path.join(root, "pom.xml"))) return false;
  for (const extraConfig of ["gradle.properties", "init.gradle", "init.gradle.kts"]) {
    if (await maybePresent(path.join(root, extraConfig))) return false;
  }
  const scripts = ["build.gradle", "build.gradle.kts"];
  const settings = ["settings.gradle", "settings.gradle.kts"];
  const scriptTexts = await Promise.all(scripts.map((name) => markerText(path.join(root, name), root)));
  const settingsTexts = await Promise.all(settings.map((name) => markerText(path.join(root, name), root)));
  for (let index = 0; index < scripts.length; index++) {
    if (scriptTexts[index] === null && await maybePresent(path.join(root, scripts[index]!))) return false;
  }
  for (let index = 0; index < settings.length; index++) {
    if (settingsTexts[index] === null && await maybePresent(path.join(root, settings[index]!))) return false;
  }
  if (scriptTexts.filter((value) => value !== null).length !== 1 ||
    settingsTexts.filter((value) => value !== null).length !== 1) return false;
  return simpleGradleBuild(scriptTexts.find((value) => value !== null)!) &&
    simpleGradleSettings(settingsTexts.find((value) => value !== null)!);
}

function disallowedEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_NAMES.has(lower) || lower.startsWith(".env.") ||
    RELEASE_EXTENSIONS.some((extension) => lower.endsWith(extension)) ||
    PROTECTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

async function unambiguousOutput(output: string, variant: Variant): Promise<boolean> {
  const pending = [output];
  let checked = 0;
  let generatedMarker = false;
  const markers = variant === "maven" ? MAVEN_MARKERS : GRADLE_MARKERS;
  try {
    while (pending.length > 0) {
      const directory = pending.pop()!;
      for await (const entry of await opendir(directory)) {
        if (++checked > MAX_OUTPUT_ENTRIES || disallowedEntry(entry.name) || entry.isSymbolicLink()) return false;
        if (directory === output && entry.isDirectory() && markers.has(entry.name)) generatedMarker = true;
        if (entry.isDirectory()) pending.push(path.join(directory, entry.name));
        else if (!entry.isFile()) return false;
      }
    }
    return generatedMarker;
  } catch {
    return false;
  }
}

async function exactMatch(root: string, output: string, context: RegistryEngineContext): Promise<BuildMatch | null> {
  const variant: Variant | null = path.basename(output) === "target" ? "maven" :
    path.basename(output) === "build" ? "gradle" : null;
  if (!variant || !approvedRoot(root, context) || path.dirname(output) !== root) return null;
  if (!(variant === "maven" ? await mavenOwner(root) : await gradleOwner(root))) return null;
  try { await capturePathTarget(output, root, "directory", false); }
  catch { return null; }
  try {
    if (await hasRecentChanges(output, Date.now() - QUIET_PERIOD_MS, MAX_OUTPUT_ENTRIES)) return null;
  } catch { return null; }
  if (!(await unambiguousOutput(output, variant))) return null;
  return { root, output, variant };
}

function adapterTarget(match: BuildMatch): RegistryAdapterPathTarget {
  return {
    kind: "path", absolutePath: match.output, scopeRoot: match.root, targetKind: "directory",
    evidence: [match.variant === "maven" ? "standalone Maven POM uses the default target directory" :
      "simple Java Gradle build uses the default build directory", "generated marker present; no release archives or protected entries found; tree quiet for 7 days"],
  };
}

async function reviewedMatch(target: RegistryTarget, context: RegistryEngineContext): Promise<BuildMatch | null> {
  if (target.kind !== "path" || target.fileKind !== "directory") return null;
  return exactMatch(path.resolve(target.scopeRoot), path.resolve(target.absolutePath), context);
}

export const javaBuildOutputSelector: RegistrySelectorAdapter = {
  list: async (rule, context) => {
    if (!approvedRule(rule)) return [];
    const targets: RegistryAdapterPathTarget[] = [];
    for (const suppliedRoot of context.projectRoots) {
      const root = path.resolve(suppliedRoot);
      if (!approvedRoot(root, context)) continue;
      try {
        let checked = 0;
        let exceeded = false;
        const rootTargets: RegistryAdapterPathTarget[] = [];
        for await (const entry of await opendir(root)) {
          if (++checked > MAX_ROOT_ENTRIES) { exceeded = true; break; }
          if (!entry.isDirectory() || (entry.name !== "target" && entry.name !== "build")) continue;
          const match = await exactMatch(root, path.join(root, entry.name), context);
          if (match) rootTargets.push(adapterTarget(match));
        }
        if (!exceeded) targets.push(...rootTargets);
      } catch { continue; }
    }
    return targets;
  },
  lookup: async (rule, reviewed, context) => {
    if (!approvedRule(rule)) return null;
    const match = await reviewedMatch(reviewed, context);
    return match ? adapterTarget(match) : null;
  },
};

export const javaBuildOutputProjectMarker: RegistryValidator = async (rule, candidate, context) => {
  if (!approvedRule(rule) || candidate.target.kind !== "path" || !approvedRoot(candidate.target.scopeRoot, context)) {
    return "Java build-output rule binding changed";
  }
  const root = candidate.target.scopeRoot;
  return (path.basename(candidate.target.absolutePath) === "target" ? await mavenOwner(root) :
    path.basename(candidate.target.absolutePath) === "build" ? await gradleOwner(root) : false)
    ? true : "Java project owner marker no longer matches";
};

export const javaBuildOutputOwnerVerified: RegistryValidator = async (rule, candidate, context) => {
  if (!approvedRule(rule)) return "Java build-output rule binding changed";
  return await reviewedMatch(candidate.target, context) ? true : "Java build output owner or retained content could not be verified";
};

export const javaBuildOutputAction: RegistryActionAdapter = async (rule, candidate, context) => {
  if (!approvedRule(rule) || candidate.ruleId !== RULE_ID || candidate.target.kind !== "path") {
    throw new Error("Java build-output action binding changed");
  }
  const match = await reviewedMatch(candidate.target, context);
  if (!match) throw new Error("Java build output owner or retained content could not be verified");
  const reviewed: RegistryPathTarget = candidate.target;
  const live = await capturePathTarget(match.output, match.root, "directory", false);
  if (!samePathIdentity(reviewed, live)) throw new Error("Java build output changed before removal");
  await removeGeneratedPathSafely(live);
  return { reclaimedBytes: reviewed.sizeBytes };
};
