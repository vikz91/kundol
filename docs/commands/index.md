# Command Spec: `kundol index`

Created: 2026-06-14 00:42:22 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-010`, `KUN-011`, `KUN-012`, `KUN-013`, `KUN-014`, `KUN-015`, `KUN-016`, `KUN-059`, `KUN-061`

## Purpose

`kundol index` indexes workspace folders and updates the local project registry.
It is a deterministic non-AI worker command.

The index command only reads workspace files and writes kundol metadata.
It must never modify project files.

The index command uses the user-scoped registry at `$HOME/.kundol/kundol.db`.
It does not use per-workspace databases.

## Command

```bash
kundol index
```

## MVP Flags

```bash
kundol index
kundol index --all
kundol index --workspace ~/Projects
kundol index --workspace ~/Projects --workspace ~/work
kundol index --json
kundol index --no-progress
```

## Flag Behavior

| Flag | Meaning |
|---|---|
| `--all` | Index all configured workspaces. This is the default when no workspace is specified. |
| `--workspace <path>` | Index one or more explicit workspace paths without changing saved config. Repeatable. |
| `--json` | Print machine-readable summary. No spinner/progress UI. |
| `--no-progress` | Disable progress rendering for plain terminal output. |

Do not add cleanup, archive, Docker, runtime-latest lookup, or daemon behavior to `index`.

## Preconditions

Before indexing:

- Config must exist.
- Database must exist or be initializable/migratable.
- At least one workspace root must be available from config or flags.
- Workspace roots must pass validation.

Commands should work from any current working directory after init.
The configured workspace array defines the default index scope.

If config is missing:

```text
kundol is not initialized yet.
Run `kundol init` to choose workspace folders.
```

Exit `2`.

## Workspace Scope

Default:

```bash
kundol index
```

Indexes all configured workspace roots.

Explicit:

```bash
kundol index --workspace ~/Projects
```

Indexes only the provided path for this run.
It does not add the path to config.

Rules:

- Reject broad roots like `/` and `~`.
- Reject system directories.
- Reject files.
- Warn and skip unreadable directories.
- Deduplicate paths after resolving real paths.
- Nested workspace roots should be handled without duplicate project rows.

Configured excluded paths and built-in traversal skips apply to every index.

## Worker Pipeline

```text
index command
  -> load config
  -> resolve workspace scope
  -> validate roots
  -> create index job
  -> traverse directories
  -> apply configured excluded paths
  -> apply built-in traversal skips
  -> detect project markers
  -> infer project type/runtime
  -> collect metadata
  -> upsert projects
  -> record index action
  -> print summary
```

## Directory Traversal Rules

Skip these directories during traversal:

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
- `Library`
- `Temp`
- `Logs`

Notes:

- Skip generated directories for traversal performance, but still detect them during analysis later.
- A generated directory should not become a project root by itself.
- Hidden directories are not all skipped. Some, such as `.config` inside a project, may be meaningful.

## Configured Excluded Paths

In addition to built-in traversal skips, index should read excluded paths from the database.

Excluded paths are user-selected whole project/workspace paths, for example:

```text
$HOME/Projects/sensitive-project
```

Exclusion behavior:

- Apply exclusions consistently no matter where the user runs `kundol`.
- Resolve excluded paths to absolute real paths.
- Skip excluded paths before project detection.
- Do not report excluded projects in dashboard/list/search.
- Treat invalid excluded paths as warnings, not fatal errors.
- MVP exclusions are exact paths, not glob patterns.

Important distinction:

- User exclusions are for whole projects/paths under workspaces.
- Built-in traversal skips are for generated/internal folders like `node_modules`, `.git`, and `target`.

## Project Detection

Detect projects using `docs/project-runtimes.md` markers plus `.git`.

Current runtime scope:

- JavaScript/TypeScript: Node.js, Bun, Deno
- Java
- .NET
- Python
- Rust
- Go

Detection principles:

- A single directory may have multiple runtime markers.
- Preserve all detected runtimes.
- Choose a primary display runtime deterministically.
- Git-only directories are valid projects when no runtime marker exists.
- Avoid duplicate child projects when a parent marker clearly owns the project, unless the child has an independent marker and is not generated output.

## Metadata Collected

Per project:

- Name.
- Absolute path.
- Detected runtimes.
- Primary runtime.
- Project markers.
- Lifecycle status.
- Size bytes.
- Last modified time.
- Last indexed time.
- Git remote.
- Git branch.
- Git dirty flag.
- Index warnings.

Do not run package scripts, install dependencies, modify lockfiles, or update runtime versions.

## Lifecycle Status During Index

Index may infer:

- `NEW`
- `ACTIVE`
- `PAUSED`
- `STALE`

Index should not infer:

- `ARCHIVED` unless archive metadata already exists.
- `DELETED` unless a previously indexed project path is missing.

Missing previously indexed projects:

- Mark as missing/deleted candidate in metadata.
- Do not remove the row immediately.
- Do not delete archives or actions.

## Progress Output

Interactive output should show:

- Current workspace.
- Current phase.
- Projects found.
- Directories skipped.
- Warnings count.
- Elapsed time.

Example:

```text
Indexing ~/Projects

Projects found: 42
Skipped:        318
Warnings:       2
Elapsed:        12s
```

`--json` and `--no-progress` must not render spinners.

## Summary Output

Plain output:

```text
Index complete.

Workspaces indexed: 2
Projects found:     132
New projects:       7
Updated projects:   125
Missing projects:   3
Warnings:           2
Elapsed:            28s
```

If warnings exist:

```text
Warnings:
  Permission denied: ~/work/private-client
  Skipped broad nested workspace: ~/Projects
```

## JSON Output

Success:

```json
{
  "ok": true,
  "workspacesIndexed": 2,
  "projectsFound": 132,
  "newProjects": 7,
  "updatedProjects": 125,
  "missingProjects": 3,
  "warnings": [
    {
      "code": "PERMISSION_DENIED",
      "path": "/Users/me/work/private-client",
      "message": "Permission denied."
    }
  ],
  "elapsedMs": 28000
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_INITIALIZED",
    "message": "Run `kundol init` before indexing."
  }
}
```

## Partial Failure Policy

Index should continue when:

- A subdirectory is unreadable.
- Git metadata fails for one project.
- Size calculation fails for one project.
- A marker file cannot be parsed.
- A workspace contains symlink loops.

Index should fail when:

- No valid workspace roots are available.
- Database cannot be opened or migrated.
- Config is invalid and cannot be read.

## Symlink Policy

MVP behavior:

- Do not follow symlinked directories by default.
- Record skipped symlink directories as debug-level warnings only if verbose output exists later.
- Resolve workspace root real paths for deduplication.

Rationale:

- Avoid loops.
- Avoid indexing outside user-selected roots unexpectedly.

## Database Behavior

Index may write:

- Project upserts.
- Last indexed timestamps.
- Size bytes.
- Runtime markers.
- Git metadata.
- Lifecycle status inference.
- `INDEX` action rows.

Index must not write:

- Cleanup actions.
- Archive actions.
- Docker resources.
- Notes/tags unless explicitly inferred by a future feature.

## Exit Codes

| Code | Meaning |
|---:|---|
| `0` | Index completed. Warnings may exist. |
| `1` | Unexpected error. |
| `2` | Not initialized or no workspace roots available. |
| `3` | All provided workspace roots are invalid. |
| `4` | Database initialization/migration failed. |

Warnings alone must not produce non-zero exit.

## Safety Rules

- Never modify project files.
- Never delete or clean files.
- Never run package-manager install commands.
- Never run user package scripts.
- Never index `/` or `~`.
- Never follow symlinked directories by default.
- Never require network access.

## Implementation Notes

- Put index orchestration in `src/core/workers/index-worker.ts`.
- Put traversal behavior in `src/core/discovery/scanner.ts`.
- Put marker detection in `src/core/discovery/markers.ts`.
- Put type inference in `src/core/discovery/type-inference.ts`.
- Put Git metadata behind `src/platform/process-runner.ts`.
- Put filesystem access behind platform adapters.
- Keep command handler thin.

## Tests

Required tests:

- Fails with `NOT_INITIALIZED` when config is missing.
- Indexes configured workspaces by default.
- Indexes explicit `--workspace` without modifying config.
- Rejects `/` and `~`.
- Deduplicates repeated workspace paths.
- Does not follow symlinked directories.
- Skips generated directories during traversal.
- Detects JS, Java, .NET, Python, Rust, Go, and Git-only projects.
- Preserves multiple runtimes for mixed projects.
- Continues after unreadable subdirectory warning.
- Continues after Git metadata failure for one project.
- Writes `INDEX` action.
- Does not call cleanup/archive/delete services.
- JSON success output has stable keys.
- JSON failure output has stable error shape.

## Open Questions

- Should `index --workspace` allow paths outside configured workspace roots?
- Should index include a future `--max-depth` flag?
- Should index support a future `--include-hidden` flag?
