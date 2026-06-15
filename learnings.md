# kundol Learnings

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-06-14 01:08:32 IST  

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

### 2026-06-13 07:35:11 IST

- Launch strategy planning was split across subagents for GitHub/open-source launch, branding/community, and YouTube/Instagram content.
- Durable launch supply-chain guidance now lives in `docs/launch.md`.
- Recommended launch posture: keep `kundol` as the open-source CLI identity, center safety/local-first trust, and frame future paid cloud services as optional remote/team visibility rather than required value.

### 2026-06-13 08:34:17 IST

- Successful OSS launch research was split across explorer subagents covering terminal/devtools, open-core infrastructure, and creator-led viral launches.
- Durable research synthesis now lives in `docs/viral-launch.md`.
- Extracted kundol launch wedge: find forgotten local projects and safely reclaim dev disk space without deleting code by default.
- Lowest-cost strategy: HN/GitHub first, real terminal demos, maintainer presence in comments, fast support, starter issues for runtime/cleanup gaps, and a 12-week content loop.
