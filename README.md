<p align="center">
  <img src="assets/logo.png" alt="kundol logo: cyan K with a mint centre on charcoal" width="512" height="512">
</p>

<h1 align="center">kundol</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.2%2B-101820?style=flat-square" alt="Bun 1.2+">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/macOS-first-101820?style=flat-square" alt="macOS first">
  <img src="https://img.shields.io/badge/interface-CLI-36C5F0?style=flat-square" alt="CLI">
  <img src="https://img.shields.io/badge/optimise-storage-36C5F0?style=flat-square" alt="storage optimisation">
  <img src="https://img.shields.io/badge/optimise-projects-36C5F0?style=flat-square" alt="project optimisation">
  <img src="https://img.shields.io/badge/audit-SQLite-8AF0C5?style=flat-square" alt="SQLite audit">
</p>

kundol is a macOS-first CLI for developer-machine storage and generated project files. Its published rules come from [one JSON registry](registry/optimisations.json): the engine probes targets, prints a review plan, rechecks selected targets before action, then reports and audits the result. You can also browse the catalogue and request missing tools.

## Features

Read the **[help manual](https://vikz91.github.io/kundol/)** for setup, command reference, safety, troubleshooting, and architecture.

- **Storage:** published owner-tool cache rules with live checks and safe or explicit-review selection.
- **Projects/repos:** review published generated-artifact rules under a supplied workdir. Safe targets such as `node_modules` and Rust `target` can be selected after live checks; `repos` uses the same handler and does not require Git.
- **Docker context:** `optimise docker <context>` pins an explicit daemon and plans published Docker-context rules; no Docker resource rule is published yet, so it does not remove Docker data.
- **All scopes:** `optimise all` combines user storage, one explicit workdir, one named Docker context, and system rules into one plan and one selection step. The required scopes are never guessed.
- **Beta opt-in:** `--allow-beta` includes exact code-approved beta rules: Yarn Classic cache review, two Linux-only Python project reviews, and two protected Docker inventories. The other 64 beta entries remain catalogue-only and are reported individually.
- **Tool catalogue:** list published rules, search them, or view all rules by delivery status.

## Request a new tool

Missing a developer cache or generated target? Check `kundol tools list`, then run `kundol tools request` to open a prefilled GitHub request with the owning tool, exact target, owner documentation, and data risks. Run `kundol issue` for a bug or general feature report. A contributor can claim a request, scaffold a protected proposal with `bun run registry:new`, and submit a PR using the [contribution guide](docs/CONTRIBUTING.md). Merged PRs credit the author's GitHub handle in the [changelog](docs/CHANGELOG.md). A proposal does not activate cleanup.

## Install from source

On macOS, install Bun 1.2+ and Apple's Command Line Tools (`lipo` and `codesign`), then run from a cloned or downloaded checkout:

```bash
bun run register:cli
export PATH="$HOME/.local/bin:$PATH"
kundol --help
```

Every run reinstalls dependencies, builds a fresh universal macOS binary, and overwrites `~/.local/bin/kundol`. The installed binary supports Apple Silicon and Intel Macs and runs independently of Bun and the checkout. Rerun `bun run register:cli` after updating the source to replace the installed version.

The installer prints PATH guidance without editing shell files. Add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` (or your shell config) for future sessions. You can also [download a release executable](https://github.com/vikz91/kundol/releases/latest); Homebrew is coming soon. See the [installation guide](https://vikz91.github.io/kundol/getting-started.html) for details.

## Usage

```bash
kundol optimise all --workdir ~/Projects --docker-context my-context
kundol optimise all --workdir ~/Projects --docker-context my-context --allow-beta
kundol optimise storage
kundol optimise projects ~/Projects
kundol optimise projects ~/Projects --allow-beta
kundol optimise repos ~/Projects
kundol optimise docker my-context
kundol tools available
kundol tools search "pnpm"
kundol tools list --status beta
kundol tools request
kundol issue
```

Add `-f` to all, storage, projects, or repos to select only safe, force-eligible targets after planning. `--allow-beta` opts into code-approved beta rules, but never makes review or protected targets force-eligible; the user-scope beta handler supports only Yarn Classic 1.x from a selected package workspace. `optimise all` requires both `--workdir` and `--docker-context`, presents one combined plan, and refuses overlapping targets across scopes. The standalone Docker command requires a named context and has no force flag. Bare `optimise` remains help-only. The `tools` commands read bundled JSON; request and issue commands open GitHub pages. See the [usage guide](docs/usage.md) for status filters, selection, and current limits.

Generated-project cleanup requires `/usr/bin/python3` for no-follow deletion and fails without it. Large directory sizes may be shown as unknown when a complete measurement would exceed the scan limit.

First-time users can try project cleanup against disposable files with the [Docker sandbox](docs/demo/docker-sandbox.md). The container includes a `kundol` command and generated project fixtures; it does not mount host projects or a Docker socket. For owner-built npm, pnpm, Maven/JDK, Python, Go, and .NET fixtures, use the separate [real runtime seed](docs/demo/runtime-seed.md); its package restores occur only during Docker image build.

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
# Inside the container: kundol optimise projects /sandbox/projects
```

## Alternatives

| Tool | Best fit |
|---|---|
| **kundol** | Plan-based CLI cleanup for published cache and generated-file rules, with catalogue browsing and local audits. |
| [macOS Storage](https://support.apple.com/en-gb/guide/mac-help/mchl3d437fbc/mac) | Built-in space overview, file browsing, and storage recommendations. |
| [ncdu](https://dev.yorhel.nl/ncdu) | Fast terminal exploration of disk usage. |
| [Mole](https://github.com/tw93/Mole) | Broader Mac toolkit for cleanup, uninstall, disk analysis, project purge, and monitoring. |

## Development

Use `bun run dev -- --help` to run directly from source, or `bun run build:release --outfile dist/kundol` to build without installing.

`bun run check` runs tool-version, ESLint, TypeScript, registry and 75-baseline-presence checks, Bun test, bundle, and safe CLI boot checks. The stricter `bun run registry:release` blocks the 75-rule implementation PR while any baseline proposal or mapped replacement remains unpublished. `bun install` activates Husky hooks: pre-commit first checks Bun and local TypeScript against the ranges in `package.json`, then requires lint, typecheck, and bundling to pass; pre-push checks bare `kundol` and `--help` under a temporary home.

[Contributing](docs/CONTRIBUTING.md) · [Release process](docs/release.md)

## License

kundol is released under the [MIT License](LICENSE). You may use, modify, and redistribute it, including commercially, as long as you keep the copyright and license notice. The software is provided without warranty.
