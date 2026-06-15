<p align="center">
  <img src="assets/logo.png" alt="kundol logo" width="128" height="128">
</p>

<h1 align="center">kundol</h1>

kundol is a Bun + TypeScript CLI/TUI for indexing developer workspaces, identifying local projects across runtimes, auditing local toolchains, and safely previewing generated-file cleanup.

kundol is local-first. Configuration and project metadata live in SQLite at `$HOME/.kundol/kundol.db`. Cleanup defaults to dry-run, and automatic cleanup is limited to safe generated artifacts.

Each run also writes a plain text audit session log under `$HOME/.kundol/sessions/`.
Lines are formatted as `timestamp : device-name : action : project-name`.

## Quickstart

```bash
bun install
bun run dev -- --workspace ~/Projects
bun run dev -- dashboard
bun run dev -- list
bun run dev -- list --scanned --search api
bun run dev -- scan my-project --largest
bun run dev -- clean my-project
```

The explicit setup command also works:

```bash
bun run dev -- init --workspace ~/Projects
```

`clean` without `--apply` is a dry run and prints the exact apply command. To execute safe generated-file cleanup:

```bash
bun run dev -- clean my-project --apply --no-dry-run
```

When a project folder has not been opened/modified for more than the configured archive threshold, `clean --apply --no-dry-run` first writes a local archive to `$HOME/.kundol/archives`.
The threshold defaults to 15 days and can be changed with:

```bash
bun run dev -- config --archive-before-clean-days 21
```

## Commands

- `kundol init --workspace <path>`: create the local DB/config and optionally run the first index.
- `kundol --workspace <path>`: first-run shortcut for `init --workspace <path>`.
- `kundol index`: index configured workspaces and update registry metadata.
- `kundol dashboard`: show project counts, size, cleanable bytes, and top space consumers.
- `kundol list`: list projects with filters such as `--status`, `--runtime`, `--search`, `--scanned`, `--sort`, and `--json`.
- `kundol show <project>`: show one indexed project by id, name, or path.
- `kundol scan <project>`: inspect cleanup candidates, persist scan metadata, and show recommendations.
- `kundol clean <project>`: dry-run or apply safe generated-file cleanup.
- `kundol runtimes`: show local runtime/toolchain versions and missing tools.
- `kundol config`: show saved workspaces, excluded paths, and cleanup/archive settings.

Dashboard parity: run `bun run dev` in an interactive terminal. Use `/` to search projects, `t` for scanned-only, `o` to cycle sort, `u` to preview optimize storage, `y` to apply selected safe optimize cleanup after preview, `s` to scan, `c` for cleanup dry-run, `r` for runtimes, and `g` for config. The dashboard shows matching CLI commands for server-friendly and JSON workflows.

## Development

```bash
bun run check
bun run scripts/seed-demo-workspace.ts /tmp/kundol-demo-workspace
HOME=/tmp/kundol-home bun run dev -- init --workspace /tmp/kundol-demo-workspace
HOME=/tmp/kundol-home bun run dev -- dashboard
```
