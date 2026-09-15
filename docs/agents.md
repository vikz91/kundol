# kundol Agent Guide

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-09-15 11:39:56 IST
Project type: Bun + TypeScript macOS-first CLI application

## Purpose

This file is the operating guide for agents working on kundol.
Use it together with [`plan.md`](plan.md), [`learnings.md`](learnings.md), and the other pages in this directory.

kundol is a Bun.js CLI for macOS-first storage, startup, and developer-project optimisation. Its former TUI and project-discovery commands were removed from the public CLI. Read [`context.md`](context.md) for the current code map and the documented gaps between earlier safety guidance and implemented behavior.

## Project Documents Index

- [`plan.md`](plan.md) - task ledger, statuses, dependencies, milestones, and open decisions
- [`learnings.md`](learnings.md) - chronological discoveries and implementation notes from agents
- [`README.md`](README.md) - knowledge-base index for all durable docs
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contributor setup, safety, and pull request guidance
- [`AUTHOR.md`](AUTHOR.md) - original author credit
- [`CHANGELOG.md`](CHANGELOG.md) - merged pull requests grouped by version
- [`release.md`](release.md) - version bump, merged-PR workflows, and executable release guidance
- [`architecture.md`](architecture.md) - historical architecture guidance; current module map is in `context.md`
- [`brand.md`](brand.md) - logo asset, color palette, and brand usage notes
- [`commands.md`](commands.md) - current CLI-only command surface
- [`context.md`](context.md) - implementation-grounded codebase, command, macOS scope, persistence, and safety context
- [`developer-cleanup-targets.md`](developer-cleanup-targets.md) - sourced, proposed macOS developer cleanup categories, targets, and safety strategies
- [`optimisation-registry.md`](optimisation-registry.md) - versioned JSON catalogue, validation, and contribution rules
- [`demo/seed-demo-workspace.md`](demo/seed-demo-workspace.md) - fake Node, Python, and Go workspace generator for project optimiser testing
- [`demo/docker-sandbox.md`](demo/docker-sandbox.md) - disposable first-time Docker testing with fake project, storage, Docker, and startup fixtures
- [`dependencies.md`](dependencies.md) - Bun/npm dependencies, optional packages, and system tools
- [`docker.md`](docker.md) - planned Docker inventory and targeted cleanup design; current implementation is described in `context.md`
- [`launch.md`](launch.md) - open-source launch supply chain and community plan
- [`product-goal.md`](product-goal.md) - main goal, product shape, worker model, runtime scope, and future roadmap
- [`project-runtimes.md`](project-runtimes.md) - supported project runtimes, markers, cleanup candidates, and runtime workflows
- [`storage-config.md`](storage-config.md) - user-scoped database, workspace config, and ignore pattern decisions
- [`storage-optimizer.md`](storage-optimizer.md) - historical storage optimiser design, with several targets differing from current code
- [`user-flow.md`](user-flow.md) - historical first-run and dashboard flow
- [`viral-launch.md`](viral-launch.md) - low-cost viral OSS launch pattern research
- [`workflows/implementation-wave-001.md`](workflows/implementation-wave-001.md) - first multi-agent implementation wave notes

Agents should treat this section as the starting index.
When a new durable doc is added under `docs/`, add it here and to `docs/README.md`.

## Codex Operating Loop

This repo is optimized for Codex-driven coding with short-lived specialist agents.
The main agent owns integration quality and should keep the critical path local while delegating bounded, independent work to subagents.

Default loop for every coding task:

1. Read `docs/agents.md`, then inspect the touched area with `rg`, `sed`, and tests before editing.
2. Decide whether subagents help. Use them for parallel exploration, focused implementation slices with disjoint files, or verification.
3. State the intended edit before modifying files.
4. Keep CLI, docs, and tests in parity when a feature changes user behavior.
5. Run `bun run check` unless the change is documentation-only. For doc-only changes, run targeted checks such as link/path inspection when useful.
6. Update `docs/learnings.md` for any mistake, gotcha, product decision, or reusable implementation rule.
7. Leave the worktree understandable: no hidden generated files, no unrelated refactors, no reverted user work.

Codex-specific rules:

- Use `apply_patch` for hand edits.
- Use `rg` before broad file reads.
- Batch independent reads and inspect each result.
- Do not run destructive cleanup commands against the user's real home or projects during tests.
- Prefer temp homes, temp workspaces, injected clocks, and injected DB paths in tests.
- Keep output and exit code behavior consistent across interactive and non-interactive CLI runs.
- If a spawned subagent edits code, assign a disjoint write scope and tell it not to revert other work.

## Current Implemented Surfaces

As of 2026-09-15, the implemented public app is CLI-only.
Agents must account for these surfaces when changing behavior:

- Bare `kundol` prints a welcome banner; the public group is British-spelled `optimise`.
- CLI subcommands: `optimise storage`, `optimise startup`, `optimise projects <workdir>`, and `optimise repos <workdir>`.
- Every optimise run scans and prints a plan. Storage/projects/repos ask `[y/N]`; startup asks for safe user LaunchAgent numbers. `-f` skips that prompt after planning.
- `repos` currently calls the same scanner and cleanup handler as `projects`, without Git filtering.
- Session audit logs live under `$HOME/.kundol/sessions`; SQLite `actions` rows record scans, cancellations, and optimise results.
- Retained indexing, registry, scan/clean, and archive modules have no public command, though storage apply can use previously persisted scan rows.

Do not revive cancelled MVP scope such as broad compact/archive commands, latest-version network lookup, daemon behavior, or Docker volume purge unless the user asks or `docs/plan.md` gets a new task.

## Required Coordination Loop

Before starting work:

1. Read `docs/plan.md`.
2. Read `docs/product-goal.md`.
3. Pick a task whose dependencies are complete or not blocking.
4. Update that task status to `in progress`, set `Owner`, and set `Started at`.
5. Read `docs/learnings.md`, `docs/README.md`, and relevant docs under `docs/`.

Do not start a task already marked `in progress` unless the user explicitly asks you to continue it.

While working:

1. Keep changes scoped to the selected task.
2. Add discoveries, tradeoffs, and gotchas to `docs/learnings.md`.
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

- Check interactive/non-interactive CLI behavior gaps.
- Look for async flows that can fail silently.
- Inspect text output consistency and exit code behavior.
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
- Add smoke commands for interactive/non-interactive CLI parity without touching real user data.

Default write scope:

- `tests/**`
- test fixtures and seed scripts
- targeted docs for verification workflows

### Devika Sen - Manager And Learning Steward

Role: keeps task coordination, mistakes, and durable knowledge coherent.

Responsibilities:

- Own `docs/plan.md` hygiene: status, owner, timestamps, dependencies, notes.
- Own `docs/learnings.md`: record mistakes, gotchas, and rules that prevent repeat failures.
- Keep `docs/README.md` and the AGENTS document index current.
- Convert repeated review comments into durable coding practices.

Default write scope:

- `docs/plan.md`
- `docs/learnings.md`
- `docs/agents.md`
- `docs/README.md`
- planning and release docs

### Ananya Kapoor - Frontend/TUI Engineer (future UI)

Role: owns OpenTUI, terminal UX, and future React/web surfaces.

Responsibilities:

- Keep dashboard layout responsive, compact, and readable in narrow and wide terminals.
- Maintain keyboard hints, toasts, loading states, confirmation states, and post-action summaries.
- Keep visual design professional without relying on color alone.
- Apply React-style state discipline where useful, and keep rendering separate from domain logic.

Default write scope:

- `src/tui/**`
- TUI formatting tests
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

Use the current source map in [`context.md`](context.md). [`architecture.md`](architecture.md) records earlier layered architecture guidance, including removed TUI surfaces.

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

This section is historical guidance from the removed dashboard. It is not an instruction to add OpenTUI or restore TUI parity to the current CLI.

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
- `.pytest_cache`
- `.mypy_cache`
- `.ruff_cache`
- `coverage.out`

The public CLI uses scan-plan-confirm (or `-f`) and does not expose `--dry-run`, `--apply`, or `--no-dry-run`.
Earlier narrow-storage guidance is a policy goal, not a description of current code: storage currently auto-selects all old top-level `os.tmpdir()` entries and broad Docker system prune without volumes. See [`context.md`](context.md) before modifying this workflow.
Docker volumes remain excluded from storage apply. Reports, media, databases, and app/system folders remain protected from automatic project cleanup. `~/Library/Caches` is review-only in the current storage plan.
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

Use `docs/learnings.md` for chronological discoveries.
Use `docs/` for durable knowledge-base pages.

When adding a KB page:

- Use a short lowercase filename, for example `docs/sqlite.md`.
- Include the date.
- Link related tasks from `docs/plan.md`.
- Record the decision, rationale, and consequences.

Recommended docs:

- `docs/architecture.md`
- `docs/sqlite.md`
- `docs/context.md`
- `docs/safety.md`
- `docs/runtime-audit.md`
- `docs/release.md`

## Code Review Checklist

Before marking a task `don`, check:

- Does this follow the Bun + TypeScript direction?
- Is core logic separated from CLI presentation?
- Do destructive actions follow scan-plan-confirm (or `-f`) and applicable live safety checks?
- Does it avoid touching real user data in tests?
- Are errors helpful and recoverable?
- Did the agent update `docs/learnings.md` for meaningful discoveries?
- Should any durable knowledge move into `docs/`?
- Is `docs/plan.md` status updated accurately?

## Current Stack Decision

The project is a Bun + TypeScript CLI project.

Default assumptions until changed:

- Runtime/package manager: Bun.
- Language: TypeScript.
- Storage: SQLite.
- Interface: terminal-first CLI.
- Safety model: scan and printed plan first, explicit confirmation or selection unless `-f` is used.
