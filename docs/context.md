# kundol Codebase Context

Created: 2026-09-15 10:21:29 IST
Last updated: 2026-09-17 12:00:00 IST
Related tasks: `KUN-080`, `KUN-084`, `KUN-087`, `KUN-089`, `KUN-092`, `KUN-101`, `KUN-102`
Basis: current `src/`, `tests/`, `package.json`, and CLI registration, rather than historical plans.

## What the tool is today

kundol is a Bun and TypeScript CLI for developer-machine cache and generated-project optimisation. Cleanup commands probe registry targets, print a plan, collect selection, apply live checks, report outcomes, and write SQLite/session audits. The read-only `tools` group browses the bundled JSON catalogue; `tools request` and `issue` open GitHub pages.

The executable is `src/cli/index.ts`. Commander registers `optimise`, `tools`, and `issue`; bare `kundol` prints a welcome banner. `registry/optimisations.json` is validated with Zod and embedded in the standalone binary. The current registry has `integration: engine_ready`; published user-scope and workdir rules are routed through the registry engine.

## Public commands

| Command | Current effect |
|---|---|
| `kundol` | Welcome banner and examples. |
| `kundol optimise all --workdir <path> --docker-context <name>` | Produces one plan and selection across explicit user, workdir, pinned Docker-context, and system scopes. |
| `kundol optimise storage` | Probes published user-scope owner-tool caches; `--allow-beta` adds explicit-review Yarn Classic cache handling and reports every other unavailable user beta. |
| `kundol optimise projects <workdir>` | Finds matching projects to depth 7; `--allow-beta` adds two Linux-only Python review rules. |
| `kundol optimise docker <context>` | Pins a named Docker context and daemon identity; `--allow-beta` adds protected network/volume inventories, never removal. |
| `kundol optimise repos <workdir>` | Uses the same project handler and beta opt-in; Git is not required. |
| `kundol tools available` | Lists published catalogue rules. |
| `kundol tools search <query>` | Searches published IDs, labels, descriptions, and categories. |
| `kundol tools list --status <status>` | Lists all or proposed/wip/beta/published rules. |
| `kundol tools request` | Opens a prefilled GitHub Markdown issue for a missing tool. |
| `kundol issue` | Opens GitHub's general issue chooser. |

All five `optimise` routes accept `--allow-beta` for five exact code-approved IDs; the other 64 beta entries remain inactive and are reported individually in their route. The `all` route requires `--workdir` and `--docker-context`; it resolves both, probes all four registry scopes concurrently, rejects cross-scope target overlap, and prints one combined plan before one selection. It never guesses either scope. All/storage/projects/repos accept `-f, --force`; it selects safe, force-eligible targets after planning, never beta review targets. Storage and workdir runs accept `y` for safe suggestions or displayed numbers for explicit review. Protected inventory cannot be selected. Without a TTY and without `-f`, the CLI prints the plan, records cancellation, and exits 0. One or more apply failures return 70. Bare `optimise` is help-only. The public CLI has no `optimise startup`, top-level project `list`, `init`, `index`, `scan`, `clean`, dashboard, or `--json`, `--dry-run`, and `--apply` flags.

## Storage optimiser

`optimise storage` creates a registry engine for user-scope rules. It probes published owner-tool caches, displays each candidate's tier, target, known size, action, evidence, and source, and reports unavailable rules. Current published examples include npm verification, pip purge, uv prune, Go cache maintenance, pnpm store prune, Bun's whole-cache action from a package workspace, selected-store NuGet clears, and reviewed Conda tarball/index/log clears under one pinned package root. Safe rules can be suggested; review rules need explicit selection. Exact code-approved owner commands or pinned environment overrides run after target identity and live checks. The plan shows known target footprint; command savings may be unknown. Conda's unused-package clean remains beta catalogue only because symlink-dependent environments are not fully accounted for by that owner option.

Docker and arbitrary `os.tmpdir()` entries are not selected by the storage route. The separate `optimise docker <context>` route clears ambient Docker overrides, resolves one named endpoint/daemon, and scans published rules by default; `--allow-beta` adds only protected network/volume inventories, so it still performs no Docker resource cleanup. The earlier broad Docker prune, blanket old-temp cleanup, and persisted-project storage service have been retired.

`optimise all` composes the same storage, project, Docker, and system probes. The combined plan retains each candidate's scope, Docker daemon identity, and resolved workdir, then dispatches a confirmed selection back to the engine that issued its original plan. Actions remain sequential and individually revalidated; a catalogue beta rule without a code-owned binding is reported unavailable rather than executed.

## Projects and repos optimiser

`optimise projects` resolves a real supplied workdir, discovers matching project roots to depth 7, and uses published workdir rules by default; `--allow-beta` adds two exact Linux-only Python review rules. Safe targets include SwiftPM `.build`, `node_modules`, Python caches, Rust `target`, `.NET obj` intermediates, and exact-config TypeScript build metadata. Parcel `.parcel-cache`, ESLint `.eslintcache`, and a CMake build tree with exact cache/source proof require explicit review. Reports and binaries such as `htmlcov`, `*.egg-info`, Go `coverage.out` and `*.test`, .NET `TestResults`, LLVM profiles, and cargo-tarpaulin HTML also require explicit review. `.NET bin` remains beta catalogue only because it can contain release output. Published Visual Studio `.vs` state is protected inventory, never a removal action. The scanner does not descend through symlinks or generated/protected directory names. `repos` calls the same handler and does not require `.git`.

Generated-path removal requires a code-approved selector and matching project marker. Before apply, the engine re-probes only the selected path, verifies scope, identity, ownership, and activity, and audits attempts and outcomes. The seven-day activity check streams directory entries and refuses trees beyond 150,000 entries. Directory sizing runs after eligibility checks and stops after 50,000 entries; an incomplete size is shown as unknown. An isolated system-Python helper opens path ancestors without following links and deletes relative to directory descriptors, preventing an ancestor swap from redirecting deletion. Missing descriptor support fails closed. POSIX does not make the final leaf-name unlink conditional on the checked inode, so a concurrent replacement within the opened parent remains a limited race. `-f` applies only safe suggestions; reports and protected inventory cannot be force-selected. Known reclaimed bytes come from applied path targets when measured completely; owner-tool actions may not have a size estimate.

## Code map and data flow

| Area | Responsibility |
|---|---|
| `src/cli/` | Commander routes, plans, selection prompts, reports, GitHub links, and audit calls. |
| `registry/optimisations.json`, `src/core/optimisation-registry/` | Bundled rule definitions and strict schema validation. |
| `src/services/optimisation-registry/` | Active user-cache and project-rule probe, review, live validation, execution, and audit engine. |
| `src/db/`, `src/services/audit/` | SQLite actions and per-process session records under `~/.kundol/`. |
| `src/shared/`, `src/platform/` | Output, byte formatting, exit codes, clock, and home helpers. |

SQLite migration v1 still creates settings, workspaces, project metadata, scans/items, actions, and migration tables for compatibility with existing databases. Active optimise runs use the actions table to record scan, cancellation, apply, and registry-target audit rows. Target events reuse one SQLite connection per apply run; no connection is held while waiting for review selection. Session logs are best effort; SQLite action writes are part of the command path. The current CLI does not index workspaces, persist project scans, or create archives.

## Present limits

The public Docker route does not yet expose a published Docker resource inventory or cleanup rule. The CLI also does not implement arbitrary temp cleanup, startup-item changes, CPU/memory/battery monitoring, a dashboard, or a daemon. The registry CLI's seven-day no-change check finds recent content changes but cannot prove that no process has an old file open. Owner-tool cache actions can cause re-downloads; known-byte reports do not measure command-side savings. Use [usage](usage.md), [commands](commands.md), and CLI registration for current behavior; older design and learning notes record earlier implementations.

## Development and verification

Run `bun install --frozen-lockfile`, `bun run dev -- --help`, and `bun run check` for tool versions, lint, TypeScript, registry validation, Bun tests, bundling, and CLI smoke checks. Tests use disposable homes/workdirs and injected owner runners rather than applying to a real machine. The [Docker sandbox](demo/docker-sandbox.md) supplies disposable generated-project fixtures without mounting host files or a Docker socket.
