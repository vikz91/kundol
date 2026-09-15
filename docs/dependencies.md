# Bun Dependency Knowledge Base

Created: 2026-06-13 07:30:45 IST  
Last updated: 2026-09-15 11:39:56 IST
Related tasks: `KUN-077`, `KUN-F013`, `KUN-080`, `KUN-084`, `KUN-083`, `KUN-087`, `KUN-088`

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
| `zod` | `src/core/optimisation-registry` | Strict registry parsing and semantic safety validation for JSON contributions. |

## Dev Dependencies

```bash
bun add -d typescript @types/bun eslint @eslint/js typescript-eslint husky
```

| Package | Reason |
|---|---|
| `typescript` | Strict type checking. |
| `@types/bun` | Bun runtime types. |
| `eslint` and `@eslint/js` | Recommended JavaScript lint rules and the CLI linter. |
| `typescript-eslint` | Recommended TypeScript lint rules. |
| `husky` | Installs local pre-commit and pre-push hooks through `prepare`. |

The pre-commit hook first runs `check:tools`, then `lint`, `typecheck`, and `build:check`, then offers the version bump before Git writes the commit. `check:tools` compares the running Bun version and locally installed TypeScript package version with `engines.bun` and `devDependencies.typescript` in `package.json`; a missing or incompatible version fails the commit. The pre-push hook runs `smoke:cli`, which launches the bare CLI and `--help` with a temporary `HOME`. `build:check` bundles to `/dev/null`, leaving no build artifact in the worktree.

The macOS release workflow uses Bun standalone compilation for arm64 and x64. `lipo` combines the binaries, and `codesign` applies and verifies an ad hoc signature. Both tools are required on the release runner; no npm release-packaging dependency is added.

## Optional System Tools

These tools are used opportunistically by storage optimisation. Missing tools should be skipped gracefully.

The [Docker sandbox](demo/docker-sandbox.md) installs production Bun dependencies from the frozen lockfile with lifecycle scripts disabled. Its `docker` command and macOS startup runner are fixture-only mocks; host system tools are not passed into the image.

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
