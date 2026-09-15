import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface MergedPullRequest {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  mergeCommitSha: string;
  labels: string[];
  authorLogin: string;
}

type Category = "Breaking" | "Registry" | "Added" | "Changed" | "Fixed" | "Documentation" | "Maintenance";

export function parseMergedPullRequest(event: unknown): MergedPullRequest {
  if (!event || typeof event !== "object" || !("pull_request" in event)) throw new Error("Missing pull_request event");
  const pr = event.pull_request;
  if (!pr || typeof pr !== "object") throw new Error("Missing pull_request payload");
  const record = pr as Record<string, unknown>;
  if (record.merged !== true) throw new Error("The pull request was not merged");
  if (!Number.isSafeInteger(record.number) || (record.number as number) < 1) throw new Error("Invalid pull request number");
  if (typeof record.title !== "string" || !record.title.trim()) throw new Error("Invalid pull request title");
  if (typeof record.html_url !== "string") throw new Error("Missing pull request URL");
  const url = new URL(record.html_url);
  if (url.protocol !== "https:" || url.username || url.password || !url.pathname.endsWith(`/pull/${record.number}`)) {
    throw new Error("Invalid pull request URL");
  }
  if (typeof record.merged_at !== "string" || Number.isNaN(Date.parse(record.merged_at))) {
    throw new Error("Invalid merge date");
  }
  if (typeof record.merge_commit_sha !== "string" || !/^[a-f0-9]{40}$/i.test(record.merge_commit_sha)) {
    throw new Error("Invalid merge commit SHA");
  }
  const user = record.user;
  if (!user || typeof user !== "object" || !("login" in user) || typeof user.login !== "string" || !user.login.trim() || user.login.length > 80) {
    throw new Error("Missing or invalid pull request author login");
  }
  const labels = Array.isArray(record.labels)
    ? record.labels.flatMap((label) => {
        if (!label || typeof label !== "object" || !("name" in label) || typeof label.name !== "string") return [];
        return [label.name.toLowerCase()];
      })
    : [];
  return {
    number: record.number as number,
    title: record.title,
    url: url.href,
    mergedAt: record.merged_at,
    mergeCommitSha: record.merge_commit_sha,
    labels,
    authorLogin: user.login.trim(),
  };
}

export function categoryFor(labels: string[]): Category {
  const has = (...names: string[]) => labels.some((label) => names.includes(label.toLowerCase()));
  if (has("breaking", "breaking-change", "breaking change")) return "Breaking";
  if (has("registry", "registry-entry")) return "Registry";
  if (has("feature", "enhancement", "added")) return "Added";
  if (has("fix", "bug", "bugfix")) return "Fixed";
  if (has("documentation", "docs")) return "Documentation";
  if (has("chore", "maintenance", "dependencies")) return "Maintenance";
  return "Changed";
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().replace(/[\\`*_<>]/g, "\\$&").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

export function updateChangelog(current: string, version: string, pr: MergedPullRequest): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Invalid package version");
  const marker = `<!-- pr:${pr.number} -->`;
  if (current.includes(marker)) return current;
  const date = new Date(pr.mergedAt).toISOString().slice(0, 10);
  const heading = `## v${version} (${date})`;
  const category = categoryFor(pr.labels);
  const credit = `[@${escapeMarkdown(pr.authorLogin)}](https://github.com/${encodeURIComponent(pr.authorLogin)})`;
  const bullet = `- ${escapeMarkdown(pr.title)} ([#${pr.number}](${pr.url})) — ${credit} ${marker}`;
  const initial = current.trim() ? current.replace(/\r\n/g, "\n").trimEnd() + "\n" : "# Changelog\n";
  if (!initial.startsWith("# Changelog\n")) throw new Error("Changelog must start with # Changelog");

  const headings = [...initial.matchAll(/^## v([^\s]+) \(\d{4}-\d{2}-\d{2}\)$/gm)];
  const found = headings.find((match) => match[1] === version);
  if (!found || found.index === undefined) {
    const firstVersion = initial.search(/^## /m);
    const insertion = firstVersion < 0 ? initial.length : firstVersion;
    const before = initial.slice(0, insertion).trimEnd();
    const after = initial.slice(insertion).trimStart();
    return `${before}\n\n${heading}\n\n### ${category}\n${bullet}\n${after ? `\n${after}` : ""}`;
  }

  const start = found.index;
  const nextHeading = initial.indexOf("\n## ", start + heading.length);
  const end = nextHeading < 0 ? initial.length : nextHeading + 1;
  const section = initial.slice(start, end).trimEnd();
  const rest = initial.slice(end).trimStart();
  const subheading = `### ${category}`;
  const categoryAt = section.indexOf(`\n${subheading}\n`);
  let changed: string;
  if (categoryAt >= 0) {
    const insertion = categoryAt + subheading.length + 2;
    changed = `${section.slice(0, insertion)}${bullet}\n${section.slice(insertion).trimStart()}`.trimEnd();
  } else {
    const insertion = section.indexOf("\n### ");
    if (insertion >= 0) changed = `${section.slice(0, insertion).trimEnd()}\n\n${subheading}\n${bullet}\n\n${section.slice(insertion).trimStart()}`.trimEnd();
    else changed = `${section}\n\n${subheading}\n${bullet}`;
  }
  return `${initial.slice(0, start)}${changed}\n${rest ? `\n${rest}` : ""}`;
}

export function releaseNotesForVersion(changelog: string, version: string): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Invalid package version");
  const headings = [...changelog.matchAll(/^## v([^\s]+) \(\d{4}-\d{2}-\d{2}\)$/gm)];
  const heading = headings.find((match) => match[1] === version);
  if (!heading || heading.index === undefined) throw new Error(`Missing changelog section for v${version}`);
  const start = heading.index + heading[0].length;
  const nextHeading = changelog.indexOf("\n## ", start);
  const notes = changelog.slice(start, nextHeading < 0 ? changelog.length : nextHeading).trim();
  if (!notes) throw new Error(`Empty changelog section for v${version}`);
  return `${notes}\n`;
}

export async function versionAtMergeCommit(sha: string, cwd = process.cwd()): Promise<string> {
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("Invalid merge commit SHA");
  const process = Bun.spawn(["git", "show", `${sha}:package.json`], { cwd, stdout: "pipe", stderr: "pipe" });
  const [output, error, status] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (status !== 0) throw new Error(`Cannot read package.json at merge commit: ${error.trim()}`);
  const packageJson = JSON.parse(output) as { version?: unknown };
  if (typeof packageJson.version !== "string") throw new Error("Missing package version at merge commit");
  return packageJson.version;
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");
  const pr = parseMergedPullRequest(JSON.parse(await readFile(eventPath, "utf8")));
  const version = await versionAtMergeCommit(pr.mergeCommitSha);
  const changelogPath = join(process.cwd(), "docs", "CHANGELOG.md");
  const current = await readFile(changelogPath, "utf8");
  const changed = updateChangelog(current, version, pr);
  if (changed !== current) await writeFile(changelogPath, changed);
  const metadataDir = process.env.RELEASE_METADATA_DIR;
  if (metadataDir) {
    await mkdir(metadataDir, { recursive: true });
    await writeFile(join(metadataDir, "release-metadata.json"), `${JSON.stringify({
      version,
      mergeSha: pr.mergeCommitSha,
      releaseNotes: releaseNotesForVersion(changed, version),
    }, null, 2)}\n`);
  }
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `version=${version}\n`, { flag: "a" });
  console.log(changed === current ? `PR #${pr.number} is already in the changelog.` : `Added PR #${pr.number} to v${version} changelog.`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
