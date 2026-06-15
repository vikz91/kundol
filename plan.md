# kundol Project Plan

Created: 2026-06-13 07:18:52 IST  
Last updated: 2026-06-15 23:30:51 IST  
Project codename: kundol  
Product concept name from source context: DevShelf  

## Agent Status Rules

Allowed task statuses:

- `todo` - default status before work starts
- `in progress` - agent is actively working on this task
- `don` - task is complete; intentionally matching the requested status spelling
- `cancelled` - task is intentionally skipped or no longer needed

When an agent starts work, update `Status`, `Owner`, and `Started at`.
When an agent finishes, update `Status`, `Completed at`, and `Notes`.
Use datetime format: `YYYY-MM-DD HH:mm:ss IST`.

## Product Direction

kundol is a Bun.js CLI/TUI app with non-AI workers that index workspace folders and identify user-created projects: servers, web apps, libraries, CLIs, experiments, mixed-runtime repos, and other developer-created codebases.
It stores project metadata in SQLite, analyzes disk usage and runtime/toolchain signals, recommends safe cleanup, audits local runtimes, and supports dry-run-first cleanup workflows.

Current runtime analysis scope: JavaScript/TypeScript, Java, .NET, Python, Rust, and Go.
Future runtime roadmap: iOS and Android.
Docker monitoring is an adjacent capability, not the core product identity.

The pasted context originally named the product `DevShelf`; the MVP now uses `kundol` for the repository, CLI binary, and package name.

## MVP Milestones

1. Establish project foundation and decisions.
2. Implement SQLite-backed registry.
3. Implement workspace configuration and non-AI worker-driven workspace indexing.
4. Implement dashboard/list/show commands and list search filters.
5. Implement cleanup analysis and recommendations.
6. Implement runtime audit.
7. Implement safe dry-run-first cleanup workflow.
8. Add tests, documentation, and release packaging.

## Task Ledger

| ID | Milestone | Task | Status | Owner | Created at | Started at | Completed at | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|
| KUN-001 | Foundation | Decide final product name, CLI binary name, and package name (`kundol`, `devshelf`, or both). | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | none | Decided MVP identity is `kundol` for repo, CLI binary, and package name; `DevShelf` remains only historical source context. |
| KUN-002 | Foundation | Choose implementation stack and CLI framework. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-13 07:21:12 IST | 2026-06-13 07:21:12 IST | KUN-001 | Stack direction set by user: Bun + TypeScript TUI project. CLI/TUI framework still to be chosen during implementation. |
| KUN-003 | Foundation | Initialize repository structure, Bun package setup, TypeScript config, formatter, test scripts, and basic CI-ready scripts. | don | Fullstack Developer Agent 1 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:03 IST | KUN-002 | Added Bun package scaffold, strict TypeScript config, package scripts, `.gitignore`, README scaffold notes, lockfile, and CLI skeleton tests. Full `bun run check` now passes after discovery strictness fixes. |
| KUN-004 | Foundation | Create initial Bun CLI entrypoint with help output and command routing. | don | Fullstack Developer Agent 1 + Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:51:28 IST | KUN-003 | Added Commander entrypoint and wired MVP commands for `init`, `index`, `dashboard`, `list`, `show`, `scan`, `clean`, `runtimes`, and `config`. |
| KUN-005 | Data | Define SQLite schema for `projects`, `tags`, `project_tags`, `actions`, settings, workspaces, and excluded paths. | don | Fullstack Developer Agent 2 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:26 IST | 2026-06-15 15:25:15 IST | KUN-003 | Added initial SQLite schema with config, project registry, tags, action audit, project scan, and scan item tables. |
| KUN-006 | Data | Implement database initialization and migrations. | don | Fullstack Developer Agent 2 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:26 IST | 2026-06-15 15:25:15 IST | KUN-005 | Implemented Bun `bun:sqlite` client, parent directory creation, migration ledger, and idempotent migration runner. |
| KUN-007 | Data | Implement repository functions for projects, tags, project tags, and action audit logs. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-006 | Added typed repositories for projects, tags/project_tags, scans, settings, workspaces, excluded paths, and action audit logs. |
| KUN-008 | Config | Define workspace/settings configuration tables and access patterns. | don | Fullstack Developer Agent 2 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:26 IST | 2026-06-15 15:25:15 IST | KUN-002 | Added typed repositories for settings, workspaces, excluded paths, projects, scans, and action audit entries. |
| KUN-009 | Config | Implement config load/save and default first-run behavior. | don | Fullstack Developer Agent 2 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:26 IST | 2026-06-15 15:25:15 IST | KUN-008 | Added config load/save helpers with injected DB path support; first-run stays uninitialized until a workspace exists. |
| KUN-010 | Discovery | Implement project marker detection for `.git` and supported runtime markers. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-004, KUN-007 | Added `src/core/discovery/markers.ts` with KB-backed markers for Node/Bun/Deno, Python, Go, Rust, Java, .NET, and Git, including Bun hints from `package.json`. |
| KUN-011 | Discovery | Implement recursive workspace indexing through non-AI index workers with sensible traversal rules. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-009, KUN-010 | Added traversal with built-in generated/internal folder skips, exact excluded-path handling, symlink skipping, partial-failure warnings, and a reusable `runIndexWorker` facade. |
| KUN-012 | Discovery | Implement project type inference for JS runtimes, Java, .NET, Python, Rust, Go, Git-only, and mixed projects. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-010 | Added deterministic type inference that preserves all detected runtimes, supports Git-only projects, and chooses a primary display runtime. |
| KUN-013 | Discovery | Implement directory size calculation. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-011 | Added resilient recursive directory size calculation with symlink skipping and warning collection for unreadable paths. |
| KUN-014 | Discovery | Implement Git metadata collection: remote, branch, dirty flag, modified time. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-011 | Added read-only Git metadata collection for `.git` dirs/files, branch, origin remote, Git mtime, and optional dirty status through an injected process runner. |
| KUN-015 | Discovery | Implement lifecycle status inference: `NEW`, `ACTIVE`, `PAUSED`, `STALE`, `ARCHIVED`, `DELETED`. | don | Codex indexing worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:21 IST | 2026-06-15 15:47:53 IST | KUN-007, KUN-014 | Added conservative lifecycle helper with `NEW`, `ACTIVE`, `PAUSED`, `STALE`, `ARCHIVED`, and `DELETED` inference plus focused tests. |
| KUN-016 | Discovery | Implement `kundol index` command. | don | Codex + indexing worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:21 IST | 2026-06-15 15:51:28 IST | KUN-011, KUN-012, KUN-013, KUN-014, KUN-015 | `kundol index` indexes configured or explicit workspaces, persists project metadata, and logs `INDEX`; smoke-tested on demo workspace. |
| KUN-017 | Registry | Implement `list` command with default table output. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-016 | Added service-layer list query and terminal/TUI formatting helpers without CLI action wiring. |
| KUN-018 | Registry | Implement `list --tag` filtering. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-017, KUN-007 | Added conservative injectable tag resolver support; without a tag resolver, tag filters return no projects with a warning. |
| KUN-019 | Registry | Implement `list --status` filtering. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-017 | Added case-insensitive status filtering in the registry service. |
| KUN-020 | Registry | Implement search/filter behavior through `list --search <query>`. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-017 | Added search over id, name, path, runtime, status, Git metadata, notes, and optional tag names. |
| KUN-021 | Dashboard | Implement aggregate project counts by status. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-016 | Added dashboard status aggregation in `getDashboardSummary`. |
| KUN-022 | Dashboard | Implement aggregate disk usage and recoverable bytes summary. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-013, KUN-030 | Added total size and cleanable byte aggregation from project registry fields. |
| KUN-023 | Dashboard | Implement top space consumers query and terminal display. | don | Codex Registry Worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:47:51 IST | KUN-017 | Added top space consumer selection and dashboard formatting. |
| KUN-024 | Dashboard | Implement `dashboard` command combining counts, disk usage, recoverable space, and top consumers. | don | Codex Registry Worker + Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:51:28 IST | KUN-021, KUN-022, KUN-023 | Dashboard service, formatting, and CLI command are wired; smoke-tested before and after project scan metadata updates. |
| KUN-025 | Cleanup Analysis | Define cleanup safety policy in code and docs. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-003 | Added `src/core/safety` policy modules; protected source, VCS, env, DB, media/assets/uploads, manifests, lockfiles, and migrations. |
| KUN-026 | Cleanup Analysis | Implement safe JavaScript runtime generated artifact detection for Node.js, Bun, and Deno. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-025 | Detects `node_modules`, framework/build output, coverage, and caches while protecting manifests and lockfiles. |
| KUN-027 | Cleanup Analysis | Implement safe Python generated artifact detection. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-025 | Detects Python caches/build artifacts; virtualenvs remain caution-only for review before cleanup. |
| KUN-028 | Cleanup Analysis | Implement safe Java, .NET, Python, Rust, and Go generated artifact detection beyond JS-specific rules. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-025 | Added generated artifact rules for Java, .NET, Rust, Go, and Unity-style output while keeping vendor/release outputs conservative. |
| KUN-029 | Cleanup Analysis | Implement caution item detection for Docker-related project artifacts, SQLite databases, reports, and video/media assets. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-025 | Reports/release/vendor are caution; databases and media/assets are protected rather than safe. Docker resource cleanup remains separate. |
| KUN-030 | Project Scan | Implement recoverable-byte calculation per project. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-026, KUN-027, KUN-028, KUN-029 | Added `src/core/analysis` scanner and summary aggregation for safe, caution, protected, unknown, and total bytes. Persistence integration remains for `KUN-032`. |
| KUN-031 | Cleanup Analysis | Implement recommendation engine. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-015, KUN-030 | Added `src/core/recommendations` for clean preview, caution review, inactive archive follow-up, and no-op recommendations. |
| KUN-032 | Project Scan | Implement `scan <project>` command. | don | Codex + scan-clean worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:20 IST | 2026-06-15 15:51:28 IST | KUN-030, KUN-031 | `scan <project>` resolves indexed projects, analyzes cleanup candidates, persists scan/items, updates cleanable bytes, logs `PROJECT_SCAN`, and prints summary/recommendations/largest items. |
| KUN-033 | Runtime Audit | Implement local runtime version detection for Node, npm, pnpm, Yarn, Bun, Deno, Java, .NET, Python, Rust, and Go tooling. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-004 | `kundol runtimes` detects local versions/missing tools and degrades gracefully. |
| KUN-034 | Runtime Audit | Implement latest-version lookup strategy for runtimes/package managers. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-033 | Cancelled for MVP to keep runtime audit local/offline; latest-version lookup can return as a future network-aware feature. |
| KUN-035 | Runtime Audit | Implement outdated flag calculation. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-034 | Cancelled for MVP with latest-version lookup; avoids noisy false positives. |
| KUN-036 | Runtime Audit | Implement `runtimes` command. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-033 | `kundol runtimes` prints supported local tool versions and missing tools; smoke-tested. |
| KUN-037 | Compact/Archive | Define archive location, filename scheme, and metadata update rules. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-005, KUN-025 | Archive/compact moved out of MVP when command vocabulary narrowed to `index`, `scan`, and `clean`. |
| KUN-038 | Compact/Archive | Implement compact preflight: scan project, verify Git status, verify remote, show risk summary. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-014, KUN-032, KUN-037 | Archive/compact moved to future command group. |
| KUN-039 | Compact/Archive | Implement safe generated-file removal for compact workflow. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-026, KUN-027, KUN-028, KUN-038 | Covered for MVP by `clean <project>` dry-run/apply workflow instead. |
| KUN-040 | Compact/Archive | Implement project compression to archive. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-037, KUN-038 | Archive/compact moved to future command group. |
| KUN-041 | Compact/Archive | Implement optional source deletion after successful archive. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-040 | Archive/compact moved to future command group; source deletion remains out of MVP. |
| KUN-042 | Cleanup | Implement `clean <project>` command with default dry-run and explicit `--apply`. | don | Codex + scan-clean worker | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:20 IST | 2026-06-15 15:51:28 IST | KUN-032, KUN-039 | `clean <project>` defaults to dry-run, applies only safe auto-clean generated artifacts with `--apply --no-dry-run`, and logs cleanup actions. |
| KUN-043 | Notes/Tags | Implement basic project note storage and update command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-007 | Source context names this future feature; useful enough to include after core MVP. |
| KUN-044 | Notes/Tags | Implement basic tag add/remove/list UX. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-007, KUN-018 | Enables meaningful `list --tag`. |
| KUN-045 | Testing | Add unit tests for marker detection and type inference. | don | Fullstack Developer Agent 3 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:45 IST | 2026-06-15 15:25:17 IST | KUN-010, KUN-012 | Added focused Bun tests for marker detection, type inference, traversal skip rules, symlink policy, size calculation, and read-only Git metadata. |
| KUN-046 | Testing | Add unit tests for cleanup safety policy and recommendation generation. | don | Fullstack Developer Agent 4 | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:23:42 IST | KUN-025, KUN-031 | Added focused Bun tests for cleanup policy, analyzer aggregation, and recommendation generation. |
| KUN-047 | Testing | Add integration tests for index/list/search/project-scan against temporary directories. | don | Codex + workers | 2026-06-13 07:18:52 IST | 2026-06-15 15:44:16 IST | 2026-06-15 15:51:28 IST | KUN-016, KUN-017, KUN-020, KUN-032 | Added service and CLI tests using temp homes/DB paths; smoke-tested demo init/index/list/dashboard/scan/clean flow. |
| KUN-048 | Testing | Add compact dry-run and archive workflow tests. | cancelled | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-042 | Archive/compact moved out of MVP; cleanup dry-run/apply is covered by scan-clean tests and smoke testing. |
| KUN-049 | Documentation | Write README with product positioning, install instructions, commands, and safety model. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-004, KUN-016, KUN-032, KUN-042 | Updated README with local-first positioning, quickstart, command list, storage path, and cleanup dry-run safety. |
| KUN-050 | Documentation | Write CLI usage examples for every MVP command. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-017, KUN-020, KUN-024, KUN-036, KUN-042 | README and command docs cover MVP command examples. |
| KUN-051 | Documentation | Document data storage locations and privacy implications. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-006, KUN-037 | README and `docs/storage-config.md` document `$HOME/.kundol/kundol.db`, local-first storage, and workspace config. |
| KUN-052 | Release | Add package/build configuration for local install. | don | Fullstack Developer Agent 1 + Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:20:29 IST | 2026-06-15 15:51:28 IST | KUN-003, KUN-004 | Added Bun package config, scripts, CLI bin entry, dependencies, and lockfile for local development/install workflows. |
| KUN-053 | Release | Run full test suite, lint, and smoke test commands on a sample workspace. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-15 15:51:28 IST | 2026-06-15 15:51:28 IST | KUN-045, KUN-046, KUN-047, KUN-048 | `bun run check` passes; smoke-tested demo init/index/dashboard/list/scan/clean dry-run/runtimes with temp HOME. |
| KUN-054 | Release | Prepare MVP release checklist and known limitations. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-049, KUN-050, KUN-051, KUN-053 | Include future features: doctor, git insights, duplicates, health score, and deeper runtime audit coverage. |
| KUN-055 | Launch | Plan open-source launch supply chain: GitHub launch, branding, community, content, and future cloud business model. | don | Codex + subagents | 2026-06-13 07:29:57 IST | 2026-06-13 07:29:57 IST | 2026-06-13 07:35:11 IST | KUN-001, KUN-049, KUN-054 | Added durable launch supply-chain plan in `docs/launch.md`; recommended local-first OSS trust launch with optional future cloud visibility layer. |
| KUN-056 | Launch | Research successful open-source launches and extract a low-cost viral marketing strategy for kundol. | don | Codex + explorer subagents | 2026-06-13 08:30:34 IST | 2026-06-13 08:30:34 IST | 2026-06-13 08:34:17 IST | KUN-055 | Added `docs/viral-launch.md` with launch pattern research and a low-cost HN/GitHub/content strategy. |
| KUN-057 | Planning | Align main product goal, non-AI worker model, current runtime scope, and mobile roadmap. | don | Codex | 2026-06-13 08:34:13 IST | 2026-06-13 08:34:13 IST | 2026-06-13 08:34:17 IST | KUN-002 | Added `docs/product-goal.md`; updated plan, agents guide, architecture, runtime KB, dependencies, and learnings. |
| KUN-058 | Planning | Define first-run and returning-user flow. | don | Codex | 2026-06-13 17:15:01 IST | 2026-06-13 17:15:01 IST | 2026-06-13 17:15:01 IST | KUN-057 | Added `docs/user-flow.md` covering install, init, workspace selection, first index, dashboard, review, project scan, dry-run cleanup, runtime health, and optional daemon flow. |
| KUN-059 | Planning | Narrow MVP command surface. | don | Codex | 2026-06-14 00:33:03 IST | 2026-06-14 00:33:03 IST | 2026-06-14 00:33:03 IST | KUN-058 | Added `docs/commands.md`; consolidated search into `list --search`, moved daemon/docker/archive/deep diagnostics to later command groups. |
| KUN-060 | Planning | Harden `kundol` and `kundol init` command specs. | don | Codex | 2026-06-14 00:38:01 IST | 2026-06-14 00:38:01 IST | 2026-06-14 00:38:01 IST | KUN-059 | Added `docs/commands/default-tui.md` and `docs/commands/init.md` with flags, state handling, safety rules, exit codes, JSON output, and tests. |
| KUN-061 | Planning | Harden `kundol index` command spec. | don | Codex | 2026-06-14 00:42:22 IST | 2026-06-14 00:42:22 IST | 2026-06-14 01:08:32 IST | KUN-060 | Renamed workspace discovery command to `kundol index`; added `docs/commands/index.md` with worker pipeline, scope rules, traversal rules, output shapes, partial failure policy, safety rules, exit codes, and tests. |
| KUN-062 | Planning | Decide user-scoped storage and workspace config model. | don | Codex | 2026-06-14 00:48:12 IST | 2026-06-14 00:48:12 IST | 2026-06-14 00:56:24 IST | KUN-061 | Added `docs/storage-config.md`; revised to one DB at `$HOME/.kundol/kundol.db`, config stored in DB tables, workspace arrays, and user-excluded project/workspace paths. |
| KUN-063 | Planning | Rename command vocabulary to index/scan/clean. | don | Codex | 2026-06-14 01:08:32 IST | 2026-06-14 01:08:32 IST | 2026-06-14 01:08:32 IST | KUN-061 | `index` is broad workspace discovery, `scan <project>` is deep project inspection, and `clean <project>` is the only cleanup execution path. |
| KUN-064 | Tooling | Add demo workspace seeder for manual CLI testing. | don | Codex | 2026-06-15 00:00:00 IST | 2026-06-15 00:00:00 IST | 2026-06-15 00:00:00 IST | KUN-063 | Added `scripts/seed-demo-workspace.ts` and `docs/demo/seed-demo-workspace.md` to generate fake Node.js, Python, and Go projects with source, fake git metadata, and deletable artifacts. |
| KUN-065 | TUI | Integrate OpenTUI as the default rich dashboard experience. | don | Codex + sidecar agents | 2026-06-15 16:12:24 IST | 2026-06-15 16:12:24 IST | 2026-06-15 16:17:50 IST | KUN-024 | Wired `@opentui/core` for TTY launches, preserved text fallback for non-TTY scripts/tests, added model tests, and smoke-tested a demo OpenTUI run. |
| KUN-066 | TUI | Add context-aware dashboard animations and async completion toasts. | don | Codex | 2026-06-15 16:45:36 IST | 2026-06-15 16:45:36 IST | 2026-06-15 16:45:36 IST | KUN-065 | Added OpenTUI startup/closing pulses, action spinners for index/scan/clean/runtimes, compact toast messages for async completion/errors, and preserved non-interactive command output. |
| KUN-067 | Tooling/TUI | Make demo `node_modules` visible and show more indexed projects in dashboards. | don | Codex | 2026-06-15 16:58:52 IST | 2026-06-15 16:58:52 IST | 2026-06-15 16:58:52 IST | KUN-064, KUN-065 | Seeder now writes visible 1KB fake package files under Node `node_modules`; OpenTUI and plain dashboard top-project limits now show up to 8 projects. |
| KUN-068 | Cleanup/Config | Archive old projects before applied clean and expose archive threshold config. | don | Codex | 2026-06-15 17:06:44 IST | 2026-06-15 17:06:44 IST | 2026-06-15 17:06:44 IST | KUN-042, KUN-065 | Added `archive.beforeCleanDays` setting defaulting to 15, `config --archive-before-clean-days`, local `.tar.gz` archives under `$HOME/.kundol/archives` before applied cleanup, and dashboard config editing with +/- and save. |
| KUN-069 | TUI | Add compact machine/system status bar to OpenTUI dashboard. | don | Codex | 2026-06-15 17:10:40 IST | 2026-06-15 17:10:40 IST | 2026-06-15 17:10:40 IST | KUN-065 | Added bottom one-row emoji status strip with local time/UTC offset, machine tag, current project directory, Git branch, memory, CPU, battery, Docker engine/running container status, and responsive shortening. |
| KUN-070 | Registry/Cleanup UX | Search only scanned projects and clarify cleanup apply flow. | don | Codex | 2026-06-15 17:21:03 IST | 2026-06-15 17:21:03 IST | 2026-06-15 17:23:34 IST | KUN-020, KUN-042 | Added `list --scanned` so users can run `kundol list --scanned --search <query>`, dry-run previews now print the exact `clean --apply --no-dry-run` follow-up, and command handlers return async results for reliable scripting/tests. |
| KUN-071 | TUI/CLI Parity | Make project search/filter/sort discoverable in both CLI and dashboard. | don | Codex | 2026-06-15 17:26:14 IST | 2026-06-15 17:26:14 IST | 2026-06-15 17:26:14 IST | KUN-070 | Added typed dashboard search, scanned-only toggle, sort cycling, clear filters, and CLI-equivalent hints for list/search, show, scan, clean preview/apply, runtimes, config, and JSON/server workflows. |
| KUN-072 | Branding | Add selected app logo to README and brand docs. | don | Codex | 2026-06-15 21:37:29 IST | 2026-06-15 21:37:29 IST | 2026-06-15 21:37:29 IST | KUN-055, KUN-056 | Copied the selected rounded-square `K` logo to `assets/logo.png`, embedded it in README/docs, and added `docs/brand.md` with palette and usage notes. |
| KUN-073 | Audit | Add per-run timestamped session audit log. | in progress | Codex | 2026-06-15 21:39:50 IST | 2026-06-15 21:39:50 IST |  | KUN-007, KUN-065 | Create an append-only session log for CLI/TUI actions formatted as timestamp, device name, action, and project name when available. |
| KUN-074 | TUI/Optimize | Add dashboard optimize storage dry-run and apply confirmation. | don | Codex | 2026-06-15 23:30:51 IST | 2026-06-15 23:30:51 IST | 2026-06-15 23:30:51 IST | KUN-065, KUN-F013 | Added `u optimize` dashboard dry-run preview, grouped safe/review/protected details, `y` apply confirmation for selected safe cleanup, optimizer service, tests, and docs/hints. |

## Future Backlog

| ID | Area | Task | Status | Owner | Created at | Started at | Completed at | Notes |
|---|---|---|---|---|---|---|---|---|
| KUN-F001 | Runtime Health | Implement `doctor` command for runtimes, package managers, broken symlinks, and orphaned repos. | todo |  | 2026-06-13 07:18:52 IST |  |  | Future feature from source context. |
| KUN-F002 | Git Insights | Implement `git` command for dirty repos, missing remotes, and stale branches. | todo |  | 2026-06-13 07:18:52 IST |  |  | Could reuse index Git metadata. |
| KUN-F003 | Duplicate Detection | Detect same remotes, same names, forks, and copied directories. | todo |  | 2026-06-13 07:18:52 IST |  |  | Needs careful false-positive handling. |
| KUN-F004 | Workspace Health | Implement workspace health score. | todo |  | 2026-06-13 07:18:52 IST |  |  | Example score factors: stale repos, outdated runtimes, recoverable GB. |
| KUN-F005 | Restore | Implement archive restore workflow. | todo |  | 2026-06-13 07:18:52 IST |  |  | Actions table already includes `RESTORE`. |
| KUN-F006 | Ecosystems | Expand runtime-specific cleanup and audit depth beyond MVP coverage. | todo |  | 2026-06-13 07:18:52 IST |  |  | Track deeper ecosystem support in `docs/project-runtimes.md`, including framework-specific generated files. |
| KUN-F007 | Docker | Implement Docker availability detection and structured resource scanning. | todo |  | 2026-06-13 07:29:15 IST |  |  | Track images, containers, volumes, networks, build cache, and Compose labels using `docs/docker.md`. |
| KUN-F008 | Docker | Implement Docker analysis and recommendations. | todo |  | 2026-06-13 07:29:15 IST |  |  | Classify resources as safe, caution, or protected; estimate reclaimable bytes. |
| KUN-F009 | Docker | Implement Docker TUI/CLI views for resource list, disk usage, and recommendations. | todo |  | 2026-06-13 07:29:15 IST |  |  | Include resource grouping by type and Compose project where possible. |
| KUN-F010 | Docker | Implement Docker purge workflows with dry-run, explicit confirmation, and audit logging. | todo |  | 2026-06-13 07:29:15 IST |  |  | Never purge volumes by default; prefer targeted deletion over broad prune commands. |
| KUN-F011 | Mobile | Add iOS project detection and analysis rules. | todo |  | 2026-06-13 08:34:13 IST |  |  | Future roadmap; likely markers include Xcode projects/workspaces, Swift packages, CocoaPods, and derived data rules. |
| KUN-F012 | Mobile | Add Android project detection and analysis rules. | todo |  | 2026-06-13 08:34:13 IST |  |  | Future roadmap; likely markers include Gradle Android plugins, Android manifests, and generated build/cache rules. |
| KUN-F013 | Storage Optimizer | Implement one-click optimize storage preview/apply workflow. | todo |  | 2026-06-15 21:51:27 IST |  |  | See `docs/storage-optimizer.md`; default apply should be limited to safe project generated files, package-manager cache commands, and targeted Docker cleanup. |

## Safety Requirements

- Every destructive action must support `--dry-run`.
- `clean` defaults to dry-run behavior; execution requires explicit `--apply --no-dry-run`.
- Never automatically remove `.git`, `.env`, `.env.*`, database files, uploads, media, assets, or migrations.
- Require explicit confirmation for Docker resources, SQLite databases, generated reports, video assets, and source deletion.
- Docker volume purge must require a dedicated volume-specific confirmation.
- Log meaningful user-visible actions in the `actions` table.

## Open Decisions

| ID | Decision | Status | Created at | Notes |
|---|---|---|---|---|
| DEC-001 | Should the CLI be named `kundol`, `devshelf`, or should one alias the other? | don | 2026-06-13 07:18:52 IST | Decided 2026-06-15: use `kundol` for CLI binary, package, and repo identity. |
| DEC-002 | Should the database live under `~/.devshelf` or `~/.kundol`? | don | 2026-06-13 07:18:52 IST | Decided 2026-06-14: one user-scoped SQLite database at `$HOME/.kundol/kundol.db`; config lives in DB tables; no per-workspace databases. |
| DEC-003 | Which stack should be used for fastest maintainable CLI development? | don | 2026-06-13 07:18:52 IST | User confirmed Bun + TypeScript TUI project on 2026-06-13 07:21:12 IST. |
| DEC-004 | What inactivity thresholds define `PAUSED`, `STALE`, and archive recommendations? | don | 2026-06-13 07:18:52 IST | MVP thresholds: `NEW` within 14 days of first seen, `ACTIVE` within 30 days of last modification, `PAUSED` within 120 days, `STALE` after 120 days; archive recommendations are out of MVP. |
| DEC-005 | What archive root should be used by default? | cancelled | 2026-06-13 07:18:52 IST | Archive/compact moved out of MVP; no archive root is needed for the current command surface. |

## Coordination Notes

### 2026-06-15 15:21:12 IST - Implementation Wave 001

- Active workstreams: Fullstack Developer Agent 1 owns KUN-003 and KUN-004; Fullstack Developer Agent 2 owns KUN-005, KUN-006, KUN-008, and KUN-009; Fullstack Developer Agent 3 owns KUN-010 through KUN-014.
- Keep discovery DB wiring, registry, scan, and cleanup execution behind the scaffold, CLI routing, schema, migrations, config access layer, and repository contract.
- Recommended integration order: scaffold, CLI routing, schema/migrations, config first-run behavior, pure discovery modules, repository functions, index integration, registry commands, safety policy, project scan, clean.
- Merge-risk areas: `package.json`, CLI command registration, SQLite table contracts, repository interfaces, path normalization, and cleanup safety vocabulary.
- Detailed coordination note: `docs/workflows/implementation-wave-001.md`.
