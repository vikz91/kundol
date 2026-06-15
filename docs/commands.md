# Commands

Created: 2026-06-14 00:33:03 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-004`, `KUN-016`, `KUN-017`, `KUN-020`, `KUN-024`, `KUN-032`, `KUN-036`, `KUN-042`, `KUN-050`

## Command Philosophy

kundol should have a small command surface.

The CLI should support scriptable workflows, while the TUI should handle interactive exploration.
Avoid adding a new top-level command when a flag or TUI action is clearer.

Rules:

- `kundol` opens the main TUI.
- kundol uses one user-scoped SQLite database at `$HOME/.kundol/kundol.db`.
- Config lives inside the SQLite database.
- Config stores workspace roots and user-excluded project/workspace paths.
- Commands should work from any current working directory after init.
- Every destructive command defaults to dry-run or requires a preview.
- Search is a filter on `list`, not a separate top-level command for MVP.
- Docker, daemon, mobile, archive restore, and deep git insights are later command groups.
- Commands should work without network access unless the command explicitly checks latest versions.

## MVP Commands

| Command | Purpose | Interactive | Mutates data | Notes |
|---|---|---:|---:|---|
| `kundol` | Open main TUI/dashboard. | yes | no | Default command after init. |
| `kundol init` | First-run setup: create config/db, choose workspaces, then optionally index. | yes | yes | Writes local config and SQLite database. |
| `kundol index` | Index configured workspace folders. | optional | yes | Updates registry metadata only. |
| `kundol dashboard` | Print dashboard summary. | no | no | Non-interactive summary for terminal/scripts. |
| `kundol list` | List projects with filters/sorting. | no | no | Main registry browsing command. |
| `kundol show <project>` | Show one project detail. | no | no | Project can be name, path, or stable id. |
| `kundol scan <project>` | Deep scan cleanup opportunities and recommendations. | no | yes | Updates project scan metadata and action log; does not delete files. |
| `kundol clean <project>` | Preview or execute safe generated-file cleanup. | optional | yes | Must default to dry-run for MVP. |
| `kundol runtimes` | Show runtime/toolchain status. | no | no | Missing tools are informative. |
| `kundol config` | View configuration. | no | no | Subcommands can be added later. |

Every CLI/TUI run appends a session audit log under `$HOME/.kundol/sessions/`.
The line format is `timestamp : device-name : action : project-name`, with `-` when no project is associated.

## Hardened Command Specs

- [`commands/default-tui.md`](commands/default-tui.md) - `kundol`
- [`commands/init.md`](commands/init.md) - `kundol init`
- [`commands/index.md`](commands/index.md) - `kundol index`
- [`commands/scan.md`](commands/scan.md) - `kundol scan <project>`

## Default TUI

Command:

```bash
kundol
```

Behavior:

- If not initialized, route to `kundol init`.
- If initialized, open dashboard TUI.
- Show projects, filters, recommendations, and next actions.
- Never perform destructive actions without a confirmation flow.

## Init

Command:

```bash
kundol init
```

Responsibilities:

- Create local config directory.
- Create local SQLite database.
- Ask for workspace folders.
- Save workspace roots.
- Offer first index.

Flags:

```bash
kundol init --workspace ~/Projects
kundol init --workspace ~/Projects --workspace ~/work
kundol init --no-index
```

## Index

Command:

```bash
kundol index
```

Responsibilities:

- Run non-AI index workers over configured workspaces.
- Detect projects.
- Infer runtimes and project types.
- Collect size and Git metadata.
- Update SQLite registry.
- Log `INDEX`.

Flags:

```bash
kundol index --workspace ~/Projects
kundol index --all
kundol index --json
```

Notes:

- `--workspace` indexes one path without changing saved config unless paired with a future config command.
- `--all` indexes all configured workspaces and is the default after init.
- Indexing should tolerate partial failures.

## Dashboard

Command:

```bash
kundol dashboard
```

Responsibilities:

- Print non-interactive summary.
- Show project counts.
- Show disk usage.
- Show potential cleanup.
- Show top runtimes.
- Show top space consumers.
- Show next suggested actions.

Flags:

```bash
kundol dashboard --json
```

## List

Command:

```bash
kundol list
```

Responsibilities:

- List projects from registry.
- Filter and sort projects.
- Replace the need for a separate `search` command in MVP.

Flags:

```bash
kundol list --status stale
kundol list --runtime node
kundol list --tag startup
kundol list --search voice
kundol list --scanned --search api
kundol list --sort size
kundol list --sort modified
kundol list --json
```

Default columns:

- Name
- Runtime
- Status
- Size
- Cleanable
- Git dirty
- Last modified
- Path

## Show

Command:

```bash
kundol show <project>
```

Responsibilities:

- Show one project in detail.
- Accept project name, id, or path.
- Display recommendations without mutating files.

Fields:

- Name
- Path
- Runtime markers
- Size
- Cleanable bytes
- Git remote/branch/dirty
- Lifecycle status
- Notes/tags when available
- Last indexed
- Last project scanned
- Recommendations summary

## Scan Project

Command:

```bash
kundol scan <project>
```

Responsibilities:

- Detect safe cleanup candidates.
- Detect caution/protected items.
- Estimate reclaimable bytes.
- Generate recommendations.
- Log `PROJECT_SCAN`.

Flags:

```bash
kundol scan <project> --json
kundol scan <project> --largest
```

Project scan must not delete files.

## Clean

Command:

```bash
kundol clean <project>
```

MVP behavior:

- Dry-run by default.
- Show exact paths that would be removed.
- Show the exact `kundol clean <project> --apply --no-dry-run` command after a dry-run preview.
- Show protected/caution items that will not be removed.
- Require `--apply` to execute.
- Before applying cleanup, create a local `.tar.gz` project archive when the project folder has not been opened/modified for more than the configured archive threshold.

Flags:

```bash
kundol clean <project> --dry-run
kundol clean <project> --apply --no-dry-run
kundol clean <project> --only node_modules
```

Config:

```bash
kundol config --archive-before-clean-days 15
```

Archives are written under `$HOME/.kundol/archives`.

Safety:

- Never remove protected paths.
- Do not clean caution items unless a future command adds explicit scoped confirmation.
- Do not combine Docker cleanup with project cleanup.

## Runtimes

Command:

```bash
kundol runtimes
```

Responsibilities:

- Show installed/missing runtime tooling.
- Show current versions.
- Show latest versions when lookup is available.
- Mark missing/outdated tools clearly.

Flags:

```bash
kundol runtimes --json
kundol runtimes --offline
```

## Config

Command:

```bash
kundol config
```

MVP behavior:

- Show config path.
- Show database path.
- Show workspace roots.
- Show archive path if configured.

Future subcommands:

```bash
kundol config add-workspace ~/work
kundol config remove-workspace ~/work
kundol config set archiveDir ~/Archives/kundol
```

## Later Commands

These are valid product directions but not MVP command surface.

| Command group | Status | Notes |
|---|---|---|
| `kundol archive` / `kundol compact` | later | Archive inactive projects after safety preflight. |
| `kundol daemon` | later | Background metadata monitoring only; no cleanup in daemon. |
| `kundol docker` | later | Docker scan/analyze/purge with separate safety rules. |
| `kundol doctor` | later | Workspace health and runtime diagnostics. |
| `kundol git` | later | Dirty repos, missing remotes, stale branches. |
| `kundol note` | later | Notes can start in TUI or `show`; CLI subcommand can wait. |
| `kundol tag` | later | Tags can start as config/metadata support; CLI subcommand can wait. |
| `kundol duplicates` | later | Duplicate repo detection. |
| `kundol report` | later | Redacted support/debug report. |

## Commands Not In MVP

Avoid these in MVP:

- `kundol search`
- `kundol purge`
- `kundol delete`
- `kundol restore`
- `kundol sync`
- `kundol login`

Rationale:

- Search belongs under `list --search`.
- Purge/delete language is too destructive for early trust.
- Restore matters after archive exists.
- Sync/login imply cloud features, which are not part of the local-first MVP.
