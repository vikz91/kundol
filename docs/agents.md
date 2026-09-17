# kundol Agent Guide

Created: 2026-06-13 07:21:12 IST
Last updated: 2026-09-17 12:00:00 IST

kundol is a Bun + TypeScript macOS-first CLI for storage, generated-project-file optimisation, and catalogue discovery. [Usage](usage.md) explains first use; [context](context.md) maps the implementation; [commands](commands.md) defines the public CLI. The old TUI and project-discovery commands are not public.

## Project documents

Start with [plan.md](plan.md), [learnings.md](learnings.md), and the [knowledge-base index](README.md). Add any new durable page to both this index and `docs/README.md`.

| Page | Purpose |
|---|---|
| [architecture.md](architecture.md), [context.md](context.md) | Design boundaries and current code map. |
| [usage.md](usage.md), [commands.md](commands.md), [product-goal.md](product-goal.md) | Usage, public commands, and product direction. |
| [storage-optimizer.md](storage-optimizer.md), [storage-config.md](storage-config.md), [docker.md](docker.md) | Storage, persistence, and Docker behavior or future design. |
| [project-runtimes.md](project-runtimes.md), [dependencies.md](dependencies.md) | Runtime markers, cleanup rules, and tool dependencies. |
| [developer-cleanup-targets.md](developer-cleanup-targets.md), [optimisation-registry.md](optimisation-registry.md) | Sourced targets, published/proposed JSON rules, and the active registry engine. |
| [demo/seed-demo-workspace.md](demo/seed-demo-workspace.md), [demo/docker-sandbox.md](demo/docker-sandbox.md) | Disposable manual testing fixtures. |
| [user-flow.md](user-flow.md), [workflows/implementation-wave-001.md](workflows/implementation-wave-001.md) | User-flow decisions and archived implementation coordination. |
| [brand.md](brand.md), [launch.md](launch.md), [viral-launch.md](viral-launch.md) | Brand and launch knowledge. |
| [CONTRIBUTING.md](CONTRIBUTING.md), [AUTHOR.md](AUTHOR.md), [CHANGELOG.md](CHANGELOG.md), [release.md](release.md), [homebrew-publishing-readiness.md](homebrew-publishing-readiness.md) | Contribution, release, and Homebrew readiness records. |

## Operating loop

For the public help site, see [manual authoring and publication](manual-publishing.md). Edit source docs, not ignored generated pages; run `bun run docs:build` for site changes.

1. Read [plan.md](plan.md), [product-goal.md](product-goal.md), [learnings.md](learnings.md), and relevant docs. Inspect the touched code with `rg` and tests before editing.
2. Choose an unblocked task that is not already `in progress` unless the user asked you to continue it. Set its status to `in progress`, Owner, and Started at.
3. State the intended edit. Keep work scoped, use `apply_patch` for hand edits, and preserve other agents' changes. Keep CLI, docs, and tests in parity when user behavior changes.
4. Record meaningful discoveries in [learnings.md](learnings.md) and durable decisions under `docs/`. Update [dependencies.md](dependencies.md), [project-runtimes.md](project-runtimes.md), or [docker.md](docker.md) when those areas change.
5. Run `bun run check` for code changes; use link/path and whitespace checks for documentation-only work. Mark the task `don` or `cancelled`, set Completed at, and add concise notes.

Allowed statuses are `todo`, `in progress`, `don`, and `cancelled`. Use `don` intentionally. Timestamps use `YYYY-MM-DD HH:mm:ss IST`.

## Current public behavior

- Bare `kundol` prints a welcome banner and bare `optimise` prints help. `optimise all|storage|projects|repos|docker` runs registry plans; all resolves supplied/saved workdir and Docker defaults, while Docker resolves a supplied/saved/discovered named context and currently has no published resource rule. `tools available|search|list|request` browses or requests catalogue entries; `issue` opens GitHub's chooser.
- Initial valid workdir and daemon-validated Docker defaults persist in SQLite settings; subsequent explicit values are temporary unless `--save-defaults` is set. Stale defaults fail without fallback; ambiguous Docker discovery needs a numbered choice or explicit input, even with `-f`. Storage/project routes do not require Docker, and help/tools remain read-only.
- Every optimise run probes and prints a plan. All/storage/projects/repos accept `y` for safe suggestions or displayed numbers for explicit review. `-f` selects only safe, force-eligible targets after planning. The all route produces one cross-scope plan and refuses overlaps. There is no public `--dry-run`, `--apply`, `--json`, or `--max-depth` workflow flag.
- All cleanup routes use published registry rules. `repos` uses the same project handler without Git filtering. Earlier indexing, scan/clean, project-registry, archive, storage, and startup modules have been retired.
- SQLite actions and session logs live under `$HOME/.kundol`. Do not revive removed TUI, compact/archive, daemon, or Docker volume purge scope without a user request or new plan task.

## Collaboration roster

Use stable names in task ownership and prompts. Give workers disjoint files, tell them not to revert parallel edits, and integrate their work with one verification pass.

| Agent | Focus and default scope |
|---|---|
| Aarav Rao | CLI architecture, routing, option/output/exit parity; `src/cli/**`, service integration, CLI tests, README commands. |
| Meera Iyer | SQLite action persistence and registry safety guardrails; `src/db/**`, registry engine policy, related tests. |
| Kabir Menon | macOS/Linux, process and filesystem behavior, Docker and cache resource policy; `src/platform/**`, registry engine process execution, related docs/tests. |
| Isha Nair | Architecture and flow exploration; concise path/line findings, no edits unless assigned a write scope. |
| Rohan Das | CLI edge cases, failure and parity exploration; risk-ordered findings and reproduction commands. |
| Neha Sharma | Regression tests and smoke checks; `tests/**` and disposable fixtures. |
| Devika Sen | Task ledger, learnings, docs index, coordination; `docs/plan.md`, `docs/learnings.md`, `docs/agents.md`, `docs/README.md`. |
| Ananya Kapoor | Future UI work only; no TUI parity obligation in the current CLI. |

The main agent owns integration. Delegate bounded exploration, implementation, or verification when it helps; keep the critical path moving while agents work. Follow repo tests and safety rules when advice conflicts.

## Design and safety

- Use Bun, ESM, strict TypeScript, `bun test`, and Bun SQLite unless there is a clear reason otherwise. Keep Commander handlers thin; core services must not depend on CLI presentation. Use typed results and injected filesystem, clock, process runner, and DB paths where useful.
- Prefer structured process arguments over shell strings. Keep destructive filesystem actions behind services, with scan-plan-confirm (or `-f`), applicable live checks, and action audit. Never make a hidden network call during a normal scan.
- Never automatically remove project roots, source, `.git`, `.env*`, databases, uploads, media, assets, or migrations. Generated `node_modules`, build output, and caches may be candidates only after registry safety classification and live revalidation. Reject path escapes, symlinks, missing or protected items, and stale unsafe plan candidates. Generated-path apply uses the fail-closed `/usr/bin/python3` no-follow helper; do not replace it with pathname-based recursive deletion. Activity checks stream at most 150,000 entries, and eligible size measurement stops at 50,000 entries with unknown size when incomplete. The final leaf-name unlink still has a documented concurrent-replacement limit within its opened parent; see [context](context.md).
- Docker resources, unattributed temp entries, and broad user Library caches are not active registry cleanup rules. Published generated-path and owner-cache rules require precise path and owner checks; inspect [context.md](context.md) before changing those workflows.
- For new data-bearing cleanup categories such as volumes, databases, reports, media, or source after archive, require a scoped plan and dedicated explicit selection. Do not run destructive tests or smoke commands against a real home or project.

## Verification and knowledge

Use temp homes, workdirs, DB paths, and injected clocks/runners in tests. Prove protected paths are never automatically removed and apply rechecks live candidates. Keep output and exit codes consistent across interactive and non-interactive use; snapshot only stable text. Avoid tests that depend on installed runtimes or touch the user's `$HOME/.kundol/kundol.db`.

KB pages should carry a date, related plan task IDs, the decision, rationale, and consequences. Before marking a task `don`, check command parity, service boundaries, applicable safety checks, error reporting, test isolation, learning notes, and plan status.
