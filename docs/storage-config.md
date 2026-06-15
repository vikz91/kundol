# Storage And Configuration

Created: 2026-06-14 00:48:12 IST  
Last updated: 2026-06-14 00:56:24 IST  
Related tasks: `KUN-005`, `KUN-006`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-062`

## Decision

kundol uses one user-scoped SQLite database and stores app configuration inside that database.

Default database path:

```text
$HOME/.kundol/kundol.db
```

Per-run audit session logs live under:

```text
$HOME/.kundol/sessions/session-<timestamp>-<pid>.log
```

Each line is plain text:

```text
timestamp : device-name : action : project-name
```

kundol does not create a separate database per workspace folder.
Every command reads the configured workspace list from the user-scoped database, so users do not need to run kundol from a specific working directory.

## Rationale

One database is simpler and safer:

- One source of truth for all projects.
- One dashboard across all workspaces.
- No confusion about which folder owns which registry.
- No need to run commands from specific directories.
- Easier background monitoring later.
- Easier backup/export/migration story.
- Easier support and debugging.
- Config and registry data move together.

Per-folder databases are not part of the product direction.

## Why Store Config In SQLite?

Config can live in SQLite because kundol already needs SQLite before it can do meaningful work.

Benefits:

- One durable local state store.
- No JSON-vs-DB drift.
- Workspaces, excluded projects, settings, and scan metadata can be queried together.
- Easier migrations as config evolves.
- Easier future TUI editing of settings.

The only bootstrap knowledge needed is the fixed database path:

```text
$HOME/.kundol/kundol.db
```

If a future advanced mode needs a custom DB path, it can be provided through an environment variable or explicit flag, not normal MVP config.

## Recommended Tables

Config-related tables:

```text
settings
  key
  value
  updated_at

workspaces
  id
  path
  enabled
  created_at
  updated_at

excluded_paths
  id
  path
  reason
  created_at
  updated_at
```

Project registry tables remain separate:

```text
projects
tags
project_tags
actions
```

The SQLite `actions` table stores durable structured project events.
The session log stores a lightweight per-process audit trail for command/dashboard actions during that run.

## Config Shape Concept

Config should store:

- Workspace roots.
- Excluded project/workspace paths.
- Optional archive path for future archive workflows.
- Settings that affect scanning and display.

Conceptual shape, represented as DB rows rather than a JSON file:

```json
{
  "version": 1,
  "databasePath": "$HOME/.kundol/kundol.db",
  "workspaces": [
    {
      "path": "$HOME/Projects",
      "enabled": true
    },
    {
      "path": "$HOME/work",
      "enabled": true
    }
  ],
  "excludedPaths": [
    {
      "path": "$HOME/Projects/sensitive-project",
      "reason": "User excluded during init"
    }
  ]
}
```

The application directory is:

```text
$HOME/.kundol
```

The database is:

```text
$HOME/.kundol/kundol.db
```

## Workspace Rules

Workspace roots:

- Are configured during `kundol init`.
- Can later be viewed through `kundol config`.
- Can later be modified through config commands or TUI settings.
- Are independent of the current shell working directory.

`kundol index` with no arguments indexes configured enabled workspaces.

`kundol index --workspace <path>` indexes an explicit path for that run but does not mutate config.

## Excluded Projects And Paths

User-controlled exclusions are for whole projects or paths under a workspace, not internal folders inside a project.

Example:

```text
Workspace:     $HOME/Projects
Excluded path: $HOME/Projects/sensitive-project
```

If a path is excluded:

- Do not index it.
- Do not show it in dashboard/list/search.
- Do not project-scan it.
- Do not include it in cleanup recommendations.
- Do not traverse into it during background monitoring.

Exclusions should be exact path based in MVP.
Pattern-based project exclusions can come later if needed.

## Built-In Traversal Skips

Built-in traversal skips are different from user exclusions.
They are internal performance/safety rules for folders inside projects.

Examples:

- `.git`
- `node_modules`
- `.venv`
- `venv`
- `__pycache__`
- `target`
- `dist`
- `build`
- `.next`
- `.nuxt`
- `.turbo`
- `.cache`
- `.gradle`
- `bin`
- `obj`
- Unity generated folders like `Library`, `Temp`, and `Logs`

These are not user-managed project ignore rules.
They help scanning avoid expensive generated folders.

## Command Implications

Commands should not depend on current working directory except when the user passes an explicit path.

Examples:

```bash
kundol index
kundol dashboard
kundol list
kundol scan voice-ai
```

These commands should work from any directory after init.

## Background Monitoring Implication

A future daemon can watch configured workspaces from the user-scoped config.
It does not need per-workspace databases.
It should update the same `$HOME/.kundol/kundol.db` registry.
It should not watch or scan excluded paths.

## Open Implementation Choices

- Whether to support pattern-based project exclusions later.
- Whether to support an advanced custom database path later.
