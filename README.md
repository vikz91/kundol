<p align="center">
  <img src="assets/logo.png" alt="kundol logo: cyan K with a mint centre on charcoal" width="128" height="128">
</p>

<h1 align="center">kundol</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Bun-1.2%2B-101820?style=flat-square" alt="Bun 1.2+">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/macOS-first-101820?style=flat-square" alt="macOS first">
  <img src="https://img.shields.io/badge/interface-CLI-36C5F0?style=flat-square" alt="CLI">
  <img src="https://img.shields.io/badge/optimise-storage-36C5F0?style=flat-square" alt="storage optimisation">
  <img src="https://img.shields.io/badge/optimise-startup-36C5F0?style=flat-square" alt="startup optimisation">
  <img src="https://img.shields.io/badge/optimise-projects-36C5F0?style=flat-square" alt="project optimisation">
  <img src="https://img.shields.io/badge/audit-SQLite-8AF0C5?style=flat-square" alt="SQLite audit">
</p>

kundol is a macOS-first CLI for developer-machine storage, startup items, and generated project files. By default, every `optimise` run scans, prints a plan, prompts before acting, then reports and audits the result.

## Features

- **Storage:** package/runtime cache maintenance, Docker system prune without volumes, and top-level temp entries at least seven days old.
- **Startup:** disable eligible user LaunchAgents without deleting their plist files.
- **Projects/repos:** remove selected generated artifacts such as `node_modules`, `dist`, and `target` under a supplied workdir. `repos` uses the same scanner; Git is not required.

## Usage

```bash
bun install
bun run dev -- optimise storage
bun run dev -- optimise startup
bun run dev -- optimise projects ~/Projects
bun run dev -- optimise repos ~/Projects
```

Add `-f` to skip the prompt after planning. Project source/data and Docker volumes are excluded from default apply; see [current scope and limits](docs/context.md).

First-time users can try every workflow against disposable files with the [Docker sandbox](docs/demo/docker-sandbox.md). The container includes a `kundol` command, fake Docker resources, and simulated macOS startup items; it does not mount host projects or a Docker socket.

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
# Inside the container: kundol optimise projects /sandbox/projects
```

## Alternatives

| Tool | Best fit |
|---|---|
| **kundol** | Plan-based CLI cleanup for storage, eligible startup agents, and generated files in a chosen workdir, with local audits. |
| [macOS Storage](https://support.apple.com/en-gb/guide/mac-help/mchl3d437fbc/mac) | Built-in space overview, file browsing, and storage recommendations. |
| [ncdu](https://dev.yorhel.nl/ncdu) | Fast terminal exploration of disk usage. |
| [Mole](https://github.com/tw93/Mole) | Broader Mac toolkit for cleanup, uninstall, disk analysis, project purge, and monitoring. |

## Development

`bun run check` runs tool-version, ESLint, TypeScript, registry, Bun test, bundle, and safe CLI boot checks. `bun install` activates Husky hooks: pre-commit first checks Bun and local TypeScript against the ranges in `package.json`, then requires lint, typecheck, and bundling to pass; pre-push checks bare `kundol` and `--help` under a temporary home.

[Contributing](docs/CONTRIBUTING.md) · [Changelog](docs/CHANGELOG.md) · [Release process](docs/release.md)
