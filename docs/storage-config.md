# Storage and Configuration

Created: 2026-06-14 00:48:12 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-005`, `KUN-006`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-062`, `KUN-092`

## Current state

kundol uses one Bun SQLite database at `$HOME/.kundol/kundol.db`, not a database per workspace. The active CLI creates and migrates it as needed to read project rows and record `actions` rows. `src/db/client.ts` supports an injected path or home directory for internal calls and tests; the public CLI has no database-path option.

Migration v1 has `settings`, `workspaces`, `excluded_paths`, `projects`, `tags`, `project_tags`, `project_scans`, `scan_items`, `actions`, and `schema_migrations` tables. Typed repositories isolate SQL. Settings values are serialized by type; workspace paths are resolved to absolute paths and carry an enabled flag. There is no JSON config file.

Per-process audit text files live at `$HOME/.kundol/sessions/session-<timestamp>-<pid>.log`. Each line is `ISO timestamp : device name : action : project name`. These logs are best-effort; SQLite `actions` rows are the durable structured record of successful scans, cancellations, and apply summaries. See [context](context.md) for audit caveats.

The old workspace index and project registry services can still read these tables internally. **No public `init`, `index`, `config`, `list`, or `scan` command exists.** The public `optimise projects <workdir>` and `optimise repos <workdir>` scan the path supplied for that run; they do not use configured workspaces or `excluded_paths` rows. Storage can use previously persisted project/scan rows, but a new install will not populate them through the current CLI.

## Retained decisions

One local database keeps project metadata, settings, exclusions, and audit rows together and avoids ambiguity over which workdir owns state. Workspace roots are stored as rows independent of the shell's current directory. `excluded_paths` stores exact whole-project or subtree exclusions; built-in generated-directory traversal skips are separate code rules. The retained indexing service passes configured exclusions to discovery. Any future public workspace workflow should preserve that wiring.

## Future work

If workspace registration and indexing return, let users choose several narrow roots and reject broad `/`, `~`, or system scans by default. Add explicit config commands before claiming that users can edit settings or exclusions. A future background monitor could read enabled workspaces from the same database and update metadata only; it has no current command or daemon. Pattern exclusions, custom public database paths, and archive-root settings remain undecided.

Related: [architecture](architecture.md), [commands](commands.md), and [user flow](user-flow.md).
