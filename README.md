<p align="center">
  <img src="assets/logo.png" alt="kundol logo" width="128" height="128">
</p>

<h1 align="center">kundol</h1>

kundol is a Bun + TypeScript CLI for reclaiming developer-machine disk space without touching source code.

Every optimise run scans first, prints an actionable cleanup plan, asks for confirmation, performs the cleanup, prints a final report, and writes audit records. Use `-f` to skip the confirmation prompt after scanning.

## Quickstart

```bash
bun install
bun run dev
bun run dev -- optimise storage
bun run dev -- optimise startup
bun run dev -- optimise projects ~/Projects
bun run dev -- optimise repos ~/Projects
```

Automation mode:

```bash
bun run dev -- optimise storage -f
bun run dev -- optimise startup -f
bun run dev -- optimise projects ~/Projects -f
```

## Commands

- `kundol`: print the ASCII welcome banner and examples.
- `kundol optimise storage`: clean machine-level targets such as package caches, Docker build/cache resources without volumes, and old temp entries.
- `kundol optimise startup`: list startup entries and disable user startup items.
- `kundol optimise projects <workdir>`: scan nested projects to depth 7 and remove safe project-local generated artifacts such as `node_modules`, build outputs, caches, `target`, `bin`, and `obj`.
- `kundol optimise repos <workdir>`: repo-scoped entrypoint for the same generated-artifact cleanup flow.

Each optimise command exposes exactly one option:

```bash
-f, --force
```

There is no dashboard/TUI and no `--dry-run`, `--apply`, `--no-dry-run`, `--json`, or `--max-depth` flag.

## Safety

kundol never automatically removes project roots, `.git`, `.env*`, databases, uploads, media, assets, migrations, or source files. Docker volumes are protected from default storage optimisation.

Audit logs are written under `$HOME/.kundol/sessions/`, and durable action records are stored in SQLite at `$HOME/.kundol/kundol.db`.

## Development

```bash
bun run check
```
