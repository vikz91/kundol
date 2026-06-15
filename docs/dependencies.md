# Bun Dependency Knowledge Base

Created: 2026-06-13 07:30:45 IST  
Last updated: 2026-06-15 16:12:24 IST  
Related tasks: `KUN-002`, `KUN-003`, `KUN-004`, `KUN-005`, `KUN-006`, `KUN-024`, `KUN-036`, `KUN-042`, `KUN-F007`, `KUN-F010`

## Purpose

kundol is a Bun + TypeScript terminal UI project.
This document tracks npm dependencies, Bun/runtime features, and system tools that agents should use or expect.

Keep the dependency set small.
Prefer Bun built-ins and standard Web/Node APIs before adding packages.
Every dependency should have a clear owner layer and reason.

## Dependency Principles

- Use Bun as runtime, package manager, script runner, and test runner.
- Use TypeScript strict mode.
- Prefer ESM.
- Prefer Bun built-ins for SQLite, file IO, tests, and scripts.
- Keep core logic independent from TUI dependencies.
- Keep Docker, Git, runtime detection, and worker execution behind adapters so tests do not need real system tools.
- Avoid adding ORMs, task runners, or heavy frameworks unless the simpler path becomes painful.

## Required System Tools

These should be installed for normal development:

| Tool | Required for | Notes |
|---|---|---|
| Bun | Runtime, package manager, tests, scripts | Primary project runtime. |
| Git | Repo metadata detection and development workflow | Needed by scan/git metadata features. |
| tar | Archive creation | Available by default on macOS/Linux; still treat as a platform dependency. |
| gzip | Archive compression | Available by default on macOS/Linux. |

## Optional System Tools

These are optional because kundol must degrade gracefully when missing:

| Tool | Feature area | Behavior when missing |
|---|---|---|
| Docker CLI | Docker scan/analyze/purge | Show Docker unavailable status. |
| Docker daemon/Desktop | Docker resource monitoring | Show daemon unavailable status. |
| Node.js | Runtime audit | Mark Node unavailable. |
| npm | Runtime audit | Mark npm unavailable. |
| pnpm | Runtime audit | Mark pnpm unavailable. |
| Yarn | Runtime audit | Mark Yarn unavailable. |
| Deno | Runtime audit | Mark Deno unavailable. |
| Python/Python3 | Runtime audit | Mark Python unavailable. |
| pip | Runtime audit | Mark pip unavailable. |
| poetry | Runtime audit | Mark Poetry unavailable. |
| uv | Runtime audit | Mark uv unavailable. |
| Go | Runtime audit | Mark Go unavailable. |
| Rust toolchain | Runtime audit | Mark Rust unavailable. |
| Unity/Unity Hub | Runtime audit | Use project file version if editor is unavailable. |
| dotnet | Runtime audit | Mark .NET unavailable. |
| Java/JDK | Runtime audit | Mark Java unavailable. |
| Maven | Runtime audit | Mark Maven unavailable. |
| Gradle | Runtime audit | Mark Gradle unavailable. |
| Xcode tooling | Future iOS project analysis | Future roadmap; do not require for MVP. |
| Android SDK/Gradle tooling | Future Android project analysis | Future roadmap; do not require for MVP. |

## Required Runtime Dependencies

Install these for the initial app:

```bash
bun add @opentui/core chalk commander zod ink react
```

| Package | Layer | Reason |
|---|---|---|
| `@opentui/core` | `src/tui` | Native OpenTUI renderer for the default rich dashboard in interactive terminals. |
| `chalk` | `src/cli` | Non-TTY welcome banner and plain CLI color fallback. |
| `commander` | `src/cli` | CLI command routing, options, help output, and subcommands. |
| `zod` | `src/config`, `src/core`, adapters | Runtime validation for config, parsed command output, JSON data, and persisted metadata boundaries. |
| `ink` | `src/tui` | Existing React-style TUI component shell; keep until deliberately migrated or removed. |
| `react` | `src/tui` | Required peer/runtime model for Ink components. |

## Required Dev Dependencies

Install these for TypeScript and quality checks:

```bash
bun add -d typescript @types/react
```

| Package | Reason |
|---|---|
| `typescript` | Type checking, strict mode, editor tooling. |
| `@types/react` | Type support for Ink/React TUI components. |

Bun provides `bun test`, so do not add a separate test runner for MVP.

## Bun Built-ins To Prefer

Use these before adding dependencies:

| Feature | Preferred approach |
|---|---|
| SQLite | `bun:sqlite` |
| Test runner | `bun test` |
| File IO | `Bun.file`, `Bun.write`, or Node-compatible `fs/promises` |
| Child processes | `Bun.spawn` or `Bun.spawnSync` behind a process runner adapter |
| Environment variables | `Bun.env` at the app boundary |
| Package scripts | `bun run` |

SQLite note:

- Prefer `bun:sqlite` for MVP.
- Do not add Prisma, Drizzle, Kysely, or another ORM until repository code becomes hard to maintain manually.
- Keep SQL inside `src/db`.

## Recommended Optional Dependencies

Add these only when the feature needs them:

| Package | Feature | When to add |
|---|---|---|
| `@commander-js/extra-typings` | CLI typing | Add if command option types become loose or repetitive. |
| `ink-select-input` | TUI selection lists | Add when implementing interactive list/select views. |
| `ink-text-input` | TUI text fields | Add when implementing notes, search, filters, or config editing in TUI. |
| `ink-spinner` | TUI loading state | Add for long scans, Docker analysis, archive operations. |
| `ink-table` or custom table component | TUI tables | Prefer custom first if table needs filtering, truncation, and responsive widths. |
| `chalk` | Non-TUI CLI color | Add only if Ink/Text styling does not cover CLI output needs. |
| `strip-ansi` | Testing terminal output | Add if snapshot or width tests need ANSI cleanup. |
| `string-width` | Terminal layout | Add if custom table truncation must handle wide Unicode correctly. |
| `filesize` | Human-readable sizes | Add only if local formatting helpers become inadequate. |
| `semver` | Runtime version comparison | Add when latest/current version comparisons need real SemVer behavior. |
| `ignore` | Gitignore-style matching | Add if custom ignore matching becomes fragile. |
| `tar` | Cross-platform archive creation | Add if system `tar` is not reliable enough through the platform adapter. |

## Dependencies To Avoid Initially

Avoid these until a task proves they are needed:

| Dependency type | Reason |
|---|---|
| ORM | SQLite schema is small; repositories keep SQL understandable. |
| Full app framework | kundol is a CLI/TUI, not a web app. |
| Separate test runner | Bun already provides a test runner. |
| Heavy logging framework | CLI apps need clear user output more than structured server logs. |
| Shell command wrappers everywhere | Use one process runner adapter instead. |
| Global state containers | Core services can be composed explicitly. |

## Package Ownership By Layer

| Layer | Allowed dependencies |
|---|---|
| `src/cli` | `commander`, formatting helpers, core services |
| `src/tui` | `ink`, `react`, optional Ink components |
| `src/core` | local domain modules, `zod` only at trust boundaries |
| `src/db` | `bun:sqlite`, local repository helpers |
| `src/config` | `zod`, filesystem adapter |
| `src/platform` | Bun/Node APIs for filesystem, process, home directory, clock |
| `src/shared` | dependency-light utilities |

Core modules should not import Ink, React, or Commander.

## Install Workflow

Initial setup:

```bash
bun init
bun add commander zod ink react
bun add -d typescript @types/react
```

Expected scripts:

```json
{
  "scripts": {
    "dev": "bun run src/cli/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "check": "bun run typecheck && bun test"
  }
}
```

The exact entrypoint can change during implementation.
Keep scripts simple and Bun-native.

## System Capability Checks

Implement system tool checks through `src/platform/process-runner.ts`.

Rules:

- Never assume optional tools exist.
- Never fail scan/list/dashboard because Docker or another runtime is missing.
- Runtime audit should report missing tools clearly.
- Docker support should distinguish Docker CLI missing from daemon unavailable.
- Tests should mock command output.

## Future Review Points

Review this document when:

- TUI implementation chooses final Ink helper packages.
- SQLite repository code becomes repetitive enough to justify a query helper.
- Runtime version comparison requires full SemVer behavior.
- Archive creation needs cross-platform behavior beyond system `tar`.
- Docker analysis needs richer structured parsing than CLI JSON output provides.
