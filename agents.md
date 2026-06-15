# kundol Agent Guide

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-06-16 03:06:06 IST  
Project type: Bun + TypeScript terminal UI application  

## Purpose

This file is the operating guide for agents working on kundol.
Use it together with `plan.md`, `learnings.md`, and the knowledge base under `docs/`.

kundol is a Bun.js CLI/TUI project discovery and lifecycle tool. It should feel fast, safe, trustworthy, and pleasant inside a terminal.

## Project Documents Index

- [`plan.md`](plan.md) - task ledger, statuses, dependencies, milestones, and open decisions
- [`learnings.md`](learnings.md) - chronological discoveries and implementation notes from agents
- [`docs/README.md`](docs/README.md) - knowledge-base index for all durable docs
- [`docs/architecture.md`](docs/architecture.md) - scalable and maintainable Bun + TypeScript TUI architecture
- [`docs/brand.md`](docs/brand.md) - logo asset, color palette, and brand usage notes
- [`docs/commands.md`](docs/commands.md) - current command surface and later command groups
- [`docs/commands/default-tui.md`](docs/commands/default-tui.md) - default `kundol` TUI behavior
- [`docs/commands/init.md`](docs/commands/init.md) - `kundol init` command spec
- [`docs/commands/index.md`](docs/commands/index.md) - `kundol index` command spec
- [`docs/demo/seed-demo-workspace.md`](docs/demo/seed-demo-workspace.md) - demo workspace generator for manual CLI/TUI testing
- [`docs/dependencies.md`](docs/dependencies.md) - Bun/npm dependencies, optional packages, and system tools
- [`docs/docker.md`](docs/docker.md) - Docker monitoring, analysis, purge workflows, and safety rules
- [`docs/launch.md`](docs/launch.md) - open-source launch supply chain and community plan
- [`docs/product-goal.md`](docs/product-goal.md) - main goal, product shape, worker model, runtime scope, and future roadmap
- [`docs/project-runtimes.md`](docs/project-runtimes.md) - supported project runtimes, markers, cleanup candidates, and runtime workflows
- [`docs/storage-config.md`](docs/storage-config.md) - user-scoped database, workspace config, and ignore pattern decisions
- [`docs/storage-optimizer.md`](docs/storage-optimizer.md) - one-click optimize storage safety tiers and cleanup candidate list
- [`docs/tui.md`](docs/tui.md) - OpenTUI dashboard layout, keyboard model, and CLI parity notes
- [`docs/user-flow.md`](docs/user-flow.md) - install, init, first index, dashboard, review, project scan, cleanup, and daemon flow
- [`docs/viral-launch.md`](docs/viral-launch.md) - low-cost viral OSS launch pattern research
- [`docs/workflows/implementation-wave-001.md`](docs/workflows/implementation-wave-001.md) - first multi-agent implementation wave notes

Agents should treat this section as the starting index.
When a new durable doc is added under `docs/`, add it here and to `docs/README.md`.

## Codex Operating Loop

This repo is optimized for Codex-driven coding with short-lived specialist agents.
The main agent owns integration quality and should keep the critical path local while delegating bounded, independent work to subagents.

Default loop for every coding task:

1. Read `AGENTS.md`, then inspect the touched area with `rg`, `sed`, and tests before editing.
2. Decide whether subagents help. Use them for parallel exploration, focused implementation slices with disjoint files, or verification.
3. State the intended edit before modifying files.
4. Keep CLI, TUI, docs, and tests in parity when a feature changes user behavior.
5. Run `bun run check` unless the change is documentation-only. For doc-only changes, run targeted checks such as link/path inspection when useful.
6. Update `learnings.md` for any mistake, gotcha, product decision, or reusable implementation rule.
7. Leave the worktree understandable: no hidden generated files, no unrelated refactors, no reverted user work.

Codex-specific rules:

- Use `apply_patch` for hand edits.
- Use `rg` before broad file reads.
- Use `multi_tool_use.parallel` for independent reads.
- Do not run destructive cleanup commands against the user's real home or projects during tests.
- Prefer temp homes, temp workspaces, injected clocks, and injected DB paths in tests.
- When a command works in the dashboard, make sure the equivalent CLI/server-friendly path exists, and vice versa.
- If a feature has `--json`, keep JSON result shape and exit code behavior consistent with text output.
- If an async TUI action can partially fail, preserve and display its result instead of returning to an ambiguous idle screen.
- If a spawned subagent edits code, assign a disjoint write scope and tell it not to revert other work.

## Current Implemented Surfaces

As of 2026-06-16, the implemented app is broader than the original MVP plan.
Agents must account for these surfaces when changing behavior:

- `kundol` opens the OpenTUI dashboard in an interactive TTY and falls back to a text dashboard in non-TTY contexts.
- CLI commands: `init`, `index`, `dashboard`, `list`, `show`, `scan`, `clean`, `optimize`/`optimise`, `runtimes`, and `config`.
- Dashboard actions include search, scanned-only filter, sort cycling, project detail, index, scan, clean dry-run, optimize dry-run/apply, runtimes, config editing, status bar, animations, toasts, and action summaries.
- `clean` and `optimize` are preview-first and must print the exact explicit apply command.
- `clean --apply --no-dry-run` can create a `.tar.gz` archive before cleanup when the project is older than `archive.beforeCleanDays`.
- Session audit logs live under `$HOME/.kundol/sessions`; durable project events also use the SQLite `actions` table.

Do not revive cancelled MVP scope such as broad compact/archive commands, latest-version network lookup, daemon behavior, or Docker volume purge unless the user asks or `plan.md` gets a new task.

## Required Coordination Loop

Before starting work:

1. Read `plan.md`.
2. Read `docs/product-goal.md`.
3. Pick a task whose dependencies are complete or not blocking.
4. Update that task status to `in progress`, set `Owner`, and set `Started at`.
5. Read `learnings.md`, `docs/README.md`, and relevant docs under `docs/`.

Do not start a task already marked `in progress` unless the user explicitly asks you to continue it.

While working:

1. Keep changes scoped to the selected task.
2. Add discoveries, tradeoffs, and gotchas to `learnings.md`.
3. Add durable implementation notes to `docs/` as knowledge-base pages.
4. Maintain dependency decisions in `docs/dependencies.md`.
5. Maintain runtime workflow knowledge in `docs/project-runtimes.md`.
6. Maintain Docker resource workflow knowledge in `docs/docker.md`.
7. Do not overwrite another agent's active work.

Before finishing:

1. Run the relevant checks.
2. Update the task status to `don` or `cancelled`.
3. Set `Completed at`.
4. Add concise notes to the task row.
5. Add any new reusable knowledge to `docs/`.

Allowed task statuses are exactly:

- `todo`
- `in progress`
- `don`
- `cancelled`

Use `don`, not `done`; this spelling is intentional.

Use datetime format: `YYYY-MM-DD HH:mm:ss IST`.

## Subagent Roster

Use this named roster when splitting work. Names are stable handles for coordination notes, plan ownership, and subagent prompts.

### Aarav Rao - Staff Engineer, Core Product

Role: owns CLI architecture, command routing, service boundaries, and cross-feature integration.

Responsibilities:

- Keep command handlers thin and move business logic into `src/services` or `src/core`.
- Maintain Commander command parity, option semantics, help text, JSON output, and exit codes.
- Review changes that touch `src/cli`, command tests, package scripts, or public command behavior.
- Ensure new features have a non-interactive CLI path for servers and automation.

Default write scope:

- `src/cli/**`
- `src/services/**`
- CLI integration tests
- README command examples

### Meera Iyer - Staff Engineer, Data And Safety

Role: owns SQLite persistence, cleanup safety policy, project analysis, and destructive-action guardrails.

Responsibilities:

- Maintain migrations, repositories, typed settings, and action audit records.
- Keep cleanup classification conservative: safe, review/caution, protected, unknown.
- Ensure every destructive workflow is dry-run first and has explicit apply confirmation.
- Add tests proving protected paths are never removed automatically.

Default write scope:

- `src/db/**`
- `src/core/analysis/**`
- `src/core/safety/**`
- `src/services/scan-clean/**`
- safety and database tests

### Kabir Menon - Staff Systems Engineer

Role: expert in Linux, macOS, shell behavior, process execution, Docker, filesystems, and machine telemetry.

Responsibilities:

- Review all `Bun.spawn`, shell command, Docker, filesystem traversal, archive, temp, and cache cleanup logic.
- Keep macOS and Linux behavior explicit, especially around paths, permissions, symlinks, battery, CPU, memory, and Docker status.
- Prefer structured process execution over shell strings.
- Never approve broad system deletion without a scoped path, age threshold, dry-run, and review tier.

Default write scope:

- `src/platform/**`
- system status modules
- archive and optimize services
- Docker/system docs and tests

### Isha Nair - Explorer, Architecture And Flow

Role: fast codebase explorer for feature flow, dependency paths, and existing patterns.

Responsibilities:

- Answer where a behavior currently lives before implementation starts.
- Identify the smallest files to touch for a requested change.
- Find existing tests and fixtures that should be extended.
- Report conflicts with architecture docs or previous learnings.

Default output:

- Concise findings with file paths and line references.
- No file edits unless explicitly promoted to worker.

### Rohan Das - Explorer, Edge Cases And Regressions

Role: explorer focused on hidden behavior, missing parity, and failure cases.

Responsibilities:

- Check CLI/TUI parity gaps.
- Look for async flows that can fail silently.
- Inspect JSON/text output consistency and exit code behavior.
- Identify stale docs, missing hints, and confusing user flows.

Default output:

- Findings ordered by risk.
- Suggested tests and exact commands to reproduce.

### Neha Sharma - Tester And Verification Engineer

Role: owns test strategy, regression coverage, and smoke verification.

Responsibilities:

- Add or update Bun tests for every behavior change.
- Use temp homes, temp workspaces, injected clocks, and injected DB paths.
- Run `bun run check` before handoff when code changes.
- Add smoke commands for CLI/TUI parity without touching real user data.

Default write scope:

- `tests/**`
- test fixtures and seed scripts
- targeted docs for verification workflows

### Devika Sen - Manager And Learning Steward

Role: keeps task coordination, mistakes, and durable knowledge coherent.

Responsibilities:

- Own `plan.md` hygiene: status, owner, timestamps, dependencies, notes.
- Own `learnings.md`: record mistakes, gotchas, and rules that prevent repeat failures.
- Keep `docs/README.md` and the AGENTS document index current.
- Convert repeated review comments into durable coding practices.

Default write scope:

- `plan.md`
- `learnings.md`
- `AGENTS.md`
- `docs/README.md`
- planning and release docs

### Ananya Kapoor - Frontend/TUI Engineer

Role: owns OpenTUI, terminal UX, and future React/web surfaces.

Responsibilities:

- Keep dashboard layout responsive, compact, and readable in narrow and wide terminals.
- Maintain keyboard hints, toasts, loading states, confirmation states, and post-action summaries.
- Keep visual design professional without relying on color alone.
- Apply React-style state discipline where useful, and keep rendering separate from domain logic.

Default write scope:

- `src/tui/**`
- TUI formatting tests
- `docs/tui.md`
- future React/web UI files

## Subagent Collaboration Rules

- Spawn explorers for questions; spawn workers for bounded implementation.
- Give every worker a disjoint file/module ownership area.
- Tell every subagent that other agents may be editing in parallel and that it must not revert unrelated changes.
- Prefer multiple explorers only when their questions are distinct.
- Do not wait for subagents when useful local work can continue.
- Integrate subagent results through the main agent, with one final verification pass.
- If subagent advice conflicts, follow repo tests, safety rules, and existing architecture before taste.

## Recommended Architecture

Use the scalable layered architecture in [`docs/architecture.md`](docs/architecture.md).

Core rule:

- CLI and TUI code may depend on the core.
- The core must not depend on CLI or TUI code.
- Destructive filesystem actions must stay isolated behind safety/archive services.

## Bun, Node.js, And TypeScript Practices

Use Bun as the runtime, package manager, script runner, and test runner unless there is a clear reason not to.

Recommended baseline:

- TypeScript strict mode.
- ESM modules.
- `bun test` for tests.
- `bun run` scripts for local checks.
- `bun:sqlite` or a well-justified SQLite wrapper for local persistence.
- `zod` or a similar schema library for parsing config and external data.
- Small modules with explicit exports.
- No global mutable state except clearly initialized app services.

Prefer:

- `async` functions for filesystem and process-heavy work.
- Typed result objects for operations that can partially fail.
- Dependency injection for filesystem, clock, process runner, and database in testable core modules.
- Plain domain objects in `core/`, presentation models in `cli/` or `tui/`.
- Explicit units in names, for example `sizeBytes`, `cleanableBytes`, `lastScannedAt`.

Avoid:

- Shelling out when a stable Node/Bun API can do the job.
- Stringly typed status values scattered across files.
- Business logic inside command handlers.
- Direct destructive filesystem calls from UI components.
- Hidden network calls during normal scan/list/dashboard commands.

## TUI Practices

Recommended approach:

- Use OpenTUI for the rich interactive dashboard.
- Keep TUI rendering separate from domain logic.
- TUI code may emit typed intents, show confirmations, render progress, and display summaries.
- Indexing, scanning, cleaning, optimizing, archive creation, audit logging, and deletion belong in services/core.
- Use a central theme file for colors, symbols, spacing, and status labels.
- Provide non-interactive command output for scripts and CI-like usage.
- Design every destructive flow with a dry-run-first path.

TUI design rules:

- Use compact layouts that scan well.
- Keep tables aligned and readable on narrow terminals.
- Do not rely only on color to show warning or danger.
- Prefer stable keyboard shortcuts.
- Make empty states actionable without long explanations.
- Show progress for long scans and archive operations.
- Surface safety status clearly before cleanup or archive actions.

Suggested views:

- Dashboard summary.
- Project list with filters.
- Project detail.
- Scan recommendations.
- Optimize storage.
- Runtime audit.
- Settings/workspace roots.

## Safety Rules

Never remove automatically:

- `.git`
- `.env`
- `.env.*`
- database files
- uploads
- media
- assets
- migrations

Require explicit confirmation:

- Docker volumes
- SQLite databases
- generated reports
- video assets
- source deletion after archive

Safe generated-file candidates:

- `node_modules`
- `dist`
- `build`
- `.next`
- `.nuxt`
- `coverage`
- `.cache`
- `.turbo`
- `.parcel-cache`
- `__pycache__`
- `.venv`
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`
- `coverage.out`

Every destructive workflow must support `--dry-run`.
`clean` and `optimize` must default to dry-run and require `--apply --no-dry-run` for changes.
Storage optimize default apply must stay narrow: inactive indexed project generated files plus trusted tool-owned commands.
Broad `/tmp`, `~/Library/Caches`, Docker volumes, global caches, reports, media, databases, and app/system folders remain review/protected.
Any cleanup apply path must reclassify or re-check live filesystem paths before deletion and reject path escapes, project roots, missing items, caution items, protected items, and stale unsafe scan rows.

## Testing Expectations

Every agent should add or update tests when changing behavior.

Minimum expectations:

- Unit tests for pure detection, parsing, formatting, and recommendation logic.
- Integration tests for CLI commands using temporary directories and temporary DB paths.
- Snapshot-like tests only for stable terminal output.
- Tests proving destructive actions do nothing in dry-run mode.
- Tests proving protected paths are never removed automatically.
- Tests proving apply deletes only re-verified `safe` and `canAutoClean` candidates.

Recommended test fixture style:

- Build temporary project directories during tests.
- Use temporary homes, temporary DB paths, injected clocks, and generated fixtures.
- Never let tests or smoke runs touch `$HOME/.kundol/kundol.db` or real user projects.
- Avoid depending on the user's installed runtimes except in explicitly marked runtime audit tests.
- Inject time for lifecycle status and archive filename tests.

## Documentation And Knowledge Base

Use `learnings.md` for chronological discoveries.
Use `docs/` for durable knowledge-base pages.

When adding a KB page:

- Use a short lowercase filename, for example `docs/sqlite.md`.
- Include the date.
- Link related tasks from `plan.md`.
- Record the decision, rationale, and consequences.

Recommended docs:

- `docs/architecture.md`
- `docs/sqlite.md`
- `docs/tui.md`
- `docs/safety.md`
- `docs/runtime-audit.md`
- `docs/release.md`

## Code Review Checklist

Before marking a task `don`, check:

- Does this follow the Bun + TypeScript direction?
- Is core logic separated from CLI/TUI presentation?
- Are destructive actions guarded by dry-run and confirmation rules?
- Does it avoid touching real user data in tests?
- Are errors helpful and recoverable?
- Did the agent update `learnings.md` for meaningful discoveries?
- Should any durable knowledge move into `docs/`?
- Is `plan.md` status updated accurately?

## Current Stack Decision

The project is a Bun + TypeScript TUI project.

Default assumptions until changed:

- Runtime/package manager: Bun.
- Language: TypeScript.
- Storage: SQLite.
- Interface: terminal-first CLI with TUI screens where useful.
- Safety model: dry-run first, explicit confirmation for destructive actions.
