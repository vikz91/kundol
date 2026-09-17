# kundol Architecture

Created: 2026-06-13 07:24:10 IST
Last updated: 2026-09-17 12:00:00 IST
Related tasks: `KUN-002`, `KUN-003`, `KUN-004`, `KUN-005`, `KUN-016`, `KUN-024`, `KUN-032`, `KUN-042`, `KUN-080`, `KUN-092`, `KUN-101`, `KUN-102`, `KUN-103`

## Current architecture

kundol is a Bun and TypeScript CLI. `src/cli/index.ts` starts Commander and registers `optimise`, read-only `tools` catalogue commands, and the GitHub `issue` link. Storage, workdir, and explicit Docker-context routes use the bundled JSON registry; `optimise all` composes those engines plus system-scope readiness into one plan while retaining their original review plans for apply. No Docker-context rule is published yet. There is no dashboard or TUI. See [usage](usage.md) and [context](context.md).

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

Every `optimise` command prints a plan before selection or `-f`. Published registry targets are limited by integration/status, scope, code-approved handlers, and safety tier. The all-scope route requires a workdir and Docker context, rejects duplicate or nested targets across engines, and collects one selection. The issuing engine re-probes each selected identity and repeats live checks before action; protected inventory has no removal action, and `-f` selects only safe suggestions. Activity checks stream to a fixed entry limit before size measurement. Generated-path deletion uses an isolated Python helper with no-follow, descriptor-relative removal and fails closed if unavailable; [context](context.md) documents its remaining final-entry race. Target audits reuse one SQLite connection during apply. One or more apply failures return exit code 70; scans and audits can also return errors.

The public CLI does not perform broad Docker prune or blanket old-temp deletion. A named-context Docker route and staged exact-resource adapters exist, but Docker rule publication needs private-daemon acceptance; unattributed temp ownership remains future work. Owner-tool cache commands may cause re-downloads. [Context](context.md) records the current limits.

## Design direction

Keep deterministic scanners bounded and testable with injected roots, clock, process runners, and database paths. The code-owned local handler manifest pairs an exact rule ID with selector, action, and validator handlers, so registry data cannot invent executable behavior. Adapters return approved physical path identities or daemon/owner resource IDs with targeted live lookup; unbounded/truncated inventories fail closed. Independent read-only probes are concurrency-limited; selected actions recheck exact identity, run sequentially, and produce per-target audit events. Resource-specific Docker cleanup must inventory containers, images, networks, build cache, and volumes independently. Project-local rules must not justify a Docker purge. A future UI is outside the current product scope.

Related decisions: [storage optimiser](storage-optimizer.md), [Docker](docker.md), and [product goal](product-goal.md).
