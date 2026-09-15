# Homebrew Publishing Readiness

Created: 2026-09-15 12:30:48 IST

Related tasks: `KUN-088`, `KUN-095`

## Route and current gate

Publish `kundol` first through an upstream tap, `vikz91/homebrew-kundol`, with a source-building `Formula/kundol.rb`. The user-facing command will be `brew install vikz91/kundol/kundol`. Homebrew maps `vikz91/kundol` to the GitHub repository with the `homebrew-` prefix; a fully qualified install adds the tap and trusts only this formula. See the [tap guide](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) and [tap trust guide](https://docs.brew.sh/Tap-Trust).

The formula should use a tagged source archive, the committed `bun.lock`, Bun as a build dependency, and a compiled native executable. The existing universal binary remains a separate GitHub Release artifact. An official `homebrew/core` formula is a later goal with additional release, licence, build, maintenance, and public-interest requirements. See [Acceptable Formulae](https://docs.brew.sh/Acceptable-Formulae) and the [Package Acceptance Policy](https://docs.brew.sh/Package-Acceptance-Policy).

**Current gate:** the public repository has no tag or GitHub Release, and no tap or formula exists. The first [Release macOS executable run](https://github.com/vikz91/kundol/actions/runs/34938510725) failed before checkout: `gh run download` could not infer a repository. A repair is prepared in [draft PR #2](https://github.com/vikz91/kundol/pull/2); live validation still needs a new run after merge. The MIT files are present in this working tree, while GitHub still reports no repository licence. Checked items below are *locally prepared* unless they explicitly say *live on GitHub*.

## Readiness checklist

### Upstream source and release

- [x] A public GitHub repository, named CLI, and README explaining the implemented commands exist **live on GitHub**.
- [x] `package.json` declares version `0.2.2` and `MIT`; the root `LICENSE` and README licence summary/link exist **in this working tree**.
- [x] `bun.lock` is tracked, and the CLI has local `--version`/`--help` smoke checks.
- [x] A clean source copy installed production dependencies with `bun install --production --frozen-lockfile --ignore-scripts`, compiled with `bun build --compile`, and reported `0.2.2` **locally**.
- [x] The local universal macOS build passed arm64/x64, code-signature, welcome/help/version checks **locally**.
- [x] Merged-PR CI and changelog workflows exist; their first observed runs passed **live on GitHub**.
- [ ] Merge and push the MIT licence, README summary, and package metadata; confirm GitHub detects `MIT` from the public default branch.
- [ ] Merge the [prepared release repair](https://github.com/vikz91/kundol/pull/2), which adds `-R "$GITHUB_REPOSITORY"` to `gh run download`, then validate a newly triggered run. The [GitHub CLI](https://cli.github.com/manual/gh_run_download) supports `-R` for explicit repository selection.
- [ ] Confirm GitHub Actions can push the changelog commit to `main` and create `v*` tags under the actual repository rules. The workflow declares `contents: write`; live tag-push behavior is still unproved.
- [ ] Produce one successful stable `vX.Y.Z` tag and GitHub Release through the [merged-PR release workflow](release.md). Verify the tag's commit, release notes, uploaded executable, and reported version. A manual tag push does not trigger that workflow.
- [ ] Review third-party licence notices for distributed standalone binaries. Bun embeds its runtime and documents LGPL-licensed linked components, so kundol's MIT licence alone does not describe every part of that artifact. See [Bun's licence documentation](https://github.com/oven-sh/bun/blob/main/docs/project/license.mdx).

### Formula and tap

- [ ] Create the public `vikz91/homebrew-kundol` repository and a tap with `Formula/kundol.rb`. Homebrew recommends `brew tap-new` for the initial layout. See [creating a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#creating-a-tap).
- [ ] Pin the formula to the stable tag's source archive with its exact SHA-256. Use the project homepage, `license "MIT"`, and a description matching the current CLI. Avoid a moving branch or an unchecked download. See the [Formula Cookbook](https://docs.brew.sh/Formula-Cookbook).
- [ ] Declare macOS support and `bun` as a build dependency. Compile for the installing Mac so users need no Bun runtime after installation. Validate on both Apple Silicon and Intel Macs.
- [ ] Fetch the locked production dependencies during Homebrew's network-enabled `fetch` phase; compile and install in its network-disabled `install` phase. Keep Bun's cache and packages inside the build area, away from the user's global environment. The local frozen build passed; **Homebrew sandbox behavior is still untested**. See [fetching dependencies before building](https://docs.brew.sh/Formula-Cookbook#fetching-dependencies-before-building) and [language-specific requirements](https://docs.brew.sh/Language-Specific-Formulae).
- [ ] Install the executable as `bin/kundol`. Add a functional formula test that creates a disposable project marker in `testpath`, runs `optimise projects <testpath> -f` with **zero cleanup candidates**, and asserts the installed command's plan/report and version. Homebrew sets `HOME` to `testpath` for tests. See [formula testing](https://docs.brew.sh/Formula-Cookbook#add-a-test-to-the-formula).
- [ ] Run a clean source install, `brew test`, `brew audit --strict --online --formula`, and `brew style --formula` against the tap formula. Repeat source install and functional testing in tap CI for both Mac architectures before publishing. See [tap testing advice](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#best-practices).
- [ ] Decide whether to publish Homebrew bottles after the source formula works. They shorten installs but add a separate build/publish pipeline; the tap guide describes generated GitHub workflows.

### Publication and upkeep

- [ ] Push the reviewed formula and tap README, then verify a fresh install with `brew install vikz91/kundol/kundol`. This fully qualified command trusts only the formula under current tap trust rules.
- [ ] Check `kundol --version`, `kundol --help`, a disposable project scan, `brew upgrade`, and `brew uninstall` on a fresh Mac. Keep real workspaces out of install validation.
- [ ] Add the tested Homebrew install command and tap link to the main README. Explain that `brew update` discovers tap changes and `brew upgrade` installs formula updates. See [maintaining a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#maintaining-a-tap).
- [ ] For each future upstream release, update the formula's immutable tag URL and SHA-256, rerun audit/style/install/test, and publish the tap change. Never point a published formula at a mutable `latest` asset or move an existing release tag.

## Publishing sequence

1. Land the MIT files and release-workflow repair on `main` through the normal PR path. Monitor **Update changelog**, then **Release macOS executable**. The current main version is `0.2.2` but has no release; select the release version consistently with `package.json` and the workflow's version rules.
2. After a stable tag exists, create `vikz91/homebrew-kundol` with `brew tap-new vikz91/kundol`. Add a formula that downloads that tag's source archive and records its SHA-256. Prototype Bun's `fetch`/`install` behavior in Homebrew's sandbox before relying on the local clean-build result.
3. Run source install, functional test, audit, and style checks on both Mac architectures. Inspect the installed command and a scan against disposable files.
4. Push the tap and document `brew install vikz91/kundol/kundol` after a fresh install succeeds. Maintain the formula as each `vX.Y.Z` release appears.

## Later: official Homebrew repository

- [ ] Recheck [official formula requirements](https://docs.brew.sh/Acceptable-Formulae) before a `homebrew/core` proposal: public tag, MIT licence, source build without downstream-only patches, dependency handling, and supported CI matrix must pass.
- [ ] Establish the public presence required by the [acceptance policy](https://docs.brew.sh/Package-Acceptance-Policy). As of this page's date the repo is less than 30 days old and has no stars or forks; the normal owner self-submission threshold is 90 forks, 90 watchers, or 225 stars, subject to documented exceptions.
- [ ] When eligible, test a new formula with `brew audit --new --formula` and Homebrew's required build/test jobs, then submit a PR to `homebrew/core`. Keep the upstream tap maintained until an official package is available.

## Alternative artifact route

A cask could install the published universal binary, but the current release builder applies only an ad hoc signature. The local artifact passed `codesign --verify` and was rejected by macOS Gatekeeper assessment. Homebrew quarantines cask downloads, so a smooth prebuilt-binary path needs Developer ID signing and notarization, a versioned checksummed archive, and a tested cask `binary` stanza. See [Homebrew's cask security model](https://github.com/Homebrew/brew/blob/main/docs/Homebrew-Security-and-Supply-Chain.md) and [Apple's Developer ID guidance](https://developer.apple.com/developer-id/).
