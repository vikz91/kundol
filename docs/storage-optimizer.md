# Storage Optimiser

Created: 2026-06-15 21:51:27 IST
Last updated: 2026-09-15 14:07:32 IST
Related tasks: `KUN-073`, `KUN-F013`, `KUN-080`, `KUN-092`

## Shipped workflow

`kundol optimise storage` probes published user-scope rules in `registry/optimisations.json`, prints a source-backed plan, asks which targets to select, and applies them through the registry engine with live validation and audits. `-f` skips selection only for suggested safe targets after the plan; review targets require displayed-number selection, and protected inventory cannot be selected. The public CLI has no `optimize` spelling, `--apply`, `--dry-run`, `--json`, category toggle, or dashboard view. See [usage](usage.md) and [commands](commands.md).

Current published owner-tool cache rules cover npm verification, pip purge, uv prune, Go build/test and module caches, and pnpm store prune. The rule's tier determines whether it is a safe suggestion or explicit review. The engine uses code-approved structured command arguments, repeats target and activity checks before apply, and reports applied, failed, and skipped counts. Plans show known target footprint; owner-tool command savings may remain unknown.

The older `src/services/optimize/` path, which contained broad Docker prune, blanket seven-day-old `os.tmpdir()` selection, and persisted-project cleanup, has been retired. Docker and temp targets remain proposed or protected registry entries, not current storage actions.

## Future resource work

Docker cleanup needs resource-specific inventory and ownership checks before any command becomes published. Never default-select volumes, mounted data, running containers, or unclear Compose resources. Temp cleanup would need precise tool-owned prefixes and conservative age/type checks; arbitrary `$TMPDIR` entries should remain outside automatic selection. These are proposals, not current CLI actions.

Project-generated cleanup belongs to `optimise projects <workdir>` and its rule-specific plan. Source, Git metadata, environment files, databases, uploads, assets, migrations, and project roots are outside generated-path removal. See [Docker](docker.md), [registry policy](optimisation-registry.md), and the [disposable sandbox](demo/docker-sandbox.md).
