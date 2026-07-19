# Bun Dependency Knowledge Base

Created: 2026-06-13 07:30:45 IST  
Last updated: 2026-06-16 05:45:00 IST  
Related tasks: `KUN-077`, `KUN-F013`

## Purpose

kundol is a Bun + TypeScript CLI project.
This document tracks npm dependencies, Bun/runtime features, and optional system tools.

## Dependency Principles

- Use Bun as runtime, package manager, script runner, and test runner.
- Keep the dependency set small.
- Prefer Bun built-ins and Node standard APIs for filesystem, processes, tests, and SQLite.
- Keep destructive filesystem behavior behind services that can be tested with temp directories.
- Do not add TUI, React, Ink, OpenTUI, or web dependencies unless the product direction changes again.

## Runtime Dependencies

```bash
bun add commander zod
```

| Package | Layer | Reason |
|---|---|---|
| `commander` | `src/cli` | CLI command routing, help output, and subcommands. |
| `zod` | config/core boundaries | Runtime validation for config and persisted metadata boundaries. |

## Dev Dependencies

```bash
bun add -d typescript @types/bun
```

| Package | Reason |
|---|---|
| `typescript` | Strict type checking. |
| `@types/bun` | Bun runtime types. |

## Optional System Tools

These tools are used opportunistically by storage optimisation. Missing tools should be skipped gracefully.

| Tool | Used for |
|---|---|
| Docker CLI/daemon | `docker system prune --force` without volumes. |
| npm | `npm cache verify`. |
| pnpm | `pnpm store prune`. |
| Yarn | `yarn cache clean`. |
| Bun | `bun pm cache rm`. |
| Python/pip | `python3 -m pip cache purge`. |
| Go | `go clean -cache -testcache`. |
| launchctl | macOS startup item disable flow. |
| osascript | macOS Login Items discovery. |

## Bun Built-ins To Prefer

| Feature | Preferred approach |
|---|---|
| SQLite | `bun:sqlite` |
| Test runner | `bun test` |
| File IO | `fs/promises` or Bun file APIs |
| Child processes | `Bun.spawn` behind service helpers |
| Package scripts | `bun run` |

## Dependencies To Avoid Initially

| Dependency type | Reason |
|---|---|
| TUI/web frameworks | The product is CLI-only. |
| ORM | SQLite schema is small and repositories are explicit. |
| Separate test runner | Bun already provides one. |
| Heavy logging framework | Session and SQLite action audit records cover current needs. |
