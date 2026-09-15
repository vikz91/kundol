import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { categoryFor, parseMergedPullRequest, releaseNotesForVersion, updateChangelog, versionAtMergeCommit } from "../../scripts/update-changelog.ts";

const pr = {
  number: 42,
  title: "Fix startup scan",
  url: "https://github.com/example/kundol/pull/42",
  mergedAt: "2026-09-15T04:30:00Z",
  mergeCommitSha: "a".repeat(40),
  labels: ["fix"],
  authorLogin: "dev-contributor",
};

describe("merged PR changelog", () => {
  test("accepts a merged PR and rejects a closed but unmerged PR", () => {
    const event = {
      pull_request: {
        merged: true,
        number: pr.number,
        title: pr.title,
        html_url: pr.url,
        merged_at: pr.mergedAt,
        merge_commit_sha: pr.mergeCommitSha,
        labels: [{ name: "Fix" }],
        user: { login: pr.authorLogin },
      },
    };
    expect(parseMergedPullRequest(event)).toEqual(pr);
    expect(() => parseMergedPullRequest({ pull_request: { ...event.pull_request, merged: false } })).toThrow("not merged");
    expect(() => parseMergedPullRequest({ pull_request: { ...event.pull_request, user: null } })).toThrow("author login");
  });

  test("classifies release notes from labels", () => {
    expect(categoryFor(["breaking", "fix"])).toBe("Breaking");
    expect(categoryFor(["enhancement"])).toBe("Added");
    expect(categoryFor(["registry", "enhancement"])).toBe("Registry");
    expect(categoryFor(["docs"])).toBe("Documentation");
    expect(categoryFor([])).toBe("Changed");
  });

  test("adds a release-ready version section once", () => {
    const initial = "# Changelog\n\nChanges are recorded after merged PRs.\n";
    const changed = updateChangelog(initial, "0.1.1", pr);
    expect(changed).toContain("## v0.1.1 (2026-09-15)\n\n### Fixed\n- Fix startup scan ([#42](https://github.com/example/kundol/pull/42)) — [@dev-contributor](https://github.com/dev-contributor) <!-- pr:42 -->");
    expect(releaseNotesForVersion(changed, "0.1.1")).toBe("### Fixed\n- Fix startup scan ([#42](https://github.com/example/kundol/pull/42)) — [@dev-contributor](https://github.com/dev-contributor) <!-- pr:42 -->\n");
    expect(updateChangelog(changed, "0.1.1", pr)).toBe(changed);
  });

  test("keeps separate version sections and escapes untrusted PR titles", () => {
    const first = updateChangelog("# Changelog\n", "0.1.1", pr);
    const second = updateChangelog(first, "0.2.0", { ...pr, number: 43, url: "https://github.com/example/kundol/pull/43", title: "Add <cache> [mode]\nfor projects", labels: ["feature"] });
    expect(second.indexOf("## v0.2.0")).toBeLessThan(second.indexOf("## v0.1.1"));
    expect(releaseNotesForVersion(second, "0.2.0")).toContain("Add \\<cache\\> \\[mode\\] for projects");
    expect(releaseNotesForVersion(second, "0.1.1")).not.toContain("#43");
  });

  test("credits the PR author, including bracketed bot logins, without treating the merger as author", () => {
    const changed = updateChangelog("# Changelog\n", "0.1.1", { ...pr, authorLogin: "dependabot[bot]", labels: ["registry"] });
    expect(changed).toContain("### Registry");
    expect(changed).toContain("[@dependabot\\[bot\\]](https://github.com/dependabot%5Bbot%5D)");
  });

  test("adds another PR to the existing version section without duplicating headings", () => {
    const first = updateChangelog("# Changelog\n", "0.1.1", pr);
    const second = updateChangelog(first, "0.1.1", { ...pr, number: 43, url: "https://github.com/example/kundol/pull/43", title: "Document cleanup", labels: ["docs"] });
    expect(second.match(/^## v0\.1\.1/mg)).toHaveLength(1);
    expect(releaseNotesForVersion(second, "0.1.1")).toContain("### Documentation\n- Document cleanup");
    expect(releaseNotesForVersion(second, "0.1.1")).toContain("### Fixed\n- Fix startup scan");
  });
});

const tempRepos: string[] = [];
afterEach(async () => {
  await Promise.all(tempRepos.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("reads the version at the merge commit even if main has a newer version", async () => {
  const root = await mkdtemp(join(tmpdir(), "kundol-changelog-"));
  tempRepos.push(root);
  const runGit = (...args: string[]) => {
    const result = Bun.spawnSync(["git", "-C", root, ...args]);
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  runGit("init", "-q");
  await writeFile(join(root, "package.json"), '{"version":"0.1.1"}\n');
  runGit("add", "package.json");
  runGit("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "first");
  const firstSha = runGit("rev-parse", "HEAD");
  await writeFile(join(root, "package.json"), '{"version":"0.2.0"}\n');
  runGit("add", "package.json");
  runGit("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "second");
  expect(await versionAtMergeCommit(firstSha, root)).toBe("0.1.1");
});
