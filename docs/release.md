# kundol Release Workflow

Created: 2026-09-15 11:36:31 IST
Last updated: 2026-09-15 12:07:02 IST
Related tasks: `KUN-088`, `KUN-092`

## Sequence

| Event | Result |
|---|---|
| Interactive `git commit` | [Pre-commit hook](../.husky/pre-commit) checks tools, lint, types, and build; its version prompt stages the selected major/minor/patch change in the **same commit**. `KUNDOL_VERSION_BUMP=skip` skips deliberately, and non-interactive commits do not prompt. |
| PR merged to `main` | [CI](../.github/workflows/ci.yml) runs lint, typecheck, tests, and build. The [changelog workflow](../.github/workflows/changelog.yml) adds the merged PR to [CHANGELOG.md](CHANGELOG.md) under the version from that PR's merge commit. |
| Changelog succeeds | The [release workflow](../.github/workflows/release.yml) reads that run's version, merge SHA, and notes artifact. It verifies the exact merged source, builds one universal macOS executable, tags the source as `vX.Y.Z`, and publishes the executable with release notes in GitHub Releases. |

The changelog workflow makes **one follow-up bot commit** to persist `docs/CHANGELOG.md` after a merge. The local version bump still stays inside the developer's original commit. The release tag points to the merged source commit, so a later changelog commit cannot change the binary's source.
If `vX.Y.Z` already exists, the workflow keeps that tag, executable, and release notes unchanged. A later merged PR needs a new package version to publish a new executable; its changelog entry remains in `docs/CHANGELOG.md`.

## Local build

```bash
bun install --frozen-lockfile
bun run check
bun run build:release --outfile dist/kundol-macos-universal
```

The build compiles Bun's [macOS arm64 and x64 standalone targets](https://bun.com/docs/bundler/executables), combines them with `lipo`, applies an ad hoc code signature, verifies both architecture slices, and smoke-tests welcome/help/version in a temporary home. One executable is uploaded to the release. The ad hoc signature is **not** Apple Developer ID notarization; users may see a macOS download warning until signing credentials and notarization are added.

## Repository requirements

The workflows need GitHub Actions enabled on `main`. The changelog bot needs `contents: write` and permission to push its follow-up commit to `main`; branch protection that blocks Actions pushes will stop that workflow and the automatic release. Validate live behavior after the workflows run on `main`. The PR label guides the changelog category (`breaking`, `enhancement`, `fix`, `docs`, or maintenance); unlabelled PRs are recorded as Changed.
Both changelog and release jobs queue merged-PR runs so a later queued run does not replace an earlier one.

Git's [pre-commit hook timing](https://git-scm.com/docs/githooks) is what makes one versioned commit possible. Use `KUNDOL_VERSION_BUMP=skip git commit --amend` to avoid another bump while amending. The [merged-PR event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) and [workflow-run event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run) drive the changelog and release stages.
