# Storage and Configuration

Created: 2026-06-14 00:48:12 IST
Last updated: 2026-09-15 16:05:32 IST
Related tasks: `KUN-005`, `KUN-006`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-062`, `KUN-092`, `KUN-102`, `KUN-103`

## Current state

kundol uses one Bun SQLite database at `$HOME/.kundol/kundol.db`, not a database per workspace. The active CLI creates and migrates it as needed to record `actions` rows. `src/db/client.ts` supports an injected path or home directory for internal calls and tests; the public CLI has no database-path option.

Migration v1 has `settings`, `workspaces`, `excluded_paths`, `projects`, `tags`, `project_tags`, `project_scans`, `scan_items`, `actions`, and `schema_migrations` tables. Those earlier project and configuration tables remain for compatibility with existing databases but are not populated by the engine-only CLI. The active audit path uses `actions`; the catalogue is bundled JSON, not a user config file.

Per-process audit text files live at `$HOME/.kundol/sessions/session-<timestamp>-<pid>.log`. Each line is `ISO timestamp : device name : action : project name`. These logs are best-effort; SQLite `actions` rows record scans, cancellations, selected-target attempts/outcomes, and apply summaries. Target events reuse one connection during apply, closed before the run summary, and no connection is held during selection. An outcome or summary audit failure after a real action appears as a warning instead of concealing the action result. See [context](context.md) for audit caveats.

The old workspace index, project registry, and configuration services have been retired. There is no public `init`, `index`, `config`, project-registry `list`, or `scan` command. `kundol tools list` reads the bundled optimisation catalogue. The public `optimise projects <workdir>` and `optimise repos <workdir>` probe the path supplied for that run; they do not use persisted workspace or `excluded_paths` rows. The public `optimise storage` route probes published user-scope cache rules and does not use persisted project or scan rows.

## Retained decisions

The original schema placed project metadata, settings, exclusions, and audit rows in one local database. Workspace roots were stored as rows independent of the shell's current directory, and `excluded_paths` represented exact whole-project or subtree exclusions. These are historical design decisions, not active CLI workflows. Any future public workspace workflow would need fresh configuration and indexing code rather than relying on retired services.

## Future work

If workspace registration and indexing return, let users choose several narrow roots and reject broad `/`, `~`, or system scans by default. Add explicit config commands before claiming that users can edit settings or exclusions. There is no current background monitor or daemon. Pattern exclusions, custom public database paths, and archive-root settings remain undecided.

Related: [architecture](architecture.md), [commands](commands.md), and [user flow](user-flow.md).
