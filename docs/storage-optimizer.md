# Storage Optimiser

Created: 2026-06-15 21:51:27 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-073`, `KUN-F013`, `KUN-080`, `KUN-092`

## Shipped workflow

`kundol optimise storage` scans, prints the selected safe targets, asks `[y/N]`, applies that set, and reports/audits results. `-f` skips confirmation **after** planning. The CLI has no `optimize` spelling, `--apply`, `--dry-run`, `--json`, category toggle, or dashboard view. [Commands](commands.md) is the public contract.

| Planned source | Current selection |
|---|---|
| Available tool commands | Bun cache removal; Python pip cache purge; npm cache verify; pnpm store prune; Yarn cache clean; Go build/test cache cleanup; `docker system prune --force` if `docker info` succeeds. Commands use structured `Bun.spawn` arguments. |
| `os.tmpdir()` | Every regular **top-level** file/directory at least seven days old is selected, except symlinks. Apply rechecks existence, age, type, symlink status, and containment within the temp root. |
| Stored projects | `PAUSED`/`STALE` rows with positive cleanable bytes are selected and passed to retained persisted-scan cleanup. `ACTIVE`/`NEW` rows are review-only. Fresh installs have no indexed projects or scan rows through the public CLI. |
| Informational rows | `~/Library/Caches` is review-only. Docker volumes are protected and excluded from prune. Neither row is inventoried, sized, or printed in the terminal plan. |

The preview's known-byte figure omits unknown-size commands and is not a measured saving. Apply prints target/count results; it does not calculate actual reclaimed bytes. A stored-project row may be reported applied even if its retained cleaner removed zero items. See [context](context.md) for implementation limitations.

## Safety gap and desired policy

The current Docker action is **broad system prune without volumes**; it does not inventory resources by ID, age, labels, or Compose ownership. The current temp selection is broader than the historical goal of kundol-owned temp entries. Keep these facts visible when changing cleanup behavior or documenting safety.

The next safety improvement should use targeted Docker inspection/removal: build cache, dangling images, old stopped containers, and unused non-default networks, with a resource list before execution. Never default-select volumes, mounted data, running containers, or Compose resources whose ownership is unclear. Limit automatic temp deletion to known tool-owned prefixes and conservative age/type/ownership checks; leave arbitrary `$TMPDIR` entries for explicit review. These are **proposals**, not current guarantees.

Project-local cleanup should continue to classify generated artifacts as `safe` and recheck paths on apply. Source, `.git`, `.env*`, databases, uploads, media, assets, migrations, project roots, and user reports stay protected. Virtual environments, global Cargo/Gradle/Maven stores, `npm cache clean --force`, browser/IDE caches, Xcode archives, simulator state, and user-facing Downloads/Documents/Desktop need separate explicit review rather than default apply. Avoid broad deletion under `~/Library`, `/Library`, `/System`, `/var`, or `/tmp`.

## Future implementation choices

Keep the public `optimise storage` command and its scan-plan-confirm contract while narrowing the internal target set. Decide whether package-cache commands should remain default-selected because they cause re-downloads; whether pip purge should move to review-only; whether Docker cleanup should use only resource IDs; and whether path deletion needs a restore manifest. Do not imply an archive is created today.

The [Docker sandbox](demo/docker-sandbox.md) supplies fake cache, temp, project, startup, and Docker-like fixtures for first-time testing without mounting a user's Mac data or Docker socket.
