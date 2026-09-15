# kundol Architecture

Created: 2026-06-13 07:24:10 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-002`, `KUN-003`, `KUN-004`, `KUN-005`, `KUN-016`, `KUN-024`, `KUN-032`, `KUN-042`, `KUN-080`, `KUN-092`

## Current architecture

kundol is a Bun and TypeScript **CLI-only** application. `src/cli/index.ts` starts Commander; the public surface is the welcome command and `optimise storage|startup|projects|repos`. There is no dashboard or TUI. See [commands](commands.md) for syntax and [context](context.md) for implementation limits.

```text
CLI registration and terminal output (src/cli)
  -> storage/startup/project services (src/services)
  -> classification and filesystem helpers (src/core, src/platform)
  -> SQLite repositories and session audit (src/db, src/services/audit)
```

The CLI formats plans, collects confirmation or startup item selection, reports results, and writes audits. Services own scanning and execution. Project cleanup shares `src/core/safety/policy.ts`; startup and storage have their own checks. Dependencies should point toward core services: core must not import CLI presentation. Destructive filesystem calls belong in services, behind scan and live verification, rather than command registration.

| Area | Current role |
|---|---|
| `src/services/optimize/` | Plans available cache commands, Docker system prune without volumes, seven-day-old top-level temp entries, and previously indexed inactive project cleanup. |
| `src/services/startup-optimizer/` | On macOS, scans launchd and classic Login Items; only non-Apple user LaunchAgents can be disabled. |
| `src/services/project-optimizer/` | Scans a chosen workdir to depth 7 and selects generated artifacts directly inside detected runtime projects. `repos` invokes this same service without Git filtering. |
| `src/db/`, `src/config/paths.ts` | One Bun SQLite database at `~/.kundol/kundol.db`; migrations and repositories isolate SQL. |
| `src/services/audit/` | Best-effort per-process text sessions under `~/.kundol/sessions`. |
| `src/shared/`, `src/platform/` | Exit codes, terminal output abstraction, clock, filesystem, and home-path helpers. |

The active commands create/read SQLite state and write `actions` rows for scans, cancellations, and apply results. Indexing, discovery, registry, project scan/clean, recommendation, and archive modules remain in the source tree but have no public commands. Storage apply may call the retained scan/clean service for an already indexed, inactive project; a new install has no such project rows. The current CLI never creates an archive.

## Safety and error boundaries

Every public optimise command scans and prints a plan before confirmation or `-f`. Apply rechecks live project candidate types/classification, user LaunchAgent paths, and temp entry age/type/symlink status. Project roots, source, `.git`, environment files, databases, uploads, media, assets, and migrations are excluded from automatic project cleanup. Docker volumes are excluded from storage prune.

These checks have limits. Storage currently selects **all** old top-level `os.tmpdir()` regular entries, not only kundol-owned files. Its Docker row is a broad `docker system prune --force`, not a resource inventory. Project apply does not prove realpath containment after an ancestor symlink swap; startup apply does not re-read the plist label after scanning. [Context](context.md) records these implementation facts so future safety changes can target them.

Filesystem scans return warnings for some unreadable entries; uncaught scan/database failures are not converted into structured CLI results. Apply reports skipped and failed targets separately; one or more failures returns exit code 70. Session-log failure is silent, whereas SQLite action writes are part of the command path.

## Design direction

Keep deterministic scanners bounded and testable with injected filesystem roots, clock, process runner, and database paths. Preserve one user-scoped database instead of per-workspace databases. Future resource-specific Docker cleanup should inventory containers, images, networks, build cache, and volumes independently; project-local safety policy must not be used to justify a Docker purge. A future UI can depend on the same services but is outside the current product scope. Runtime analyzers for iOS/Android are also future work.

Related decisions: [storage and configuration](storage-config.md), [storage optimiser](storage-optimizer.md), [Docker](docker.md), and [product goal](product-goal.md).
