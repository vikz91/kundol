# kundol Architecture

Created: 2026-06-13 07:24:10 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-002`, `KUN-003`, `KUN-004`, `KUN-005`, `KUN-016`, `KUN-024`, `KUN-032`, `KUN-042`

## Summary

kundol is a Bun + TypeScript CLI/TUI application with a worker-driven workspace indexing and project scanning core.
The architecture should stay scalable by separating presentation, deterministic workers, domain logic, persistence, configuration, and platform side effects.

The main rule: CLI and TUI code may depend on the core, but the core must not depend on CLI or TUI code.

## Architecture Goals

- Keep project discovery, analysis, recommendations, runtime audit, and archival logic testable without rendering a terminal UI.
- Run workspace indexing and project scanning through non-AI workers that can be tested, bounded, and coordinated independently.
- Keep destructive filesystem behavior isolated and easy to audit.
- Support both scripted CLI commands and richer interactive TUI flows.
- Make SQLite persistence reliable without leaking SQL details throughout the app.
- Support JavaScript runtimes, Java, .NET, Python, Rust, and Go without rewriting the core scanner.
- Leave iOS and Android as future runtime analyzer roadmap items.
- Support Docker resource monitoring as an adjacent capability without mixing Docker safety rules into project-local cleanup.
- Keep Bun/npm dependencies minimal and documented in `docs/dependencies.md`.
- Use one user-scoped SQLite database at `$HOME/.kundol/kundol.db`; do not create per-workspace databases.
- Store app config in SQLite tables inside the same database.
- Let agents work in parallel with low merge conflict risk.

## Recommended Source Layout

```text
src/
  cli/
    index.ts
    commands/
      index.ts
      list.ts
      dashboard.ts
      runtimes.ts
      scan.ts
      clean.ts
      show.ts
      config.ts
  tui/
    app.tsx
    views/
      dashboard-view.tsx
      project-list-view.tsx
      project-detail-view.tsx
      project-scan-view.tsx
      runtime-audit-view.tsx
      compact-confirm-view.tsx
    components/
      table.tsx
      status-pill.tsx
      size-text.tsx
      empty-state.tsx
      confirm-dialog.tsx
    theme.ts
    keymap.ts
  core/
    workers/
      worker.ts
      worker-runner.ts
      index-worker.ts
      analysis-worker.ts
      runtime-audit-worker.ts
    projects/
      project.ts
      project-status.ts
      project-service.ts
    discovery/
      markers.ts
      scanner.ts
      type-inference.ts
      size.ts
      git-metadata.ts
    analysis/
      analyzer.ts
      cleanable-item.ts
      largest-items.ts
    recommendations/
      recommendation.ts
      recommendation-engine.ts
    runtimes/
      runtime.ts
      detector.ts
      latest-version.ts
    archive/
      archive-service.ts
      compact-service.ts
      archive-paths.ts
    docker/
      docker-service.ts
      docker-resource.ts
      docker-analyzer.ts
      docker-purge-service.ts
    safety/
      policy.ts
      protected-paths.ts
      dry-run.ts
  db/
    client.ts
    migrations/
    repositories/
      project-repository.ts
      tag-repository.ts
      action-repository.ts
  config/
    paths.ts
    config-schema.ts
    load-config.ts
    save-config.ts
  platform/
    fs.ts
    process-runner.ts
    clock.ts
    home.ts
  shared/
    errors.ts
    result.ts
    format.ts
    logger.ts
  test/
    fixtures/
    helpers/
```

## Dependency Direction

```text
cli -> core -> db/config/platform/shared
tui -> core -> db/config/platform/shared
core -> db/config/platform/shared
core/workers -> core services -> db/config/platform/shared
db -> shared
config -> shared
platform -> shared
```

Rules:

- `core/` must not import from `cli/` or `tui/`.
- `db/` must not import from `cli/`, `tui/`, or feature-specific presentation modules.
- `platform/` owns direct filesystem, process, home-directory, and clock access.
- `safety/` owns destructive-action rules.
- `workers/` owns deterministic index/project-scan/audit job orchestration.
- Command handlers should orchestrate services, not implement business logic.
- TUI views should render state and dispatch user intent, not scan directories or mutate files directly.

## Layers

### CLI Layer

Purpose: parse arguments, call services, and print non-interactive output.

Responsibilities:

- Command routing.
- Flags and argument validation.
- Plain table or JSON output where useful.
- Exit codes.
- Mapping domain errors to readable terminal messages.

Keep CLI handlers thin. A command like `index` should call `projectService.indexWorkspaces()` rather than walking directories itself.

### TUI Layer

Purpose: provide interactive terminal workflows.

Responsibilities:

- Views and navigation.
- Keyboard shortcuts.
- Progress and loading states.
- Confirmation flows.
- Terminal-friendly formatting.

The TUI should use the same services as CLI commands.
If a behavior exists in both CLI and TUI, the behavior belongs in `core/`.

### Core Layer

Purpose: hold product behavior.

Responsibilities:

- Non-AI worker orchestration.
- Project discovery.
- Lifecycle status inference.
- Cleanup analysis.
- Recommendations.
- Runtime audit.
- Archive and compact orchestration.
- Safety policy enforcement.

Core services should accept explicit dependencies such as repositories, filesystem adapters, process runners, and clocks.
That keeps tests fast and avoids touching real user data.

### Worker Layer

Purpose: run deterministic indexing and project-scan jobs outside presentation code.

Responsibilities:

- Workspace index jobs.
- Project metadata collection.
- Runtime/type inference jobs.
- Disk usage jobs.
- Cleanup analysis jobs.
- Runtime audit jobs.
- Progress, cancellation, and partial failure reporting.

Workers must not use AI.
They should be ordinary TypeScript modules with explicit inputs and outputs.
Long-running workers should report progress and tolerate partial failures.

### Database Layer

Purpose: isolate SQLite access.

Responsibilities:

- Database connection lifecycle.
- Migrations.
- Typed repository methods.
- Query performance and indexes.
- Audit action writes.

Prefer repository methods that express intent:

```ts
projectRepository.upsertScannedProject(project)
projectRepository.findByNameOrPath(input)
actionRepository.record(projectId, "INDEX", details)
```

Avoid leaking raw SQL outside `db/`.

### Config Layer

Purpose: own user configuration paths and parsing.

Responsibilities:

- Config directory paths.
- User-scoped database path.
- Workspace roots.
- User-excluded project/workspace paths.
- Archive directory.
- User preferences.
- Schema validation.
- Default first-run behavior.

Do not scan broad directories by default.
The app should never surprise a user by indexing their whole home directory.
Commands should work from any current working directory after init.

### Platform Layer

Purpose: wrap side effects so they are mockable.

Responsibilities:

- Filesystem reads/writes.
- Directory traversal.
- Process execution.
- Runtime command detection.
- Clock/time.
- Home directory resolution.

Core logic should depend on this layer through small interfaces.

## Domain Boundaries

### Projects

Owns project identity, lifecycle status, metadata, and registry behavior.

Stable concepts:

- `Project`
- `ProjectType`
- `ProjectStatus`
- `WorkspaceRoot`
- `ProjectId`

### Discovery

Owns finding projects and reading non-destructive metadata.

Discovery can read:

- Project marker files.
- Git metadata.
- Directory size.
- File modification/access metadata.

Discovery must not:

- Delete files.
- Install dependencies.
- Modify Git state.
- Run package scripts.

### Analysis

Owns finding cleanable and caution items.

Analysis can identify:

- Safe generated directories.
- Potentially recoverable bytes.
- Large items.
- Caution items.

Analysis must not delete anything.

### Recommendations

Owns turning facts into user advice.

Examples:

- Delete `node_modules`.
- Archive inactive project.
- Safe archive because Git is clean and remote exists.
- Review media/database assets manually.

### Archive

Owns compact/archive workflows.

Archive workflow:

1. Analyze.
2. Run safety preflight.
3. Verify Git status.
4. Remove safe generated files only when not dry-run.
5. Create archive.
6. Update metadata.
7. Optionally delete source only with explicit confirmation.

### Runtime Audit

Owns runtime and package-manager version checks.

Runtime audit must degrade gracefully when tools are missing or the network is unavailable.
Normal project scanning should not require network access.
Runtime-specific workflow rules are maintained in `docs/project-runtimes.md`.
Future iOS and Android analyzer rules should be added as runtime analyzers when the roadmap reaches mobile support.

### Docker

Owns Docker resource discovery, analysis, recommendation, and purge orchestration.

Docker support can read:

- Images.
- Containers.
- Volumes.
- Networks.
- Build cache.
- Compose labels.

Docker support must not:

- Remove running containers.
- Remove mounted volumes.
- Remove networks in use.
- Run broad destructive prune commands by default.
- Purge volumes without an explicit volume-specific confirmation.

Docker workflow rules are maintained in `docs/docker.md`.

## Data Flow Examples

### Scan

```text
CLI/TUI intent
  -> project service
  -> config workspace roots
  -> discovery scanner
  -> git metadata + size + type inference
  -> project repository upsert
  -> action repository INDEX
  -> result formatted by CLI/TUI
```

### Analyze

```text
CLI/TUI intent
  -> project lookup
  -> project scanner/analyzer
  -> safety policy
  -> recommendation engine
  -> update cleanable_bytes
  -> action repository PROJECT_SCAN
  -> result formatted by CLI/TUI
```

### Compact

```text
CLI/TUI intent
  -> compact service
  -> scan project
  -> safety preflight
  -> dry-run summary or confirmed execution
  -> archive service
  -> project metadata update
  -> action repository COMPACT/ARCHIVE
  -> result formatted by CLI/TUI
```

## Error Handling

Use typed errors or result objects for expected failures.

Expected failures:

- Workspace root does not exist.
- Permission denied while scanning a subdirectory.
- Project cannot be found.
- Git command unavailable.
- Runtime command unavailable.
- Network unavailable for latest-version lookup.
- Archive destination already exists.

Unexpected failures can throw, but command handlers should catch and render them cleanly.

Prefer partial success for indexes.
One unreadable directory should not fail the entire workspace index.

## Scalability Guidelines

- Traverse directories iteratively or with controlled concurrency.
- Skip ignored directories early.
- Avoid loading huge directory trees into memory.
- Store index results incrementally when practical.
- Index SQLite columns used for search and filters.
- Keep large output paginated or summarized in TUI views.
- Cache expensive runtime latest-version lookups.
- Use cancellation support for long-running TUI operations when possible.

## Maintainability Guidelines

- Keep modules small and named by responsibility.
- Keep constants for statuses, action names, and safety policies centralized.
- Keep formatting functions separate from data gathering.
- Inject clock and filesystem dependencies in tests.
- Prefer explicit data models over untyped objects.
- Add tests at the domain boundary where behavior matters.
- Document non-obvious tradeoffs in `learnings.md`, then promote durable decisions to `docs/`.

## Initial Technology Defaults

- Runtime: Bun.
- Language: TypeScript.
- Module system: ESM.
- Tests: `bun test`.
- Database: SQLite, preferably via `bun:sqlite` unless project needs require a higher-level wrapper.
- CLI parser: choose during implementation, but keep command handlers thin.
- TUI: React-style terminal UI is preferred if it integrates cleanly with Bun.
- Dependency source of truth: `docs/dependencies.md`.

## Open Architecture Decisions

- Final CLI binary name: `kundol`, `devshelf`, or both.
- Exact app directory details. Database path is decided as `$HOME/.kundol/kundol.db`; config lives in DB tables.
- TUI framework selection.
- Whether non-interactive commands should support `--json` in MVP.
- Exact lifecycle thresholds for `ACTIVE`, `PAUSED`, and `STALE`.
