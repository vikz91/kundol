# Storage Optimiser

Created: 2026-06-15 21:51:27 IST
Last updated: 2026-09-17 12:00:00 IST
Related tasks: `KUN-073`, `KUN-F013`, `KUN-080`, `KUN-092`

## Shipped workflow

`kundol optimise storage` probes published user-scope rules in `registry/optimisations.json`, prints a source-backed plan, asks which targets to select, and applies them through the registry engine with live validation and audits. With `--allow-beta`, it attempts every user-scope beta readiness gate and reports every unavailable ID; Yarn Classic 1.x is the only beta storage handler currently approved. Its whole-cache action requires an exact owner path, quiet tree, selected package workspace, and displayed-number confirmation. `-f` never selects it. Modern/delegated Yarn and the other 37 user beta rules fail closed. Bun's whole-cache clear, NuGet's pinned whole-store clears, and Conda's separate pinned tarball/index/log category clears remain published review-only. The public CLI has no `optimize` spelling, `--apply`, `--dry-run`, `--json`, category toggle, or dashboard view. See [usage](usage.md) and [commands](commands.md).

`kundol optimise all --workdir <path> --docker-context <name>` includes the same user-scope probe in a single plan with project, pinned Docker-context, and system results. It does not broaden storage roots or enable an unavailable beta handler.

NuGet's HTTP and global-package clears use the selected store's documented environment override, re-list the owner path, and require a quiet tree. Conda first dry-runs and fingerprints an exact category in one package root, rejects active/symlinked environments and recent or unsafe cache items, then rechecks before a pinned owner clean. Each category is an aggregate action, not per-file deletion. An owner error may follow a partial clear (for example, a file in use); Kundol reports failure but does not promise rollback. Bun's owner clear includes cached bunx packages and may require redownloads.

Current published owner-tool cache rules cover npm verification, pip purge, uv prune, Go build/test and module caches, and pnpm store prune. The rule's tier determines whether it is a safe suggestion or explicit review. The engine uses code-approved structured command arguments, repeats target and activity checks before apply, and reports applied, failed, and skipped counts. Plans show known target footprint; owner-tool command savings may remain unknown.

The older `src/services/optimize/` path, which contained broad Docker prune, blanket seven-day-old `os.tmpdir()` selection, and persisted-project cleanup, has been retired. Docker and temp targets remain beta catalogue entries (some protected), not current storage actions.

## Future resource work

Docker cleanup needs resource-specific inventory and ownership checks before any command becomes published. The named-context route exists but has no published Docker rule; it cannot prune by default. Never default-select volumes, mounted data, running containers, or unclear Compose resources. Temp cleanup would need precise tool-owned prefixes and conservative age/type checks; arbitrary `$TMPDIR` entries should remain outside automatic selection. These are proposals, not current CLI actions.

Project-generated cleanup belongs to `optimise projects <workdir>` and its rule-specific plan. Source, Git metadata, environment files, databases, uploads, assets, migrations, and project roots are outside generated-path removal. See [Docker](docker.md), [registry policy](optimisation-registry.md), and the [disposable sandbox](demo/docker-sandbox.md).
