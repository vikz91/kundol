# kundol Project Plan

Created: 2026-06-13 07:18:52 IST  
Last updated: 2026-06-14 01:08:32 IST  
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
It stores project metadata in SQLite, analyzes disk usage and runtime/toolchain signals, recommends safe cleanup, audits runtimes, and supports dry-run-first cleanup/archive workflows.

Current runtime analysis scope: JavaScript/TypeScript, Java, .NET, Python, Rust, and Go.
Future runtime roadmap: iOS and Android.
Docker monitoring is an adjacent capability, not the core product identity.

The pasted context names the product `DevShelf`; this plan keeps the repository/project name as `kundol` and leaves final CLI/package naming as an explicit early decision.

## MVP Milestones

1. Establish project foundation and decisions.
2. Implement SQLite-backed registry.
3. Implement workspace configuration and non-AI worker-driven workspace indexing.
4. Implement dashboard/list/show commands and list search filters.
5. Implement cleanup analysis and recommendations.
6. Implement runtime audit.
7. Implement safe compact/archive workflow.
8. Add tests, documentation, and release packaging.

## Task Ledger

| ID | Milestone | Task | Status | Owner | Created at | Started at | Completed at | Dependencies | Notes |
|---|---|---|---|---|---|---|---|---|---|
| KUN-001 | Foundation | Decide final product name, CLI binary name, and package name (`kundol`, `devshelf`, or both). | todo |  | 2026-06-13 07:18:52 IST |  |  | none | Resolve source context mismatch before publishing docs/package metadata. |
| KUN-002 | Foundation | Choose implementation stack and CLI framework. | don | Codex | 2026-06-13 07:18:52 IST | 2026-06-13 07:21:12 IST | 2026-06-13 07:21:12 IST | KUN-001 | Stack direction set by user: Bun + TypeScript TUI project. CLI/TUI framework still to be chosen during implementation. |
| KUN-003 | Foundation | Initialize repository structure, Bun package setup, TypeScript config, formatter, test scripts, and basic CI-ready scripts. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-002 | Use `docs/dependencies.md`; include `README.md`, license decision, and ignored generated files. |
| KUN-004 | Foundation | Create initial Bun CLI entrypoint with help output and command routing. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-003 | Prefer `commander` per `docs/dependencies.md`; MVP commands are defined in `docs/commands.md`. |
| KUN-005 | Data | Define SQLite schema for `projects`, `tags`, `project_tags`, `actions`, settings, workspaces, and excluded paths. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-003 | DB path target: `$HOME/.kundol/kundol.db`; one user-scoped DB, not per-workspace DBs. Config lives in DB tables. |
| KUN-006 | Data | Implement database initialization and migrations. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-005 | Prefer Bun `bun:sqlite`; must be idempotent and create parent config directory as needed. |
| KUN-007 | Data | Implement repository functions for projects, tags, project tags, and action audit logs. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-006 | Keep database access isolated from command formatting. |
| KUN-008 | Config | Define workspace/settings configuration tables and access patterns. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-002 | Config lives in SQLite tables; support workspace root arrays and user-excluded project/workspace paths; commands must not depend on current working directory. |
| KUN-009 | Config | Implement config load/save and default first-run behavior. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-008 | Avoid scanning the whole home directory by accident. |
| KUN-010 | Discovery | Implement project marker detection for `.git` and supported runtime markers. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-004, KUN-007 | Use `docs/project-runtimes.md` as source of truth for JS runtimes, Java, .NET, Python, Rust, and Go markers. |
| KUN-011 | Discovery | Implement recursive workspace indexing through non-AI index workers with sensible traversal rules. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-009, KUN-010 | Avoid descending into `node_modules`, `.git`, virtualenvs, build output, and archives. Workers should report progress and tolerate partial failures. |
| KUN-012 | Discovery | Implement project type inference for JS runtimes, Java, .NET, Python, Rust, Go, Git-only, and mixed projects. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-010 | Support multiple ecosystems while preserving all detected runtimes and one primary display type. |
| KUN-013 | Discovery | Implement directory size calculation. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-011 | Must be fast enough for large workspaces and resilient to permission errors. |
| KUN-014 | Discovery | Implement Git metadata collection: remote, branch, dirty flag, modified time. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-011 | Never mutate repos during index. |
| KUN-015 | Discovery | Implement lifecycle status inference: `NEW`, `ACTIVE`, `PAUSED`, `STALE`, `ARCHIVED`, `DELETED`. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-007, KUN-014 | Manual override can be added after MVP if needed. |
| KUN-016 | Discovery | Implement `kundol index` command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-011, KUN-012, KUN-013, KUN-014, KUN-015 | Upsert discovered projects and log `INDEX` actions. |
| KUN-017 | Registry | Implement `list` command with default table output. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-016 | Include name, path, type, status, size, last indexed, last project scanned, and dirty flag. |
| KUN-018 | Registry | Implement `list --tag` filtering. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-017, KUN-007 | Tag write UX can be minimal for MVP but query path should exist. |
| KUN-019 | Registry | Implement `list --status` filtering. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-017 | Match source context examples. |
| KUN-020 | Registry | Implement search/filter behavior through `list --search <query>`. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-017 | Search names, paths, notes, remote URLs, and tags if practical; no separate `search` command in MVP. |
| KUN-021 | Dashboard | Implement aggregate project counts by status. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-016 | Required dashboard metrics: total, active, paused, archived. |
| KUN-022 | Dashboard | Implement aggregate disk usage and recoverable bytes summary. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-013, KUN-030 | Recoverable depends on cleanup analysis rules. |
| KUN-023 | Dashboard | Implement top space consumers query and terminal display. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-017 | Show largest projects clearly. |
| KUN-024 | Dashboard | Implement `dashboard` command combining counts, disk usage, recoverable space, and top consumers. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-021, KUN-022, KUN-023 | Keep output useful in plain terminals; default `kundol` should open the TUI dashboard. |
| KUN-025 | Cleanup Analysis | Define cleanup safety policy in code and docs. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-003 | Never auto-remove `.git`, `.env*`, database files, uploads, media, assets, or migrations. |
| KUN-026 | Cleanup Analysis | Implement safe JavaScript runtime generated artifact detection for Node.js, Bun, and Deno. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-025 | Use `docs/project-runtimes.md`; include `node_modules`, build outputs, coverage, and caches while protecting manifests and lockfiles. |
| KUN-027 | Cleanup Analysis | Implement safe Python generated artifact detection. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-025 | Targets: `__pycache__`, `.venv`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`. |
| KUN-028 | Cleanup Analysis | Implement safe Java, .NET, Python, Rust, and Go generated artifact detection beyond JS-specific rules. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-025 | Use `docs/project-runtimes.md`; keep `vendor`, release builds, media assets, wrapper scripts, and project tooling protected or caution-only. |
| KUN-029 | Cleanup Analysis | Implement caution item detection for Docker-related project artifacts, SQLite databases, reports, and video/media assets. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-025 | Project-local caution items require explicit confirmation; Docker resource monitoring is tracked separately in `docs/docker.md`. |
| KUN-030 | Project Scan | Implement recoverable-byte calculation per project. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-026, KUN-027, KUN-028, KUN-029 | Store `cleanable_bytes` in project scan metadata when available. |
| KUN-031 | Cleanup Analysis | Implement recommendation engine. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-015, KUN-030 | Include delete generated files, archive inactive projects, safe archive, and caution warnings. |
| KUN-032 | Project Scan | Implement `scan <project>` command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-030, KUN-031 | Output recoverable size, largest items, recommendations, and log `PROJECT_SCAN`. |
| KUN-033 | Runtime Audit | Implement local runtime version detection for Node, npm, pnpm, Yarn, Bun, Deno, Java, .NET, Python, Rust, and Go tooling. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-004 | Version detection should degrade gracefully if tools are missing; use `docs/project-runtimes.md` for commands. |
| KUN-034 | Runtime Audit | Implement latest-version lookup strategy for runtimes/package managers. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-033 | Requires network or cached metadata; handle offline mode clearly. |
| KUN-035 | Runtime Audit | Implement outdated flag calculation. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-034 | Avoid noisy false positives where version channels differ. |
| KUN-036 | Runtime Audit | Implement `runtimes` command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-033, KUN-034, KUN-035 | Display supported runtime families from `docs/project-runtimes.md`; missing tooling should be informative, not fatal. |
| KUN-037 | Compact/Archive | Define archive location, filename scheme, and metadata update rules. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-005, KUN-025 | Example archive name: `voice-ai-2026-06-13.tar.gz`. |
| KUN-038 | Compact/Archive | Implement compact preflight: scan project, verify Git status, verify remote, show risk summary. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-014, KUN-032, KUN-037 | Default must be dry run. |
| KUN-039 | Compact/Archive | Implement safe generated-file removal for compact workflow. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-026, KUN-027, KUN-028, KUN-038 | Destructive action must support `--dry-run`. |
| KUN-040 | Compact/Archive | Implement project compression to archive. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-037, KUN-038 | Preserve enough metadata for future restore. |
| KUN-041 | Compact/Archive | Implement optional source deletion after successful archive. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-040 | Requires explicit confirmation; never default. |
| KUN-042 | Cleanup | Implement `clean <project>` command with default dry-run and explicit `--apply`. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-032, KUN-039 | MVP cleanup command; archive/compact moves to later command group per `docs/commands.md`. |
| KUN-043 | Notes/Tags | Implement basic project note storage and update command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-007 | Source context names this future feature; useful enough to include after core MVP. |
| KUN-044 | Notes/Tags | Implement basic tag add/remove/list UX. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-007, KUN-018 | Enables meaningful `list --tag`. |
| KUN-045 | Testing | Add unit tests for marker detection and type inference. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-010, KUN-012 | Cover JS runtimes, Java, .NET, Python, Rust, Go, Git-only, and mixed projects. |
| KUN-046 | Testing | Add unit tests for cleanup safety policy and recommendation generation. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-025, KUN-031 | Safety rules are core product trust. |
| KUN-047 | Testing | Add integration tests for index/list/search/project-scan against temporary directories. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-016, KUN-017, KUN-020, KUN-032 | Use temp DB path to avoid touching real user data. |
| KUN-048 | Testing | Add compact dry-run and archive workflow tests. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-042 | Verify destructive paths are opt-in. |
| KUN-049 | Documentation | Write README with product positioning, install instructions, commands, and safety model. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-004, KUN-016, KUN-032, KUN-042 | Include Mole-inspired differentiation: machine cleanup vs project lifecycle. |
| KUN-050 | Documentation | Write CLI usage examples for every MVP command. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-017, KUN-020, KUN-024, KUN-036, KUN-042 | Use `docs/commands.md` as source of truth. |
| KUN-051 | Documentation | Document data storage locations and privacy implications. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-006, KUN-037 | Users should know what is stored in SQLite and archive directories. |
| KUN-052 | Release | Add package/build configuration for local install. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-003, KUN-004 | Depends on chosen stack. |
| KUN-053 | Release | Run full test suite, lint, and smoke test commands on a sample workspace. | todo |  | 2026-06-13 07:18:52 IST |  |  | KUN-045, KUN-046, KUN-047, KUN-048 | Record command outputs in release notes or PR description. |
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

## Safety Requirements

- Every destructive action must support `--dry-run`.
- `compact` must default to dry-run behavior.
- Never automatically remove `.git`, `.env`, `.env.*`, database files, uploads, media, assets, or migrations.
- Require explicit confirmation for Docker resources, SQLite databases, generated reports, video assets, and source deletion.
- Docker volume purge must require a dedicated volume-specific confirmation.
- Log meaningful user-visible actions in the `actions` table.

## Open Decisions

| ID | Decision | Status | Created at | Notes |
|---|---|---|---|---|
| DEC-001 | Should the CLI be named `kundol`, `devshelf`, or should one alias the other? | todo | 2026-06-13 07:18:52 IST | Decide before package scaffolding. |
| DEC-002 | Should the database live under `~/.devshelf` or `~/.kundol`? | don | 2026-06-13 07:18:52 IST | Decided 2026-06-14: one user-scoped SQLite database at `$HOME/.kundol/kundol.db`; config lives in DB tables; no per-workspace databases. |
| DEC-003 | Which stack should be used for fastest maintainable CLI development? | don | 2026-06-13 07:18:52 IST | User confirmed Bun + TypeScript TUI project on 2026-06-13 07:21:12 IST. |
| DEC-004 | What inactivity thresholds define `PAUSED`, `STALE`, and archive recommendations? | todo | 2026-06-13 07:18:52 IST | Example context mentions inactive 120 days. |
| DEC-005 | What archive root should be used by default? | todo | 2026-06-13 07:18:52 IST | Needs a safe default and override. |
