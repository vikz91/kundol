# Product Goal

Created: 2026-06-13 08:34:13 IST  
Last updated: 2026-09-15 10:22:44 IST
Related tasks: `KUN-003`, `KUN-004`, `KUN-010`, `KUN-011`, `KUN-012`, `KUN-016`, `KUN-032`, `KUN-033`, `KUN-036`, `KUN-057`, `KUN-077`, `KUN-080`

## Main Goal

kundol is a macOS-first Bun.js CLI for optimising a developer machine. Its current public commands address storage, startup items, and generated artifacts inside code projects. See [`context.md`](context.md) for implementation scope.

The current CLI helps a developer answer:

- Which machine cache and old temporary targets are in the storage plan?
- Which user LaunchAgents can be disabled without removing their plist files?
- Which generated project directories and files can be removed from a chosen workdir?
- Which planned actions succeeded, failed, or were skipped?

## Product Shape

kundol has three implemented parts:

- CLI commands for storage, startup, project, and repo-labelled workflows.
- Plan-and-confirm terminal prompts for cleanup review.
- Deterministic scanners that inspect filesystem entries, runtime markers, and available tools before making a plan.

Workers are deterministic system workers, not AI agents.
They should be testable, bounded, cancellable where possible, and safe around user data.

## Primary Workflow

```text
storage, startup, or selected workdir
  -> deterministic scan and candidate classification
  -> printed plan and user confirmation/selection (or -f)
  -> applicable live checks and action execution
  -> final report and SQLite/session audit
```

The earlier workspace index, SQLite project registry, project scan, and recommendation services remain in the codebase. Their former `init/index/list/show/scan/clean` commands are not registered in the current CLI. Storage optimisation can still use previously indexed and scanned project rows.

## Current Runtime Scope

Core runtime/project analysis should cover:

- JavaScript/TypeScript: Node.js, Bun, Deno
- Java
- .NET
- Python
- Rust
- Go

## Future Runtime Roadmap

Future roadmap:

- iOS projects
- Android projects

These should be designed as additional runtime analyzers, not separate product lines.

## Adjacent Capabilities

Docker cleanup is adjacent to the main macOS/developer-machine optimisation goal. Today storage optimisation probes Docker availability and offers `docker system prune --force` without volumes; the individual-resource monitoring design below is future work.

Docker support should:

- Track images, containers, volumes, networks, and build cache.
- Link Docker resources to projects only when labels or paths make that relationship clear.
- Keep Docker purge safety rules separate from project-local cleanup rules.

## Non-Goals For MVP

- Cloud sync.
- Team dashboards.
- AI-generated recommendations.
- Unreviewed broad cleanup beyond the current documented storage command scope.
- Scanning the entire home directory by default.
- Modifying project source code.
- Installing or updating runtimes automatically.

## Design Implications

- The codebase should be Bun-first and TypeScript-first.
- CLI presentation must stay separate from scanning/analyzer workers.
- Runtime support should be plugin-like internally: each runtime has markers, analyzers, cleanup rules, and audit commands.
- Project discovery must identify user-created projects, servers, web apps, libraries, CLIs, experiments, and mixed-runtime repos.
- Cleanup recommendations must be explainable and conservative.
- Every destructive optimise action must scan first, print a plan, then explicitly confirm or select startup items unless `-f, --force` is provided.
