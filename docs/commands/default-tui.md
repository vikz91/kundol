# Command Spec: `kundol`

Created: 2026-06-14 00:38:01 IST  
Last updated: 2026-06-14 00:56:24 IST  
Related tasks: `KUN-004`, `KUN-024`, `KUN-059`, `KUN-060`

## Purpose

`kundol` opens the primary terminal UI.
It is the default command users run after installation and setup.

## Command

```bash
kundol
```

## MVP Behavior

- If kundol is not initialized, show a short first-run message and route into `kundol init`.
- If kundol is initialized, open the TUI dashboard.
- If TUI rendering is unavailable, print a helpful message and suggest non-interactive commands.
- Never mutate projects, clean files, archive, delete, or purge resources.

## Flags

MVP flags:

```bash
kundol --help
kundol --version
```

Do not add extra flags to the default command in MVP.
Use named commands for non-interactive workflows.

## Startup State Machine

```text
start
  -> load config
  -> if config missing: route to init
  -> if config invalid: show repair message
  -> if database missing: initialize or repair metadata store
  -> open dashboard TUI
```

## Initialized Checks

kundol is initialized when:

- Config file exists.
- Config validates.
- At least one workspace root is configured.
- SQLite database exists or can be created/migrated.

Default database path is `$HOME/.kundol/kundol.db`.
Config lives inside SQLite tables in that database.
The current shell working directory is not part of initialized state.

If config exists but has no workspace roots, route to workspace selection inside `init`.

## TUI Landing Screen

The TUI dashboard should show:

- Project count.
- Runtime breakdown.
- Lifecycle status counts.
- Disk usage.
- Potential cleanup.
- Largest projects.
- Recent scan status.
- Suggested next actions.

Suggested actions:

- Scan now.
- Review projects.
- Analyze largest project.
- Check runtimes.
- Open config/workspaces.

## Empty States

### Not Initialized

```text
kundol is not initialized yet.

Run first-time setup to choose workspace folders and create the local registry.
```

Then route to `init` in interactive terminals.

### Initialized But Never Scanned

```text
No projects indexed yet.

Run a scan to index your configured workspace folders.
```

Offer:

- Start scan.
- Edit workspaces.
- Quit.

### No Projects Found

```text
No projects found in configured workspaces.
```

Offer:

- Add another workspace.
- Rescan.
- View detection rules.

## Non-Interactive Terminal Handling

If stdout is not a TTY:

- Do not launch TUI.
- Print a concise message.
- Suggest `kundol dashboard` for non-interactive output.
- Exit with code `2`.

Example:

```text
The default TUI requires an interactive terminal.
Use `kundol dashboard` for scriptable output.
```

## Exit Codes

| Code | Meaning |
|---:|---|
| `0` | TUI exited normally. |
| `1` | Unexpected error. |
| `2` | TUI requested in non-interactive environment. |
| `3` | Config exists but is invalid and cannot be repaired automatically. |

## Safety Rules

- Default TUI must not perform destructive actions directly.
- Any cleanup flow launched from TUI must show preview first.
- Any cleanup execution must require explicit confirmation.
- Background monitoring must not be enabled silently.

## Implementation Notes

- Keep TUI rendering in `src/tui`.
- Keep config/db initialization outside React components.
- TUI should call services; services should not import TUI code.
- Dashboard data should come from shared query/service methods used by `kundol dashboard`.

## Tests

Required tests:

- Routes to init when config is missing.
- Opens dashboard when config and database are valid.
- Shows repair/error state for invalid config.
- Does not launch TUI when stdout is non-interactive.
- Does not call cleanup/archive/delete services on startup.
- Shows never-scanned empty state when registry is empty.

## Open Questions

- Should first-run routing automatically launch interactive `init`, or print `kundol init` and wait?
- Should the TUI support a read-only demo mode before init?
