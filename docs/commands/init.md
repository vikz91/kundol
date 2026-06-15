# Command Spec: `kundol init`

Created: 2026-06-14 00:38:01 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-004`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-059`, `KUN-060`

## Purpose

`kundol init` performs first-run setup.
It creates the local configuration, initializes the SQLite registry, collects workspace roots, and optionally runs the first index.

kundol uses one user-scoped database at `$HOME/.kundol/kundol.db`.
It does not create separate databases per workspace.
Config is stored in SQLite tables inside that database.

## Command

```bash
kundol init
```

## MVP Flags

```bash
kundol init --workspace ~/Projects
kundol init --workspace ~/Projects --workspace ~/work
kundol init --no-index
kundol init --force
kundol init --json
```

## Flag Behavior

| Flag | Meaning |
|---|---|
| `--workspace <path>` | Add a workspace root during init. Repeatable. |
| `--no-index` | Create config/db but do not run first index. |
| `--force` | Re-run init even if config exists. Must preserve existing data unless user confirms overwrite. |
| `--json` | Print machine-readable result. Should not launch interactive prompts. |

## Interactive Flow

```text
start
  -> explain local-first setup
  -> create config directory if missing
  -> initialize database/migrations
  -> ask for workspace folders
  -> validate workspace folders
  -> save config
  -> ask whether to run first index
  -> run index or show next command
  -> show first dashboard summary or next steps
```

## Non-Interactive Flow

Non-interactive init requires at least one `--workspace`.

Valid:

```bash
kundol init --workspace ~/Projects --no-index
```

Invalid:

```bash
kundol init --json
```

If no workspace is provided and prompts are unavailable:

- Print error.
- Suggest `kundol init --workspace <path>`.
- Exit `2`.

## Config Writes

`init` may write:

- Config file.
- SQLite database.
- Log/action metadata.

Default database path:

```text
$HOME/.kundol/kundol.db
```

Config stores workspace roots and user-excluded project/workspace paths.
After init, commands should work from any current working directory.

`init` must not:

- Modify workspace project files.
- Clean generated files.
- Archive projects.
- Delete anything in workspace folders.

## Workspace Validation

Accept workspace when:

- Path exists.
- Path is a directory.
- Path is readable.
- Path is not a known system root.
- Path is not duplicate after resolving real path.

Reject or warn:

- `/`
- `~`
- `/System`
- `/Library`
- `/Applications`
- `/bin`
- `/usr`
- `/private`
- Paths inside `node_modules`
- Paths inside `.git`
- Non-existent paths unless future command supports creation.

Home directory `~` should not be accepted as a workspace root in MVP.
Users should choose narrower folders like `~/Projects`, `~/work`, or `~/code`.

## Existing Config Behavior

If config already exists:

```text
kundol is already initialized.

Configured workspaces:
  ~/Projects
  ~/work

Use `kundol config` to view settings.
Use `kundol init --force` to re-run setup.
```

Without `--force`:

- Do not overwrite config.
- Exit `0`.

With `--force`:

- Show current config.
- Ask whether to keep, replace, or add workspace roots.
- Do not delete database by default.
- Do not delete historical index or project-scan data by default.

## Excluded Path Configuration

`init` may collect excluded project/workspace paths in a later interaction.

Example:

```text
$HOME/Projects/sensitive-project
```

These exclusions are whole paths under configured workspaces.
They are not for internal generated folders like `node_modules` inside a project.
Generated folder traversal skips remain built-in index traversal rules.

## First Index

Default interactive behavior:

- Ask whether to run first index now.
- Default selection should be "Yes".

Default non-interactive behavior:

- Run index unless `--no-index` is provided.

If first index runs:

- Use the same index worker as `kundol index`.
- Show progress.
- Store results.
- Then show first dashboard summary.

If first index is skipped:

```text
Setup complete.

Run `kundol index` when ready.
```

## JSON Output

For `--json`, output should be stable:

```json
{
  "ok": true,
  "initialized": true,
  "databasePath": "$HOME/.kundol/kundol.db",
  "workspaces": ["..."],
  "excludedPaths": [],
  "indexStarted": false
}
```

On failure:

```json
{
  "ok": false,
  "error": {
    "code": "WORKSPACE_REQUIRED",
    "message": "At least one workspace is required in non-interactive mode."
  }
}
```

## Exit Codes

| Code | Meaning |
|---:|---|
| `0` | Setup complete or already initialized. |
| `1` | Unexpected error. |
| `2` | Missing required non-interactive input. |
| `3` | Invalid workspace path. |
| `4` | Config/database initialization failed. |

## Output Copy

Successful setup with index:

```text
kundol is ready.

Workspaces:
  ~/Projects
  ~/work

Indexed 132 projects.
Run `kundol` to open the dashboard.
```

Successful setup without index:

```text
kundol is ready.

Workspaces:
  ~/Projects

Run `kundol index` to index your projects.
```

## Safety Rules

- Never index `/` or broad system roots.
- Never modify project files during init.
- Never overwrite existing config without explicit `--force` and confirmation.
- Never delete existing database during init unless a future command explicitly adds reset semantics.
- Never enable daemon/background monitoring automatically.

## Implementation Notes

- Put config path logic in `src/config/paths.ts`.
- Put config validation in `src/config/config-schema.ts`.
- Put init orchestration in a service, not directly in the command handler.
- Keep prompt UI separate from config/database services.
- Use the same index service as `kundol index`.

## Tests

Required tests:

- Creates config and database for valid workspace.
- Rejects missing workspace in non-interactive mode.
- Rejects broad roots like `/` and `~`.
- Deduplicates repeated workspace paths.
- Existing config without `--force` does not overwrite.
- `--no-index` does not call index worker.
- Default non-interactive with workspace calls index unless `--no-index`.
- JSON success output has stable keys.
- JSON failure output has stable error shape.
- Init never calls cleanup/archive/delete services.

## Open Questions

- Should `--force` allow replacing workspaces in non-interactive mode?
- Should `init` offer suggested folders by detecting common directories like `~/Projects`, `~/work`, and `~/code`?
