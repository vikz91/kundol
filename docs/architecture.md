# kundol Architecture

Created: 2026-06-13 07:24:10 IST
Last updated: 2026-09-15 14:07:32 IST
Related tasks: `KUN-002`, `KUN-003`, `KUN-004`, `KUN-005`, `KUN-016`, `KUN-024`, `KUN-032`, `KUN-042`, `KUN-080`, `KUN-092`, `KUN-101`

## Current architecture

kundol is a Bun and TypeScript CLI. `src/cli/index.ts` starts Commander and registers `optimise`, read-only `tools` catalogue commands, and the GitHub `issue` link. Storage and workdir optimisation use published rules from the bundled JSON registry. There is no dashboard or TUI. See [usage](usage.md) and [context](context.md).

```text
CLI registration and selection (src/cli)
  -> registry schema and published rules (src/core/optimisation-registry, registry/)
  -> registry probe/review/apply engine (src/services/optimisation-registry/)
  -> SQLite actions and session audit (src/db/, src/services/audit/)
```

The CLI formats plans, collects selection, and reports results. The registry engine owns target identification, deduplication, live verification, and execution. Core services do not import CLI presentation. Destructive calls stay in services behind a plan and recheck. The `tools` commands only read bundled JSON; `tools request` and `issue` open GitHub pages and leave submission to the user.

| Area | Current role |
|---|---|
| `registry/optimisations.json`, `src/core/optimisation-registry/` | Rule definitions, statuses, source links, and validation. |
| `src/services/optimisation-registry/` | Published user-cache and workdir-generated-rule probe, review, apply, and audit engine. |
| `src/db/` | One Bun SQLite database at `~/.kundol/kundol.db`; historical migration tables remain for compatibility, while active cleanup records actions. |
| `src/services/audit/` | Best-effort text sessions under `~/.kundol/sessions`. |
| `src/shared/`, `src/platform/` | Exit codes, output, clock, filesystem, and home helpers. |

The earlier storage, project-optimizer, indexing, scan/clean, archive, project-registry, and startup modules have been retired. The current CLI does not create an archive or disable startup items.

## Safety and error boundaries

Every `optimise` command prints a plan before selection or `-f`. Published registry targets are limited by integration/status, scope, code-approved handlers, and safety tier. The engine re-probes identity and repeats live checks before action; protected inventory has no removal action, and `-f` selects only safe suggestions. One or more apply failures return exit code 70; scans and audits can also return errors.

The public CLI does not perform broad Docker prune or blanket old-temp deletion. Docker resource inventory and temp ownership checks remain future work. Owner-tool cache commands may cause re-downloads. [Context](context.md) records the current limits.

## Design direction

Keep deterministic scanners bounded and testable with injected roots, clock, process runners, and database paths. Resource-specific Docker cleanup should inventory containers, images, networks, build cache, and volumes independently. Project-local rules must not justify a Docker purge. A future UI is outside the current product scope.

Related decisions: [storage optimiser](storage-optimizer.md), [Docker](docker.md), and [product goal](product-goal.md).
