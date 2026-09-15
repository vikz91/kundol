# Product Goal

Created: 2026-06-13 08:34:13 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-003`, `KUN-004`, `KUN-010`, `KUN-011`, `KUN-012`, `KUN-016`, `KUN-032`, `KUN-033`, `KUN-036`, `KUN-057`, `KUN-077`, `KUN-080`, `KUN-092`

kundol is a macOS-first Bun and TypeScript CLI for optimising developer-machine storage, eligible startup items, and generated code-project artifacts. It should help a user see **what** is selected, **why**, and **what happened** before trusting it with cleanup. The first-time [Docker sandbox](demo/docker-sandbox.md) makes that workflow testable against disposable files.

## Current product

```text
chosen storage/startup scope or workdir
  -> deterministic scan and classification
  -> printed plan and confirmation/selection (or -f)
  -> applicable live checks and execution
  -> report, SQLite actions, and session audit
```

The public commands are `kundol` and `kundol optimise storage|startup|projects|repos`. Project scanning detects Node/Bun/Deno, Python, Go, Rust, Java, and .NET markers under an explicit workdir. `repos` is currently the same project workflow without Git filtering. Storage includes available package/runtime cache commands, old top-level temp entries, broad Docker system prune without volumes, and previously indexed inactive projects. Startup discovery and disablement are macOS-specific. See [commands](commands.md) and [context](context.md) for exact behavior and safety limitations.

The earlier workspace index, project registry, scan/clean, recommendation, and archive code remains internally, but its former public commands were removed. A new installation cannot populate that registry from the current CLI. Deterministic workers are system code, not AI agents.

## Design direction

Keep CLI presentation separate from scanners and safety services. Explain each candidate and report partial failure instead of hiding it. Preserve project source and user data; do not scan the whole home directory by default or modify source code. Do not install/update runtimes, sync to cloud, or add team dashboards as part of this CLI.

Individual Docker resource inventory, narrower temp selection, runtime audits, iOS/Android analyzers, and any future UI are proposals rather than shipped features. Docker resource safety must stay separate from project-local generated-file rules. The immediate safety design work is described in [storage optimiser](storage-optimizer.md) and [architecture](architecture.md).
