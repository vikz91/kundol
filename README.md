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

- **Storage:** published owner-tool cache rules with live checks and safe or explicit-review selection.
- **Projects/repos:** review published generated-artifact rules under a supplied workdir. Safe targets such as `node_modules` and Rust `target` can be selected after live checks; `repos` uses the same handler and does not require Git.
- **Tool catalogue:** list published rules, search them, or view all rules by delivery status.

## Request a new tool

Missing a developer cache or generated target? Check `kundol tools list`, then run `kundol tools request` to open a prefilled GitHub request with the owning tool, exact target, owner documentation, and data risks. Run `kundol issue` for a bug or general feature report. A contributor can claim a request, scaffold a protected proposal with `bun run registry:new`, and submit a PR using the [contribution guide](docs/CONTRIBUTING.md). Merged PRs credit the author's GitHub handle in the [changelog](docs/CHANGELOG.md). A proposal does not activate cleanup.

## Usage

```bash
bun install
bun run dev -- optimise storage
bun run dev -- optimise projects ~/Projects
bun run dev -- optimise repos ~/Projects
bun run dev -- tools available
bun run dev -- tools search "pnpm"
bun run dev -- tools list --status proposed
bun run dev -- tools request
bun run dev -- issue
```

Add `-f` to an `optimise` command to select only safe, force-eligible targets after planning. The `tools` commands read bundled JSON; request and issue commands open GitHub pages. See the [usage guide](docs/usage.md) for status filters, selection, and current limits.

First-time users can try project cleanup against disposable files with the [Docker sandbox](docs/demo/docker-sandbox.md). The container includes a `kundol` command and generated project fixtures; it does not mount host projects or a Docker socket.

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

`bun run check` runs tool-version, ESLint, TypeScript, registry, Bun test, bundle, and safe CLI boot checks. `bun install` activates Husky hooks: pre-commit first checks Bun and local TypeScript against the ranges in `package.json`, then requires lint, typecheck, and bundling to pass; pre-push checks bare `kundol` and `--help` under a temporary home.

[Contributing](docs/CONTRIBUTING.md) · [Release process](docs/release.md)

## License

kundol is released under the [MIT License](LICENSE). You may use, modify, and redistribute it, including commercially, as long as you keep the copyright and license notice. The software is provided without warranty.
