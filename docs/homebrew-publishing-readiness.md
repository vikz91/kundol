# Homebrew Publishing Readiness

Created: 2026-09-15 12:30:48 IST
Last updated: 2026-09-15 16:12:23 IST
Related tasks: `KUN-088`, `KUN-095`, `KUN-101`, `KUN-102`, `KUN-103`

## Route and release snapshot

Publish `kundol` first through an upstream tap, `vikz91/homebrew-kundol`, with a source-building `Formula/kundol.rb`. The user-facing command will be `brew install vikz91/kundol/kundol`. Homebrew maps `vikz91/kundol` to the GitHub repository with the `homebrew-` prefix; a fully qualified install adds the tap and trusts only this formula. See the [tap guide](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap) and [tap trust guide](https://docs.brew.sh/Tap-Trust).

The formula should use a tagged source archive, the committed `bun.lock`, Bun as a build dependency, and a compiled native executable. The existing universal binary remains a separate GitHub Release artifact. An official `homebrew/core` formula is a later goal with additional release, licence, build, maintenance, and public-interest requirements. See [Acceptable Formulae](https://docs.brew.sh/Acceptable-Formulae) and the [Package Acceptance Policy](https://docs.brew.sh/Package-Acceptance-Policy).

**Verified snapshot (2026-09-15 16:02 IST):** GitHub had published [v0.3.0](https://github.com/vikz91/kundol/releases/tag/v0.3.0) and [v0.3.1](https://github.com/vikz91/kundol/releases/tag/v0.3.1), with a universal macOS executable on `v0.3.1`; it detected the repository's MIT licence. [PR #2](https://github.com/vikz91/kundol/pull/2) had merged and the [release repair succeeded in live runs](https://github.com/vikz91/kundol/actions/runs/34946418525). `main` declared `0.3.1`. This checkout declared `0.4.0` in then-open [PR #5](https://github.com/vikz91/kundol/pull/5), which removes startup and hardens project cleanup. No public `vikz91/homebrew-kundol` tap or formula was found at that time. Recheck live tags, PR status, and tap availability before pinning a formula. Choose an immutable released tag after deciding whether to ship the older `0.3.1` CLI or the storage-only `0.4.0` CLI once released. The PR #5 cleanup path needs `/usr/bin/python3` with descriptor-relative operations on a clean Mac; its selected generated-path action fails closed when the helper is unavailable.

## Readiness checklist

Checked items reflect the dated snapshot above. Re-verify them against the chosen release before publishing a formula.

### Upstream source and release

- [x] A public GitHub repository, named CLI, and README explaining the implemented commands exist **live on GitHub**.
- [x] `main` declares `0.3.1` and `MIT`; GitHub detects the root `LICENSE`, and the current PR branch declares `0.4.0` while it remains open.
- [x] `bun.lock` is tracked, and the CLI has local `--version`/`--help` smoke checks.
- [x] Earlier clean source and universal arm64/x64 build checks passed locally; PR #5 also passed a universal executable cleanup smoke in a disposable home/workdir.
- [x] The changelog, release, and merged-PR workflows produced [v0.3.0](https://github.com/vikz91/kundol/releases/tag/v0.3.0) and [v0.3.1](https://github.com/vikz91/kundol/releases/tag/v0.3.1) **live on GitHub**. PR #5's [pre-merge check](https://github.com/vikz91/kundol/actions/runs/34957413639) passed.
- [x] The MIT licence and README summary are on `main`; GitHub reports `MIT`.
- [x] [PR #2](https://github.com/vikz91/kundol/pull/2) added explicit repository selection to `gh run download`; later release runs completed successfully.
- [x] GitHub Actions pushed changelog updates and `v0.3.0`/`v0.3.1` tags in live merged-PR runs.
- [ ] If the formula should expose only the engine-backed storage CLI, merge PR #5 and verify its `v0.4.0` tag, source, notes, executable, and reported version before pinning the formula. A manual tag push does not trigger the [release workflow](release.md).
- [ ] If packaging `0.4.0`, validate `/usr/bin/python3`, `os.supports_dir_fd`, and generated-project cleanup on clean Apple Silicon and Intel Macs. Decide how to supply the helper if Apple's developer tools are absent; merely adding Homebrew Python elsewhere on `PATH` will not satisfy that CLI's absolute helper path.
- [ ] Review third-party licence notices for distributed standalone binaries. Bun embeds its runtime and documents LGPL-licensed linked components, so kundol's MIT licence alone does not describe every part of that artifact. See [Bun's licence documentation](https://github.com/oven-sh/bun/blob/main/docs/project/license.mdx).

### Formula and tap

- [ ] Create the public `vikz91/homebrew-kundol` repository and a tap with `Formula/kundol.rb`. Homebrew recommends `brew tap-new` for the initial layout. See [creating a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#creating-a-tap).
- [ ] Pin the formula to the stable tag's source archive with its exact SHA-256. Use the project homepage, `license "MIT"`, and a description matching the current CLI. Avoid a moving branch or an unchecked download. See the [Formula Cookbook](https://docs.brew.sh/Formula-Cookbook).
- [ ] Declare macOS support and `bun` as a build dependency. Compile for the installing Mac so users need no Bun runtime after installation. Validate on both Apple Silicon and Intel Macs.
- [ ] Fetch the locked production dependencies during Homebrew's network-enabled `fetch` phase; compile and install in its network-disabled `install` phase. Keep Bun's cache and packages inside the build area, away from the user's global environment. The local frozen build passed; **Homebrew sandbox behavior is still untested**. See [fetching dependencies before building](https://docs.brew.sh/Formula-Cookbook#fetching-dependencies-before-building) and [language-specific requirements](https://docs.brew.sh/Language-Specific-Formulae).
- [ ] Install the executable as `bin/kundol`. Add a formula test that creates a disposable project marker in `testpath`, runs `optimise projects <testpath> -f` with **zero cleanup candidates**, and asserts the installed command's plan and version. If packaging `0.4.0`, separately test one aged generated target on both Mac architectures with a temporary home; that apply smoke verifies the Python helper without touching real projects. Homebrew sets `HOME` to `testpath` for formula tests. See [formula testing](https://docs.brew.sh/Formula-Cookbook#add-a-test-to-the-formula).
- [ ] Run a clean source install, `brew test`, `brew audit --strict --online --formula`, and `brew style --formula` against the tap formula. Repeat source install and functional testing in tap CI for both Mac architectures before publishing. See [tap testing advice](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#best-practices).
- [ ] Decide whether to publish Homebrew bottles after the source formula works. They shorten installs but add a separate build/publish pipeline; the tap guide describes generated GitHub workflows.

### Publication and upkeep

- [ ] Push the reviewed formula and tap README, then verify a fresh install with `brew install vikz91/kundol/kundol`. This fully qualified command trusts only the formula under current tap trust rules.
- [ ] Check `kundol --version`, `kundol --help`, a disposable project scan, `brew upgrade`, and `brew uninstall` on a fresh Mac. Keep real workspaces out of install validation.
- [ ] Add the tested Homebrew install command and tap link to the main README. Explain that `brew update` discovers tap changes and `brew upgrade` installs formula updates. See [maintaining a tap](https://docs.brew.sh/How-to-Create-and-Maintain-a-Tap#maintaining-a-tap).
- [ ] For each future upstream release, update the formula's immutable tag URL and SHA-256, rerun audit/style/install/test, and publish the tap change. Never point a published formula at a mutable `latest` asset or move an existing release tag.

## Publishing sequence

1. Choose a shipped CLI: existing `v0.3.1` or the planned storage-only `v0.4.0` after PR #5 merges and its release succeeds. Verify the chosen tag, source commit, changelog entry, and executable. For `v0.4.0`, check the secure Python helper on clean Macs before promising generated-project cleanup through Homebrew.
2. Create `vikz91/homebrew-kundol` with `brew tap-new vikz91/kundol`. Add a formula that downloads the chosen immutable tag's source archive and records its SHA-256. Prototype Bun's `fetch`/`install` behavior in Homebrew's sandbox before relying on local clean-build results.
3. Run source install, functional test, audit, and style checks on both Mac architectures. Inspect the installed command and a scan against disposable files.
4. Push the tap and document `brew install vikz91/kundol/kundol` after a fresh install succeeds. Maintain the formula as each `vX.Y.Z` release appears.

## Later: official Homebrew repository

- [ ] Recheck [official formula requirements](https://docs.brew.sh/Acceptable-Formulae) before a `homebrew/core` proposal: public tag, MIT licence, source build without downstream-only patches, dependency handling, and supported CI matrix must pass.
- [ ] Recheck the current [acceptance policy](https://docs.brew.sh/Package-Acceptance-Policy) and repository interest when considering an official `homebrew/core` submission; popularity and policy can change after this snapshot.
- [ ] When eligible, test a new formula with `brew audit --new --formula` and Homebrew's required build/test jobs, then submit a PR to `homebrew/core`. Keep the upstream tap maintained until an official package is available.

## Alternative artifact route

A cask could install the published universal binary, but the current release builder applies only an ad hoc signature. The local artifact passed `codesign --verify` and was rejected by macOS Gatekeeper assessment. Homebrew quarantines cask downloads, so a smooth prebuilt-binary path needs Developer ID signing and notarization, a versioned checksummed archive, and a tested cask `binary` stanza. See [Homebrew's cask security model](https://github.com/Homebrew/brew/blob/main/docs/Homebrew-Security-and-Supply-Chain.md) and [Apple's Developer ID guidance](https://developer.apple.com/developer-id/).
