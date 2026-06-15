# kundol Agent Guide

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-06-14 01:08:32 IST  
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
- [`docs/commands.md`](docs/commands.md) - narrowed MVP command surface and later command groups
- [`docs/dependencies.md`](docs/dependencies.md) - Bun/npm dependencies, optional packages, and system tools
- [`docs/docker.md`](docs/docker.md) - Docker monitoring, analysis, purge workflows, and safety rules
- [`docs/product-goal.md`](docs/product-goal.md) - main goal, product shape, worker model, runtime scope, and future roadmap
- [`docs/project-runtimes.md`](docs/project-runtimes.md) - supported project runtimes, markers, cleanup candidates, and runtime workflows
- [`docs/storage-config.md`](docs/storage-config.md) - user-scoped database, workspace config, and ignore pattern decisions
- [`docs/user-flow.md`](docs/user-flow.md) - install, init, first index, dashboard, review, project scan, cleanup, and daemon flow

Agents should treat this section as the starting index.
When a new durable doc is added under `docs/`, add it here and to `docs/README.md`.

## Required Coordination Loop

Before starting work:

1. Read `plan.md`.
2. Read `docs/product-goal.md`.
3. Pick a task whose dependencies are complete or not blocking.
4. Update that task status to `in progress`, set `Owner`, and set `Started at`.
5. Read `learnings.md`, `docs/README.md`, and relevant docs under `docs/`.

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

Use datetime format: `YYYY-MM-DD HH:mm:ss IST`.

## Subagents

### Project Manager Agent

Role: coordinate the subagents and keep project knowledge coherent.

Responsibilities:

- Own `plan.md` hygiene.
- Assign or suggest task ownership.
- Resolve dependency order.
- Detect duplicate or conflicting work.
- Keep `learnings.md` current.
- Create and organize knowledge-base docs under `docs/`.
- Convert recurring discoveries into coding practices.
- Review whether task statuses and timestamps are accurate.

Default task types:

- Planning, task breakdown, release checklists, documentation structure, risk tracking, coordination notes.

### Fullstack Developer Agent 1: Core CLI And Data

Role: build the command framework, persistence, migrations, and core business logic.

Responsibilities:

- Bun CLI entrypoint and command routing.
- SQLite schema, migrations, and repositories.
- Project discovery and registry queries.
- Configuration loading and first-run behavior.
- Tests around data correctness and command behavior.

Default task types:

- `KUN-002` through `KUN-020`, database-backed features, integration tests.

### Fullstack Developer Agent 2: Analysis And Safety

Role: build cleanup analysis, recommendation logic, archive workflows, and safety guardrails.

Responsibilities:

- Cleanup safety policy.
- Generated artifact detection.
- Recoverable size calculation.
- Recommendation engine.
- Compact/archive dry-run and execution flows.
- Tests for destructive-action prevention.

Default task types:

- `KUN-025` through `KUN-032`, `KUN-037` through `KUN-042`, safety tests.

### Fullstack Developer Agent 3: Runtime And Product Extensions

Role: build runtime audit, tags/notes, future health features, and integration polish.

Responsibilities:

- Runtime version detection.
- Latest version lookup and offline behavior.
- Tag and note workflows.
- Git insights and future health score groundwork.
- Packaging and release ergonomics.

Default task types:

- `KUN-033` through `KUN-036`, `KUN-043`, `KUN-044`, release tasks, future backlog spikes.

### Terminal UI Designer Agent

Role: design and implement the terminal user experience.

Responsibilities:

- TUI layout, navigation, visual hierarchy, and interaction states.
- Table design for project registry output.
- Dashboard design.
- Keyboard shortcuts and command discoverability.
- Empty states, loading states, error states, and confirmation flows.
- Accessibility in terminal contexts: color contrast, no color-only meaning, readable symbols.

Default task types:

- Dashboard UI, list/search output, project scan/clean presentation, confirmation prompts, design QA.

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

- Use React-style terminal UI if the chosen stack supports it cleanly, for example Ink.
- Keep TUI components pure where practical.
- Keep terminal rendering separate from domain logic.
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
- Analyze recommendations.
- Runtime audit.
- Compact/archive confirmation.
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
`compact` must default to dry-run.

## Testing Expectations

Every agent should add or update tests when changing behavior.

Minimum expectations:

- Unit tests for pure detection, parsing, formatting, and recommendation logic.
- Integration tests for CLI commands using temporary directories and temporary DB paths.
- Snapshot-like tests only for stable terminal output.
- Tests proving destructive actions do nothing in dry-run mode.
- Tests proving protected paths are never removed automatically.

Recommended test fixture style:

- Build temporary project directories during tests.
- Avoid depending on the real home directory.
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
