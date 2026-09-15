# kundol Codebase Context

Created: 2026-09-15 10:21:29 IST
Related tasks: `KUN-080`, `KUN-084`, `KUN-087`
Basis: current `src/`, `tests/`, `package.json`, and CLI registration, rather than historical plans.

## What the tool is today

kundol is a local Bun and TypeScript CLI for macOS system optimisation. Its implemented focus is developer-machine storage and startup items: it scans a scope, prints a plan, asks the user to proceed, applies selected actions, reports the result, and writes audit records. The project and repository commands clean generated artifacts inside detected code projects. Startup optimisation is macOS-only; storage and project scanning use portable Bun/Node APIs but include macOS-specific review rows.

The executable is `src/cli/index.ts`. `package.json` exposes it as `kundol`, requires Bun 1.2 or later, and provides `bun run dev`, lint, typecheck, tests, a Bun bundle check, a CLI boot smoke, and `bun run check`. Commander registers only the root command and its `optimise` group. Running bare `kundol` prints the ASCII welcome banner and examples; it does not open a dashboard. `commander` is used for routing; `zod` is declared but has no current `src/` import.

## Public commands

| Command | Scope and current effect |
|---|---|
| `kundol` | Welcome banner and examples. |
| `kundol optimise storage` | Plans selected package/runtime cache commands, Docker's system prune, top-level old temp entries, and safe cleanup from previously indexed inactive projects. |
| `kundol optimise startup` | Scans launchd plists and classic app Login Items on macOS; offers safe user LaunchAgents for disablement. |
| `kundol optimise projects <workdir>` | Finds runtime projects under the workdir to fixed depth 7 and removes safe project-local generated files and directories. |
| `kundol optimise repos <workdir>` | Calls the **same handler and scanner** as `projects`; it does not require `.git` or filter to Git repositories. |

Each `optimise` subcommand has one workflow flag, `-f, --force`. It skips the prompt or startup item selection after scanning; it does not skip scanning or the plan. Standard Commander help/version flags also work. The public CLI has no `init`, `index`, `list`, `show`, `scan`, `clean`, `dashboard`, `config`, or `runtimes` command and no `--json`, `--dry-run`, `--apply`, `--no-dry-run`, or `--max-depth` flag. Internal action functions retain a `json` parameter, but command registration always passes `false`.

Storage and project runs ask `[y/N]`; only `y` or `yes` applies. Startup asks for displayed item numbers, `all`/`a`, or blank to cancel. In a non-interactive terminal without `-f`, the CLI still scans, prints the plan, records cancellation, and exits with code 0. Partial apply results with one or more failed targets return code 70. Uncaught scan or database errors are not converted into a structured CLI result.

## Storage optimiser

`src/services/optimize/storage-optimizer.ts` builds the plan from four sources:

1. **SQLite project registry:** projects with `cleanableBytes > 0` and status `PAUSED` or `STALE` are selected. `ACTIVE` and `NEW` projects are review-only. Applying a selected project uses the retained persisted-scan `cleanProjectService`; a fresh install has no indexed project rows or scan rows because there is no public indexing command now.
2. **Available tools:** version/availability probes add selected commands for Bun cache removal, pip cache purge, npm cache verify, pnpm store prune, Yarn cache clean, Go build/test cache cleanup, and `docker system prune --force` without volumes. Docker is only probed with `docker info`; individual containers, images, networks, and cache entries are not inventoried.
3. **Temporary files:** every regular file or directory immediately under `os.tmpdir()` with modification time at least seven days old is selected. The scanner skips symlinks. Before removal, apply checks that the entry is still old, has an accepted type, is not a symlink, and resolves within the temp root.
4. **Informational rows:** `~/Library/Caches` is review-only and Docker volumes are protected. These rows are static; they are not sized or included in apply.

The storage plan prints selected target count and known reclaimable bytes. Unknown-size cache and Docker commands contribute zero to that estimate. The final report gives applied, failed, and skipped counts and target names; it does not measure actual bytes reclaimed. A persisted-project candidate is counted as applied if its clean service returns, even if that service deleted zero items and returned warnings. Command targets are executed through structured `Bun.spawn` argument arrays. The selected Docker operation is a broad prune, not a per-resource delete.

## Startup optimiser

`src/services/startup-optimizer/startup-optimizer.ts` reads user plists under `~/Library/LaunchAgents`, system plists under `/Library/{LaunchAgents,LaunchDaemons}` and `/System/Library/{LaunchAgents,LaunchDaemons}`, and classic Login Item names through `osascript`/System Events. It parses text plist fields such as `Label`, `BundleName`, `ProcessName`, `Description`, and `Program` for display. On non-macOS platforms it returns an empty plan with a warning.

The CLI action list shows only user LaunchAgents whose labels do not start with `com.apple.`; system items are protected and Apple-labeled user agents and app Login Items are review-only. Applying a selected item first checks that its plist is a regular, non-symlinked file inside the user LaunchAgents directory. It then runs `launchctl bootout gui/<uid> <plist>` followed by `launchctl disable gui/<uid>/<label>`. The plist remains on disk. The code does not change Login Items in System Settings, system LaunchAgents, or LaunchDaemons. A successful `disable` is reported as disabled even if `bootout` failed.

The scan includes review/protected counts internally, but the terminal plan prints only selected safe entries. If Login Item discovery fails, it returns no Login Item rows without a warning. The final report gives disabled, failed, and skipped counts, not a storage estimate.

## Projects and repos optimiser

`src/services/project-optimizer/project-optimizer.ts` traverses the supplied workdir without following symlinks, detects projects from Node/Bun/Deno, Python, Go, Rust, Java, and .NET markers, and finds candidate generated entries directly under each detected project root. The depth limit is fixed to 7 by command registration. Generated, VCS, asset, upload, media, migration, vendor, and virtual-environment directories are skipped during traversal.

Candidates must match the service's generated-name allowlist **and** the shared `src/core/safety/policy.ts` `safe`/`canAutoClean` classification. Examples include `node_modules`, `dist`, `build`, `.next`, coverage and cache directories, `__pycache__`, `.gradle`, Rust/Java `target`, .NET `obj`, Go/.NET `bin`, and generated coverage/profiling files. `.venv`, reports, release outputs, source, `.git`, environment files, databases, media, assets, and migrations are not selected. The supplied workdir and detected project roots are never cleanup candidates.

Before each deletion, apply rechecks the path's presence, symlink status, type, generated-name allowlist, and safety classification, and rejects a lexical path escape from the project root. It reports skips and failures separately. Reclaimed bytes are **estimated from scan-time candidate sizes**, not measured after apply. The verifier does not prove the live real path remains under the original project root if an ancestor changes to a symlink between planning and deletion.

## Code map and data flow

| Area | Responsibility and reachability |
|---|---|
| `src/cli/` | Commander registration, terminal plan/prompt/report formatting, command results, and audit calls. This is the active public surface. |
| `src/services/optimize/`, `startup-optimizer/`, `project-optimizer/` | Active storage, macOS startup, and workdir-generated-file workflows. |
| `src/core/safety/` | Shared project path classifier: `safe`, `caution`, `protected`, or `unknown`; active project optimiser and retained scan/clean services use it. |
| `src/db/` and `src/config/paths.ts` | Bun SQLite client, migration, repositories, and default `~/.kundol/kundol.db` path. Active actions read project rows and write action rows. |
| `src/services/audit/` | Best-effort per-process session log under `~/.kundol/sessions/`. |
| `src/core/discovery/`, `workers/`, `registry/`, `analysis/`, `recommendations/`, `projects/`; `src/services/indexing/`, `scan-clean/`, `archive/`; remaining `src/config/` | Retained code from the earlier project-discovery CLI. These modules have tests and internal entrypoints, but their old commands are no longer registered. Storage apply still reaches the persisted-scan clean service for selected registry projects. |
| `src/platform/`, `src/shared/` | Home/clock/filesystem helpers, output abstraction, and exit-code constants. |
| `scripts/seed-demo-workspace.ts` | Fake Node/Python/Go workspace fixture. Its printed `init/index/list/scan` suggestions are from the removed CLI and are stale. |

SQLite migration v1 creates settings, workspaces, excluded paths, projects, tags, project scans/items, actions, and schema migration tables. The active CLI creates/migrates the DB when it reads projects or records actions. It logs a durable `*_SCAN` action after a successful scan, `*_CANCELLED` on cancellation, and `*_OPTIMISE` after apply; session logs also record the start of scan and apply. Action records default to status `completed`, including cancellation and partial-failure summaries. Session log writes silently fail on filesystem error; SQLite action writes are part of the action path.

The discovery/indexing service can still populate project metadata and lifecycle status (`NEW`, `ACTIVE`, `PAUSED`, `STALE`, `ARCHIVED`, `DELETED`) through internal calls. Scan/clean services can persist safe scan items, reclassify them on apply, and optionally create a `.tar.gz` archive if explicitly passed an archive root. Neither service has a public command today, and storage apply does not pass an archive root.

## Present limits and documentation precedence

This CLI is not a general macOS maintenance suite yet. It does not implement Docker resource inventory, modern background-item APIs, System Settings Login Item mutation, CPU/memory/battery monitoring, application-cache cleanup, iOS/Android project analysis, or a running daemon. `docs/docker.md`, `docs/architecture.md`, `docs/storage-optimizer.md`, `docs/user-flow.md`, and parts of the [agent guide](agents.md) describe earlier or planned behavior; use this page, `docs/commands.md`, and current CLI registration for **implemented** behavior.

Two current safety-policy gaps deserve attention when changing the optimizer: storage auto-selects **all** seven-day-old top-level entries in `os.tmpdir()` rather than only tool-owned temp data, and Docker apply uses broad system prune without a resource-by-resource plan. This differs from the narrower guidance in the [agent guide](agents.md) and historical storage/Docker docs. Startup live verification does not re-read the plist label or loaded state, and project apply does not enforce realpath containment after an ancestor swap. These are implementation facts, not assurances that those actions are safe for every machine.

## Development and verification

Run `bun install` once, `bun run dev -- --help` to inspect the CLI, and `bun run check` for tool versions, lint, TypeScript checking, registry validation, Bun tests, bundling, and a bare/help CLI smoke. Husky installs local Git hooks during `prepare`: pre-commit checks Bun and local TypeScript against `package.json` ranges before lint, typecheck, and bundle checks; pre-push runs the CLI smoke under a temporary home. `tests/cli/program.test.ts` asserts registered commands/options. Service tests cover project candidate classification and live type changes, macOS startup item classification and disable calls with an injected runner, storage selection/failure summaries, and retained discovery/SQLite/scan-clean behavior. They do not exercise a real Docker prune or full interactive CLI confirmations. Keep manual optimisation runs against disposable test workdirs and injected temp homes; `-f` applies actions after planning.
