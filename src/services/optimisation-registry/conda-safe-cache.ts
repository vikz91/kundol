import { createHash } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { capturePathTarget } from "./path-targets";
import type {
  RegistryActionAdapter, RegistryAdapterResourceTarget, RegistryCandidate,
  RegistryCommandResult, RegistryEngineContext, RegistryRule, RegistrySelectorAdapter, RegistryTarget,
  RegistryValidator,
} from "./types";

const MAX_ROOTS = 8;
const MAX_ENVS = 128;
const MAX_ITEMS = 4_096;
const MAX_TREE_ENTRIES = 150_000;
const QUIET_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;
const INFO_OUTPUT_BYTES = 1024 * 1024;
const CLEAN_OUTPUT_BYTES = 2 * 1024 * 1024;
const ERROR_OUTPUT_BYTES = 4 * 1024;
const LIST_TIMEOUT_MS = 15_000;
const ACTION_TIMEOUT_MS = 120_000;

export const CONDA_SAFE_RULE_ID = "store.conda.safe_cache";
export const CONDA_SAFE_SELECTOR_ADAPTER_ID = "conda.safe_clean_preview";
export const CONDA_SAFE_ACTION_ADAPTER_ID = "conda.safe_clean_selected";

type Category = "tarball" | "index" | "log";
type JsonRecord = Record<string, unknown>;
export type CondaPinnedRunner = (
  argv: readonly string[], cwd: string, environment: Readonly<{ CONDA_PKGS_DIRS?: string }>,
) => Promise<RegistryCommandResult>;

export interface CondaSafeCacheOptions {
  runner: CondaPinnedRunner;
  now?: () => Date;
}

function record(value: unknown, name: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Conda ${name} is not an object`);
  return value as JsonRecord;
}

function strings(value: unknown, name: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum ||
    !value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 4_096) ||
    new Set(value).size !== value.length) throw new Error(`Conda ${name} is incomplete or over budget`);
  return value as string[];
}

function approvedRule(rule: RegistryRule): void {
  if (rule.id !== CONDA_SAFE_RULE_ID || rule.status !== "published" || rule.scope !== "user" ||
    rule.selector.kind !== "adapter" || rule.selector.adapterId !== CONDA_SAFE_SELECTOR_ADAPTER_ID ||
    JSON.stringify(rule.selector.variants) !== JSON.stringify(["tarball", "index", "log"]) ||
    rule.action.kind !== "adapter" || rule.action.adapterId !== CONDA_SAFE_ACTION_ADAPTER_ID ||
    rule.review.tier !== "review" || rule.review.selection !== "explicit" || rule.review.forceEligible ||
    rule.probeCommands?.length) throw new Error("Conda safe cache needs its exact reviewed owner rule");
}

function safeRoot(value: string): string {
  if (!path.isAbsolute(value) || value.includes(",") || value.includes("\0") || value.length > 4_096) {
    throw new Error("Conda package cache root cannot be pinned as one exact directory");
  }
  return path.resolve(value);
}

async function ownerCwd(context: RegistryEngineContext): Promise<string> {
  const cwd = path.resolve(context.commandCwd ?? context.homeDir);
  if (await realpath(cwd) !== cwd || !(await lstat(cwd)).isDirectory()) {
    throw new Error("Conda owner cwd is not a regular canonical directory");
  }
  return cwd;
}

async function ownerJson(runner: CondaPinnedRunner, argv: readonly string[], cwd: string, root?: string): Promise<JsonRecord> {
  const environment = root ? { CONDA_PKGS_DIRS: safeRoot(root) } : {};
  const result = await runner(argv, cwd, environment);
  if (result.exitCode !== 0) throw new Error(`Conda owner command exited ${result.exitCode}`);
  if (result.truncated) throw new Error("Conda owner JSON output was truncated");
  try { return record(JSON.parse(result.stdout), "owner JSON"); }
  catch { throw new Error("Conda owner JSON could not be parsed safely"); }
}

const infoArgv = ["conda", "info", "--json"] as const;
const previewArgv = ["conda", "clean", "--tarballs", "--index-cache", "--logfiles", "--dry-run", "--json"] as const;
const actionArgv: Readonly<Record<Category, readonly string[]>> = {
  tarball: ["conda", "clean", "--tarballs", "--yes", "--json"],
  index: ["conda", "clean", "--index-cache", "--yes", "--json"],
  log: ["conda", "clean", "--logfiles", "--yes", "--json"],
};

interface OwnerInfo { pkgsDirs: string[]; envs: string[] }

function parseInfo(json: JsonRecord, pinnedRoot?: string): OwnerInfo {
  const pkgsDirs = strings(json.pkgs_dirs, "package directories", MAX_ROOTS).map(safeRoot);
  const envs = strings(json.envs, "known environments", MAX_ENVS);
  if (json.active_prefix !== null && json.active_prefix !== undefined) {
    throw new Error("Conda has an active environment; cache cleanup is deferred");
  }
  const details = json.envs_details;
  if (details !== undefined) {
    for (const detail of Object.values(record(details, "environment details"))) {
      if (record(detail, "environment detail").active === true) {
        throw new Error("Conda has an active environment; cache cleanup is deferred");
      }
    }
  }
  if (pinnedRoot && (pkgsDirs.length !== 1 || pkgsDirs[0] !== pinnedRoot)) {
    throw new Error("Conda package-directory override did not pin one reviewed root");
  }
  return { pkgsDirs, envs };
}

async function assertNoSymlinkedEnvs(envs: readonly string[]): Promise<void> {
  for (const environment of envs) {
    if (!path.isAbsolute(environment) || environment.length > 4_096) throw new Error("Conda environment path is not absolute");
    const canonical = path.resolve(environment);
    if (await realpath(canonical) !== canonical || (await lstat(canonical)).isSymbolicLink()) {
      throw new Error("Conda has a symlinked known environment path");
    }
  }
}

function itemName(name: string): string {
  if (!name || name.length > 255 || name === "." || name === ".." || path.basename(name) !== name ||
    name.includes("/") || name.includes("\\") || name.includes("\0")) throw new Error("Conda preview contains an unsafe item name");
  return name;
}

interface PreviewItems { tarball: readonly string[]; index: readonly string[]; log: readonly string[]; tarballBytes: number }

function parsePreview(json: JsonRecord, root: string): PreviewItems {
  if (json.success !== true || json.packages !== undefined || json.tempfiles !== undefined || json.pkgs_dirs !== undefined) {
    throw new Error("Conda preview includes unreviewed clean categories");
  }
  const tarballs = record(json.tarballs, "tarball preview");
  const warnings = strings(tarballs.warnings, "tarball warnings", MAX_ITEMS);
  if (warnings.length) throw new Error("Conda tarball preview has warnings");
  const pkgSizes = record(tarballs.pkg_sizes, "tarball sizes");
  const pkgDirs = record(tarballs.pkgs_dirs, "tarball directories");
  if (Object.keys(pkgSizes).some((dir) => safeRoot(dir) !== root) ||
    Object.keys(pkgDirs).some((dir) => safeRoot(dir) !== root)) throw new Error("Conda tarball preview escaped pinned root");
  const sizes = pkgSizes[root] === undefined ? {} : record(pkgSizes[root], "tarball entries");
  const names = Object.keys(sizes).map(itemName);
  if (names.length > MAX_ITEMS) throw new Error("Conda tarball preview exceeds item bound");
  const listed = pkgDirs[root] === undefined ? [] : strings(pkgDirs[root], "tarball list", MAX_ITEMS).map(itemName);
  if (JSON.stringify([...names].sort()) !== JSON.stringify([...listed].sort())) {
    throw new Error("Conda tarball sizes and removal list disagree");
  }
  let tarballBytes = 0;
  for (const size of Object.values(sizes)) {
    if (!Number.isSafeInteger(size) || (size as number) < 0) throw new Error("Conda tarball preview size is invalid");
    tarballBytes += size as number;
  }
  if (!Number.isSafeInteger(tarballBytes) || tarballs.total_size !== tarballBytes) {
    throw new Error("Conda tarball total size does not match listed items");
  }
  const index = strings(record(json.index_cache, "index preview").files, "index directories", MAX_ITEMS);
  if (index.length > 1 || index.some((item) => item !== path.join(root, "cache"))) {
    throw new Error("Conda index preview escaped pinned root");
  }
  const log = strings(json.logfiles, "logfiles", MAX_ITEMS);
  if (log.some((item) => path.dirname(item) !== path.join(root, ".logs") || itemName(path.basename(item)) !== path.basename(item))) {
    throw new Error("Conda logfile preview escaped pinned root");
  }
  return {
    tarball: names.map((name) => path.join(root, name)).sort(),
    index: [...index].sort(),
    log: [...log].sort(),
    tarballBytes,
  };
}

async function quietTree(root: string, cutoff: number): Promise<void> {
  let checked = 0;
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    if (++checked > MAX_TREE_ENTRIES) throw new Error("Conda cache tree exceeds activity-check bound");
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("Conda cache tree contains a symlink");
    if (info.mtimeMs > cutoff) throw new Error("Conda cache item changed within the last 7 days");
    if (!info.isDirectory()) continue;
    for await (const entry of await opendir(current)) pending.push(path.join(current, entry.name));
  }
}

function resourceId(category: Category, root: string): string { return `${category}:${root}`; }

function parseResourceId(value: string): { category: Category; root: string } | null {
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const category = value.slice(0, separator);
  if (!(["tarball", "index", "log"] as string[]).includes(category)) return null;
  try { return { category: category as Category, root: safeRoot(value.slice(separator + 1)) }; }
  catch { return null; }
}

async function approvedCacheRoot(root: string, context: RegistryEngineContext): Promise<{ scopeRoot: string; device: number; inode: number }> {
  for (const supplied of [context.homeDir, ...(context.userRoots ?? [])]) {
    try {
      const captured = await capturePathTarget(root, supplied, "directory", false);
      return { scopeRoot: captured.scopeRoot, device: captured.device, inode: captured.inode };
    } catch {
      // Another explicitly approved user root may contain this configured cache.
    }
  }
  throw new Error("Conda package cache lies outside approved user roots or has unsafe ancestry");
}

async function categoryTarget(
  category: Category, root: string, items: readonly string[], context: RegistryEngineContext, cutoff: number,
): Promise<RegistryAdapterResourceTarget | null> {
  if (items.length === 0) return null;
  const cache = await approvedCacheRoot(root, context);
  const identities = [];
  let footprint = 0;
  for (const item of items) {
    const captured = await capturePathTarget(item, root, category === "index" ? "directory" : "file", false);
    await quietTree(item, cutoff);
    identities.push([captured.absolutePath, captured.device, captured.inode, captured.sizeBytes]);
    if (category !== "index") footprint += captured.sizeBytes ?? 0;
  }
  if (!Number.isSafeInteger(footprint)) throw new Error("Conda cache footprint exceeds safe integer range");
  const fingerprint = createHash("sha256").update(JSON.stringify({
    category, root, cache, identities,
  })).digest("hex");
  return {
    kind: "resource", ownerId: "conda-cache", resourceId: resourceId(category, root), fingerprint,
    sizeBytes: category === "index" ? null : footprint,
    evidence: [
      `Conda ${category} aggregate in exactly one package cache: ${root}`,
      `${items.length} owner-preview item(s); clean flag ${actionArgv[category][2]}`,
      "A category-wide owner action, not individual item deletion; active or symlinked environments are excluded",
    ],
  };
}

async function inventoryForRoot(
  rule: RegistryRule, root: string, context: RegistryEngineContext, options: CondaSafeCacheOptions,
): Promise<RegistryAdapterResourceTarget[]> {
  approvedRule(rule);
  const cwd = await ownerCwd(context);
  const pinnedRoot = safeRoot(root);
  await approvedCacheRoot(pinnedRoot, context);
  const info = parseInfo(await ownerJson(options.runner, infoArgv, cwd, pinnedRoot), pinnedRoot);
  await assertNoSymlinkedEnvs(info.envs);
  const preview = parsePreview(await ownerJson(options.runner, previewArgv, cwd, pinnedRoot), pinnedRoot);
  const cutoff = (options.now ?? (() => new Date()))().getTime() - QUIET_PERIOD_MS;
  if (!Number.isFinite(cutoff)) throw new Error("Conda cache quiet check has an invalid clock");
  const result: RegistryAdapterResourceTarget[] = [];
  for (const category of ["tarball", "index", "log"] as const) {
    try {
      const target = await categoryTarget(category, pinnedRoot, preview[category], context, cutoff);
      if (category === "tarball" && target && target.sizeBytes !== preview.tarballBytes) {
        throw new Error("Conda tarball size changed since the owner dry-run");
      }
      if (target) result.push(target);
    } catch {
      // A changed or unsafe item blocks its whole category, not unrelated
      // reviewed categories in the same owner cache root.
    }
  }
  return result;
}

export function createCondaSafeCacheSelectorAdapter(options: CondaSafeCacheOptions): RegistrySelectorAdapter {
  return {
    list: async (rule, context) => {
      approvedRule(rule);
      const cwd = await ownerCwd(context);
      const info = parseInfo(await ownerJson(options.runner, infoArgv, cwd));
      await assertNoSymlinkedEnvs(info.envs);
      const results: RegistryAdapterResourceTarget[] = [];
      for (const root of info.pkgsDirs) {
        try { results.push(...await inventoryForRoot(rule, root, context, options)); }
        catch { /* Unapproved or unsafe owner caches are not reviewable. */ }
      }
      return results;
    },
    lookup: async (rule, reviewed: RegistryTarget, context) => {
      if (reviewed.kind !== "resource" || reviewed.ownerId !== "conda-cache") return null;
      const identity = parseResourceId(reviewed.resourceId);
      if (!identity) return null;
      const targets = await inventoryForRoot(rule, identity.root, context, options);
      return targets.find((target) => target.resourceId === reviewed.resourceId) ?? null;
    },
  };
}

export function createCondaSafeCacheActionAdapter(options: CondaSafeCacheOptions): RegistryActionAdapter {
  const selector = createCondaSafeCacheSelectorAdapter(options);
  if (typeof selector === "function") throw new Error("Conda safe selector needs exact lookup");
  return async (rule, candidate: RegistryCandidate, context) => {
    approvedRule(rule);
    if (candidate.ruleId !== CONDA_SAFE_RULE_ID || candidate.status !== "published" || candidate.scope !== "user" ||
      candidate.tier !== "review" || candidate.action.kind !== "adapter" ||
      candidate.action.adapterId !== CONDA_SAFE_ACTION_ADAPTER_ID || candidate.target.kind !== "resource" ||
      candidate.target.ownerId !== "conda-cache") throw new Error("Conda action needs one reviewed cache aggregate");
    const identity = parseResourceId(candidate.target.resourceId);
    if (!identity) throw new Error("Conda aggregate identity is not exact");
    const live = await selector.lookup(rule, candidate.target, context);
    if (!live || live.kind !== "resource" || live.fingerprint !== candidate.target.fingerprint) {
      throw new Error("Conda cache aggregate changed since review");
    }
    const cwd = await ownerCwd(context);
    const result = await ownerJson(options.runner, actionArgv[identity.category], cwd, identity.root);
    if (result.success !== true || result.packages !== undefined || result.tempfiles !== undefined ||
      result.pkgs_dirs !== undefined) throw new Error("Conda clean returned an unreviewed result");
    const expectedResultKey = identity.category === "tarball" ? "tarballs" : identity.category === "index" ? "index_cache" : "logfiles";
    if (!Object.hasOwn(result, expectedResultKey) ||
      Object.keys(result).some((key) => key !== "success" && key !== expectedResultKey)) {
      throw new Error("Conda clean returned a different category than the reviewed action");
    }
    const emptyTarballs = { warnings: [], pkg_sizes: {}, pkgs_dirs: {}, total_size: 0 };
    const actionPreview = parsePreview({
      success: true,
      tarballs: identity.category === "tarball" ? result.tarballs : emptyTarballs,
      index_cache: identity.category === "index" ? result.index_cache : { files: [] },
      logfiles: identity.category === "log" ? result.logfiles : [],
    }, identity.root);
    if (actionPreview[identity.category].length === 0) {
      throw new Error("Conda clean did not report the reviewed category items");
    }
    const after = await selector.lookup(rule, candidate.target, context);
    if (after) throw new Error("Conda owner clear left reviewable items in the selected aggregate");
    return { reclaimedBytes: null };
  };
}

/** Structural owner binding; live owner/scope checks belong to list and lookup. */
export const condaSafeCacheOwnerVerified: RegistryValidator = async (rule, candidate) => {
  try { approvedRule(rule); }
  catch { return "Conda safe-cache owner rule changed"; }
  if (candidate.target.kind !== "resource" || candidate.target.ownerId !== "conda-cache" ||
    !parseResourceId(candidate.target.resourceId) || !/^[a-f0-9]{64}$/.test(candidate.target.fingerprint)) {
    return "Conda category aggregate lacks its exact owner identity";
  }
  return true;
};

function approvedArgv(argv: readonly string[]): "info" | "preview" | "action" | null {
  if (JSON.stringify(argv) === JSON.stringify(infoArgv)) return "info";
  if (JSON.stringify(argv) === JSON.stringify(previewArgv)) return "preview";
  return Object.values(actionArgv).some((approved) => JSON.stringify(argv) === JSON.stringify(approved)) ? "action" : null;
}

async function readBounded(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let remaining = maximum;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const kept = value.subarray(0, Math.max(0, remaining));
      text += decoder.decode(kept, { stream: true });
      remaining -= kept.byteLength;
      if (kept.byteLength < value.byteLength) truncated = true;
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  return { text, truncated };
}

/** Fixed Conda commands in one canonical cwd; never owner cleanup on the host during tests. */
export const runCondaPinnedCommand: CondaPinnedRunner = async (argv, cwd, environment) => {
  const mode = approvedArgv(argv);
  let pinnedRootApproved: boolean;
  try {
    pinnedRootApproved = !environment.CONDA_PKGS_DIRS || safeRoot(environment.CONDA_PKGS_DIRS) === environment.CONDA_PKGS_DIRS;
  } catch { pinnedRootApproved = false; }
  if (!mode || (mode !== "info" && !environment.CONDA_PKGS_DIRS) ||
    Object.keys(environment).some((key) => key !== "CONDA_PKGS_DIRS") || !pinnedRootApproved) {
    return { exitCode: 1, stdout: "", stderr: "Conda command or cache root is not code-approved" };
  }
  try {
    const ownerEnvironment = { ...process.env };
    if (environment.CONDA_PKGS_DIRS) delete ownerEnvironment.CONDA_PKGS_DIRS;
    const proc = Bun.spawn([...argv], {
      cwd, env: { ...ownerEnvironment, ...environment }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, mode === "action" ? ACTION_TIMEOUT_MS : LIST_TIMEOUT_MS);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        readBounded(proc.stdout, mode === "info" ? INFO_OUTPUT_BYTES : CLEAN_OUTPUT_BYTES),
        readBounded(proc.stderr, ERROR_OUTPUT_BYTES), proc.exited,
      ]);
      return {
        exitCode: timedOut ? 124 : exitCode, stdout: stdout.text,
        stderr: timedOut ? "Conda command timed out" : stderr.truncated ? "Conda error output was truncated" : "Conda command failed",
        truncated: stdout.truncated || stderr.truncated,
      };
    } finally { clearTimeout(timer); }
  } catch { return { exitCode: 1, stdout: "", stderr: "Conda command unavailable" }; }
};
