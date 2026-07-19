# kundol Learnings

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-06-16 15:39:39 IST  

This file is the chronological learning log for agents working on kundol.
Add discoveries, decisions, implementation gotchas, and useful references here as work progresses.

## Entries

### 2026-06-13 07:21:12 IST

- The project is confirmed as a Bun + TypeScript terminal UI project.
- The source product context uses the name `DevShelf`, while the repository/project name is `kundol`.
- Coordination should happen through `plan.md`; durable knowledge should be written under `docs/`.
- Agent task statuses are `todo`, `in progress`, `don`, and `cancelled`.

### 2026-06-13 07:24:10 IST

- Architecture guidance was promoted into `docs/architecture.md`.
- `agents.md` now acts as the starting index for project coordination docs.
- Scalable direction: CLI/TUI presentation depends on core services; core logic stays independent of presentation and isolates destructive filesystem behavior behind safety/archive modules.

### 2026-06-13 07:25:45 IST

- Supported runtime families expanded to JavaScript runtimes, Python, Go, Rust, Unity3D, .NET, and Java.
- Runtime workflow knowledge now lives in `docs/project-runtimes.md`.
- Agents must keep runtime markers, generated files, caution files, protected files, and cleanup workflows in sync with implementation.

### 2026-06-13 07:29:15 IST

- Docker monitoring and cleanup is now a first-class product area.
- Docker resource knowledge lives in `docs/docker.md`.
- Docker purge workflows must be dry-run first, targeted, explicit, and especially conservative around named volumes, running containers, mounted volumes, Compose resources, and broad prune commands.

### 2026-06-13 07:30:45 IST

- Bun dependency guidance now lives in `docs/dependencies.md`.
- Initial recommended runtime dependencies are `commander`, `zod`, `ink`, and `react`.
- Initial recommended dev dependencies are `typescript` and `@types/react`.
- Prefer Bun built-ins for SQLite, tests, scripts, filesystem/process adapters, and package management before adding more packages.

### 2026-06-13 08:34:13 IST

- Main goal clarified: kundol is a Bun.js CLI/TUI app with non-AI workers that scan workspace folders and identify user-created projects.
- Current runtime analysis scope is JavaScript/TypeScript, Java, .NET, Python, Rust, and Go.
- iOS and Android are future roadmap runtime analyzers.
- Docker remains an adjacent monitored resource capability, not the core product identity.

### 2026-06-13 17:15:01 IST

- First-run user flow captured in `docs/user-flow.md`.
- After one-time indexing, the app should show a first dashboard, then guide users into project review, analyze, dry-run cleanup/compact, runtime health, and optional background monitoring.
- Background monitoring should update metadata only and must never clean, archive, delete, or purge in the background.

### 2026-06-14 00:33:03 IST

- MVP command surface is now documented in `docs/commands.md`.
- `kundol` opens the main TUI; `init`, `index`, `dashboard`, `list`, `show`, `scan <project>`, `clean`, `runtimes`, and `config` form the narrowed MVP set.
- Search is consolidated into `kundol list --search <query>` instead of a standalone `search` command.
- Docker, daemon, archive/compact, doctor, git insights, notes/tags subcommands, duplicates, and reports are later command groups.

### 2026-06-14 00:38:01 IST

- Began hardening commands one by one.
- `kundol` default command now has a dedicated spec in `docs/commands/default-tui.md`.
- `kundol init` now has a dedicated spec in `docs/commands/init.md`.
- Init must not accept broad roots like `/` or `~`, must not overwrite config without `--force`, and must not mutate workspace project files.

### 2026-06-14 00:42:22 IST

- The workspace discovery command now has a dedicated hardened spec in `docs/commands/index.md`.
- Index is explicitly metadata-only: it reads workspaces and writes kundol registry metadata, but never modifies project files.
- Index should tolerate partial failures, skip generated directories during traversal, avoid symlink traversal by default, and reject broad roots like `/` and `~`.

### 2026-06-14 00:48:12 IST

- Storage model initially decided as one user-scoped SQLite database at `$HOME/.kundol.db`; this path was superseded below by `$HOME/.kundol/kundol.db`.
- kundol does not create separate databases per workspace folder.
- Config initially described workspace roots plus ignore patterns/paths; this was refined below to workspace roots plus user-excluded project/workspace paths.

### 2026-06-14 00:56:24 IST

- Storage model refined: use `$HOME/.kundol/kundol.db` instead of a loose `$HOME/.kundol.db` file.
- Config should live inside SQLite tables in the same DB: settings, workspaces, and excluded paths.
- User ignore/exclusion means whole project/workspace paths to skip, for example `$HOME/Projects/sensitive-project`, not generated folders inside a project.

### 2026-06-14 01:08:32 IST

- Customer-facing command vocabulary refined: `index` means broad workspace discovery, `scan <project>` means deep inspection, and `clean <project>` means cleanup preview/apply.
- The previous workspace `kundol scan` command is now `kundol index`.
- The previous `kundol analyze <project>` concept is now `kundol scan <project>`.
- `kundol init` should collect config first, then optionally run the first `kundol index`.

### 2026-06-15 00:00:00 IST

- Added `scripts/seed-demo-workspace.ts` to generate fake Node.js, Python, and Go workspaces for manual kundol CLI testing.
- Demo projects keep source files small while adding roughly 1MB+ generated/deletable artifacts per project.

### 2026-06-15 15:21:12 IST

- Implementation wave 001 is split across foundation/CLI work, SQLite/config work, and pure discovery core work.
- Discovery DB wiring, registry, scan, and cleanup execution should stay behind the shared scaffold, command registry, schema, migrations, config access layer, and repository contract to avoid duplicate abstractions.
- Coordination details live in `docs/workflows/implementation-wave-001.md`.

### 2026-06-13 07:35:11 IST

- Launch strategy planning was split across subagents for GitHub/open-source launch, branding/community, and YouTube/Instagram content.
- Durable launch supply-chain guidance now lives in `docs/launch.md`.
- Recommended launch posture: keep `kundol` as the open-source CLI identity, center safety/local-first trust, and frame future paid cloud services as optional remote/team visibility rather than required value.

### 2026-06-13 08:34:17 IST

- Successful OSS launch research was split across explorer subagents covering terminal/devtools, open-core infrastructure, and creator-led viral launches.
- Durable research synthesis now lives in `docs/viral-launch.md`.
- Extracted kundol launch wedge: find forgotten local projects and safely reclaim dev disk space without deleting code by default.
- Lowest-cost strategy: HN/GitHub first, real terminal demos, maintainer presence in comments, fast support, starter issues for runtime/cleanup gaps, and a 12-week content loop.

### 2026-06-15 15:23:03 IST

- Added the initial Bun package scaffold with strict TypeScript, Commander command routing, and CLI skeleton tests.
- Command handlers were initially scaffolded, then wired to DB, discovery, analysis, registry, runtime, and cleanup services during the 2026-06-15 integration pass.
- `bun run check` now passes after CLI wiring and strictness fixes.

### 2026-06-15 15:23:42 IST

- Added cleanup safety core modules under `src/core/safety` with explicit `safe`, `caution`, `protected`, and `unknown` classifications.
- Added project cleanup analysis under `src/core/analysis`; it scans project-local paths, aggregates total/safe/caution/protected/unknown bytes, and never deletes anything.
- Added recommendation generation under `src/core/recommendations`; MVP recommendations include `kundol clean <project>` preview, caution review, inactive archive follow-up, and no-op messaging.
- Databases, environment files, source, migrations, lockfiles/manifests, uploads/media, assets, and `.git` are protected from automatic cleanup in code.

### 2026-06-15 15:25:17 IST

- Added core discovery modules for runtime marker detection, project type inference, traversal skip rules, directory size calculation, Git metadata collection, and the reusable index worker facade.
- Runtime detection now covers Node.js, Bun, Deno, Python, Go, Rust, Java, .NET, and Git-only projects while preserving mixed-runtime results.
- Git metadata collection is read-only; dirty status requires an injected process runner so tests and future workers can control shell access.
- Discovery traversal treats user exclusions as exact paths and generated/internal directories as built-in performance skips.
- Discovery modules satisfy the scaffold's strict TypeScript settings, including `exactOptionalPropertyTypes` and unchecked indexed access.

### 2026-06-15 15:25:15 IST

- Implemented the first SQLite persistence foundation with Bun `bun:sqlite`, an idempotent migration ledger, and typed repositories for config, projects, scans, and actions.
- Config loading/saving accepts an injected database path for tests and future command wiring, so tests do not touch `$HOME/.kundol/kundol.db`.
- First-run config behavior is intentionally conservative: a database can exist with migrations applied, but kundol is not considered initialized until at least one workspace is configured.

### 2026-06-15 15:47:51 IST

- Added registry query helpers under `src/core/registry` that operate on `ProjectRepository.list()`-compatible sources, keeping list/show/dashboard behavior independent from CLI command wiring.
- Registry list filtering now covers status, runtime, search, tag, and sort; tag filtering is conservative while the tag repository is incomplete and returns no rows with a warning unless an injectable tag resolver is provided.
- Dashboard summary is derived from project registry fields: counts by status, total size bytes, cleanable bytes, and configurable top space consumers.

### 2026-06-15 15:47:53 IST

- Added lifecycle status inference in `src/core/projects/lifecycle.ts` with conservative thresholds: new within 14 days, active within 30 days of last modification, paused within 120 days, stale after that, archived preserved, and missing paths marked deleted.
- Added `runWorkspaceIndex` in `src/services/indexing/index-service.ts` as the command-facing service dependency for `kundol index`; it loads configured workspaces/exclusions, runs `runIndexWorker`, upserts project registry metadata, marks missing scoped projects as `DELETED`, and records one `INDEX` action with summary details.
- Index service tests use injected database paths, clocks, and process runners so workspace indexing remains deterministic and does not touch the user's real home database.

### 2026-06-15 15:48:40 IST

- Added scan-clean services under `src/services/scan-clean` so future CLI/TUI wiring can call scan and clean workflows without putting persistence or deletion logic in command handlers.
- `scanProjectService` resolves an indexed project by id, name, or path, runs the existing cleanup analyzer/recommendation engine, persists `project_scans` and `scan_items`, updates project scan metadata through the scan repository, and logs `PROJECT_SCAN`.
- `cleanProjectService` uses the latest/current persisted scan, defaults to dry-run, logs `CLEAN_DRY_RUN`, and only deletes persisted safe auto-clean generated artifacts on explicit apply after reclassifying the current filesystem path.
- Focused scan-clean tests use temporary projects and temporary database paths.

### 2026-06-15 15:51:28 IST

- MVP CLI actions are now wired for `init`, `index`, `dashboard`, `list`, `show`, `scan`, `clean`, `runtimes`, and `config`.
- `clean <project>` is the MVP destructive workflow and defaults to dry-run; archive/compact and latest-version runtime checks were cancelled for MVP and moved to future scope.
- Added `TagRepository` for `tags` and `project_tags`, closing the persistence layer gap.
- Full `bun run check` passed with 45 tests before final bookkeeping; demo smoke flow passed using a temporary HOME and seeded workspace.

### 2026-06-15 16:12:24 IST

- Added `@opentui/core` as the default rich-dashboard renderer for interactive `kundol` launches.
- The default command now gates OpenTUI behind TTY/CI checks and falls back to the existing Chalk welcome plus plain dashboard output for scripts, pipes, and renderer failures.
- The OpenTUI dashboard builds a pure registry summary model first, so native renderer behavior can stay out of normal unit tests.

### 2026-06-15 16:45:36 IST

- Added a small OpenTUI animation clock inside `src/tui/opentui-dashboard.ts` for startup, shutdown, and active async command states.
- TUI-triggered `index`, `scan`, cleanup dry-run, and runtime checks now set an action-specific spinner message while work is in progress and push a compact toast when the async task finishes or fails.
- The toast/status behavior is presentation-only; server-friendly commands such as `kundol dashboard`, `kundol list --json`, and `kundol scan --json` remain stdout-oriented and non-interactive.

### 2026-06-15 16:58:52 IST

- The demo seeder now writes visible 1KB files inside fake Node dependency packages, not only large hidden cache blobs under `node_modules/.cache`.
- Re-running the seeder on an existing folder appends/overwrites seeded files but does not clear unrelated existing projects; `/tmp/kundol-demo` may contain older demo projects unless the folder is cleaned outside kundol.
- Dashboard top-project caps were raised to 8 for both OpenTUI and plain CLI dashboard output so seeded workspaces with 6-7 projects do not look like only two projects were indexed.

### 2026-06-15 17:06:44 IST

- `clean --apply --no-dry-run` now creates a local `.tar.gz` archive before deleting generated artifacts when the project folder access/modified age is greater than `archive.beforeCleanDays`.
- The archive threshold defaults to 15 days and is stored in the generic settings table; CLI users can update it with `kundol config --archive-before-clean-days <days>`.
- OpenTUI config view now exposes the archive threshold with `+`/`-` editing and `v` save, while the config command remains usable in server/stdout-only environments.

### 2026-06-15 17:10:40 IST

- OpenTUI now samples local machine status for a bottom one-row bar: compact local time/UTC offset, machine tag, selected project directory, Git branch, memory percent, CPU percent, battery percent where available, and Docker engine/running-container status.
- `KUNDOL_MACHINE_TAG` and `KUNDOL_NODE_TAG` are supported as future-friendly node labels for multi-instance/cloud status views; hostname remains the fallback.
- The status bar uses emoji-led segments with gaps on wide terminals and a compact shortened fallback on narrow terminals, preserving the one-row height without overlapping values.

### 2026-06-15 17:21:03 IST

- `kundol list --scanned --search <query>` is the focused path for finding projects that have completed scan metadata.
- Cleanup dry-run output should always show `kundol clean <project> --apply --no-dry-run` so users understand that preview and execution are separate actions.

### 2026-06-15 17:26:14 IST

- Dashboard project listing now mirrors CLI list discovery with typed `/` search, `t` scanned-only filtering, `o` sort cycling, and `x` clear filters.
- Dashboard views should keep CLI-equivalent hints visible, especially for server-friendly `--json` output and explicit cleanup apply commands.

### 2026-06-15 21:37:29 IST

- Selected the cleaner rounded-square `K` logo over the later folder-heavy refinement and stored it at `assets/logo.png`.
- Added `docs/brand.md` so README, launch, and social assets reuse the same logo and color direction.

### 2026-06-15 21:39:50 IST

- Added per-run plain text session audit logs under `$HOME/.kundol/sessions/`.
- Session log lines use `timestamp : device-name : action : project-name`; project name is `-` when the action is not project-specific.
- The existing SQLite `actions` table remains the durable structured project-event store, while session logs are lightweight run-level audit trails.

### 2026-06-15 21:51:27 IST

- Planned a future one-click storage optimizer in `docs/storage-optimizer.md`.
- Default safe cleanup should stay narrow: indexed project generated files, `pnpm store prune`, `yarn cache clean`, `npm cache verify`, and targeted Docker cleanup without volumes.
- `/tmp`, system junk, Docker named volumes, global language caches, and force-clean operations should be review-only until stronger safety rules exist.

### 2026-06-15 23:30:51 IST

- Added the first OpenTUI Optimize storage flow: `u` runs a dry-run preview, and `y` applies selected safe cleanup only after preview.
- Optimize apply excludes `/tmp`, `~/Library/Caches`, Docker volumes, and other review/protected candidates; those are visible in the dashboard for awareness only.

### 2026-06-16 03:02:06 IST

- Added an animated ASCII labrador progress pet for OpenTUI dashboard work states: index, project scan, cleanup dry-run preview, and storage optimize.
- The pet is generated by a pure frame helper and rendered from dashboard state only; scan, cleanup, indexing, and optimizer services remain outside TUI renderables.
- Cursor-following is deferred because the current OpenTUI dashboard handles keyboard events only; enable it later only after adding mouse/cursor event support.
- Changed the hidden labrador demo to a dashboard-only `command+q` / `ctrl+q` hotkey instead of a CLI command; plain `q`, `escape`, and `ctrl+c` remain dashboard quit paths.
- Reworked the pet from a centered splash-style modal into a fixed dashboard activity panel under status, with a cleaner side-profile ASCII frame and idle state.

### 2026-06-16 03:06:06 IST

- Refreshed `AGENTS.md` for Codex-driven coding with a named Indian subagent roster: staff engineers, systems engineer, explorers, tester, learning manager, and TUI/frontend engineer.
- Future agents should use the roster for clear ownership, especially CLI/TUI parity, system cleanup safety, test isolation, and learning capture.
- Added stronger guidance that tests and smoke runs must use temp homes/DBs and never touch the user's real `$HOME/.kundol/kundol.db` or real projects.

### 2026-06-16 03:21:38 IST

- OpenTUI can fail buffer allocation on very wide terminals; cap the dashboard root render width before handing layout to OpenTUI.
- TUI render failures should destroy the renderer and reject back to the CLI fallback instead of dumping escape sequences and leaving terminal focus/mouse reporting enabled.
- Wide-terminal smoke testing can be done with `stty cols 318 rows 40; KUNDOL_OPENTUI_DEMO_MS=500 bun run dev`.

### 2026-06-16 05:24:08 IST

- Product direction shifted to CLI-only: no dashboard/TUI as a user-facing surface.
- New cleanup command vocabulary uses British spelling and grouped commands: `kundol optimise storage`, `kundol optimise projects <workdir>`, and `kundol optimise repos <workdir>`.
- The target optimise flow has no `--dry-run`, `--apply`, or `--no-dry-run` flags. Each run scans, prints a plan, confirms unless `-f, --force` is provided, executes only safe cleanup, prints a final report, and audits.
- Existing TUI docs are historical only; future implementation should migrate reusable scan/safety/reporting logic into CLI workflows rather than adding dashboard parity.

### 2026-06-16 05:27:56 IST

- `optimise projects <workdir>` service cleanup should use a narrow generated-artifact allowlist plus the shared safety policy; review-only paths such as virtualenvs, `.tox`, `.nox`, reports, `vendor`, databases, assets, uploads, media, migrations, `.env*`, and `.git` must never become default apply targets.
- Project cleanup apply must re-check the live filesystem path immediately before deletion, including path containment, type stability, symlink rejection, realpath dedupe, and safe auto-clean classification.

### 2026-06-16 05:34:10 IST

- The public optimise CLI exposes only `-f, --force`; max depth is fixed at 7 for `projects` and `repos`, and JSON/dry-run/apply flags are intentionally absent.
- Storage optimisation now includes safe package-cache commands, Docker system prune without volumes, and old top-level temp entries that are rechecked before removal; Docker volumes remain protected.
- Dashboard/TUI code, tests, docs, and dependencies were removed from the active product surface. Future UI work should be a new product decision, not a compatibility obligation.

### 2026-06-16 15:39:39 IST

- `optimise startup` is macOS-first: it scans user LaunchAgents, system LaunchAgents/LaunchDaemons, and app Login Items.
- Only non-Apple user LaunchAgents under `~/Library/LaunchAgents` are safe automatic disable candidates. System paths, Apple-labelled items, and app Login Items are review/protected and are not disabled by `-f`.
- Startup optimisation disables items with `launchctl bootout` plus `launchctl disable`; it does not delete plist files.
