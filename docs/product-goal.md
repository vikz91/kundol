# Product Goal

Created: 2026-06-13 08:34:13 IST  
Last updated: 2026-06-13 08:34:13 IST  
Related tasks: `KUN-003`, `KUN-004`, `KUN-010`, `KUN-011`, `KUN-012`, `KUN-016`, `KUN-032`, `KUN-033`, `KUN-036`, `KUN-057`

## Main Goal

kundol is a Bun.js CLI/TUI app that scans developer workspaces, identifies user-created projects, and analyzes them by runtime and project shape.

The app should help a developer answer:

- What projects exist across my workspace folders?
- What kind of project is each one?
- Which runtime/toolchain does each project use?
- How much disk space does each project use?
- Which generated files, dependency folders, build outputs, and stale artifacts can be cleaned safely?
- Which projects are stale, active, paused, archived, or risky to touch?

## Product Shape

kundol has three primary parts:

- CLI commands for scriptable workflows.
- TUI screens for interactive exploration, review, and confirmation.
- Non-AI workers that scan folders, collect metadata, analyze runtimes, compute sizes, and classify cleanup candidates.

Workers are deterministic system workers, not AI agents.
They should be testable, bounded, cancellable where possible, and safe around user data.

## Primary Workflow

```text
workspace folders
  -> non-AI index workers
  -> project detection
  -> runtime/type inference
  -> metadata + disk usage collection
  -> SQLite registry
  -> CLI/TUI views
  -> project scan + recommendations
  -> dry-run cleanup/archive workflows
```

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

Docker monitoring and cleanup is valuable but should remain adjacent to the main project-scanning goal.

Docker support should:

- Track images, containers, volumes, networks, and build cache.
- Link Docker resources to projects only when labels or paths make that relationship clear.
- Keep Docker purge safety rules separate from project-local cleanup rules.

## Non-Goals For MVP

- Cloud sync.
- Team dashboards.
- AI-generated recommendations.
- One-click broad cleanup.
- Scanning the entire home directory by default.
- Modifying project source code.
- Installing or updating runtimes automatically.

## Design Implications

- The codebase should be Bun-first and TypeScript-first.
- CLI/TUI presentation must stay separate from scanning/analyzer workers.
- Runtime support should be plugin-like internally: each runtime has markers, analyzers, cleanup rules, and audit commands.
- Project discovery must identify user-created projects, servers, web apps, libraries, CLIs, experiments, and mixed-runtime repos.
- Cleanup recommendations must be explainable and conservative.
- Every destructive action must be dry-run first and explicitly confirmed.
