# User Flow

Created: 2026-06-13 17:15:01 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-004`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-017`, `KUN-024`, `KUN-032`, `KUN-036`, `KUN-042`

## Primary First-Run Flow

1. User installs kundol.
2. User runs `kundol init`.
3. User selects one or more workspace folders.
4. kundol performs a one-time index.
5. kundol shows a first dashboard summary.
6. User reviews detected projects.
7. User runs project scans for cleanup/runtime recommendations.
8. User optionally enables background monitoring.
9. User returns later through CLI/TUI commands.

## Install

Recommended install paths:

```bash
brew install kundol
```

Alternative:

```bash
curl -fsSL https://kundol.dev/install.sh | sh
```

Install should verify:

- Bun-compatible packaged binary or script is available.
- `kundol --version` works.
- `kundol --help` works.

## Init

Command:

```bash
kundol init
```

`init` should:

- Explain local-first behavior briefly.
- Create config directory.
- Create SQLite database.
- Ask for workspace folders.
- Save workspace configuration.
- Offer to start the first index.

It should not scan the whole home directory by default.

## Workspace Selection

Prompt examples:

```text
Select workspace folders to index:
  ~/Projects
  ~/work
  ~/code
  Choose another folder...
```

User should be able to:

- Add multiple folders.
- Remove a selected folder.
- Confirm the final set.
- Skip common risky roots like `/`, `~`, and system directories.

## One-Time Indexing

After workspace selection:

```bash
kundol index
```

The index worker should:

- Traverse configured workspace folders.
- Detect user-created projects.
- Infer runtimes and project types.
- Collect size and metadata.
- Collect Git metadata.
- Store results in SQLite.
- Report partial failures without aborting the entire index.

The UI should show:

- Current folder being indexed.
- Projects found.
- Skipped folders.
- Warnings.
- Elapsed time.

## Then: First Dashboard

After indexing, kundol should immediately show a summary:

```text
Indexed 132 projects across 3 workspaces

Active:       21
Paused:       34
Stale:        29
Archived:      0

Disk usage:        412 GB
Potential cleanup:  89 GB

Top runtimes:
  JavaScript/TypeScript  76
  Python                 22
  Go                     12
  Rust                    8
  Java                    7
  .NET                    7

Suggested next steps:
  Review largest projects
  Review stale projects
  Review cleanup recommendations
  Check runtime health
  Enable background monitoring
```

This is the important handoff: the user should see value immediately without being asked to delete anything.

## Then: Project Review

User can enter the TUI project list or use CLI commands:

```bash
kundol list
kundol list --status stale
kundol list --runtime node
kundol list --search voice
```

Project list should support:

- Search.
- Filter by runtime.
- Filter by lifecycle status.
- Sort by size.
- Sort by last modified.
- Show dirty Git status.
- Open project detail.

## Then: Project Detail

Project detail should show:

- Name.
- Path.
- Runtime family and markers.
- Size.
- Cleanable bytes.
- Git remote.
- Git branch.
- Dirty status.
- Last modified.
- Last indexed.
- Last project scanned.
- Tags/notes.
- Recommendations.

No destructive action should happen from the first dashboard.
The user must intentionally enter a cleanup/archive flow.

## Then: Project Scan

Command:

```bash
kundol scan <project>
```

Project scan should show:

- Safe generated files.
- Caution items.
- Protected items.
- Largest directories/files.
- Reclaimable bytes.
- Explanation for every recommendation.

Example:

```text
voice-ai-platform

Safe cleanup:
  node_modules        3.2 GB
  .next              900 MB
  coverage           400 MB

Caution:
  local.db           2.4 GB   database, review manually
  uploads/           1.8 GB   user/media data, protected

Recommendations:
  Delete generated JS artifacts
  Archive project only after Git is clean
```

## Then: Dry-Run Cleanup Or Compact

Commands:

```bash
kundol clean <project>
kundol clean <project> --apply
```

Default behavior:

- `clean` is dry-run by default.
- Cleanup requires preview before execution and explicit `--apply`.
- Source deletion is never default.
- Docker purge is separate from project cleanup.

The confirmation screen should show:

- Exact paths/resources affected.
- Estimated reclaimed space.
- Protected items not touched.
- Git safety status.
- Exact cleanup target list.

## Then: Runtime Health

Command:

```bash
kundol runtimes
```

This should show installed/missing/outdated runtime tooling:

- Node.js, npm, pnpm, Yarn, Bun, Deno
- Java
- .NET
- Python
- Rust
- Go

Missing tools are informative, not fatal.

## Then: Background Monitoring

After the first index, kundol may ask:

```text
Enable background monitoring for these workspaces?

This keeps the local registry up to date when projects change.
It only updates metadata. It will never clean, archive, delete, or purge anything in the background.
```

Commands:

```bash
kundol daemon install
kundol daemon start
kundol daemon status
kundol daemon stop
kundol daemon uninstall
```

Background monitoring should:

- Watch configured workspace folders.
- Debounce filesystem changes.
- Queue targeted rescan jobs.
- Update SQLite metadata.
- Never perform destructive actions.

This is post-MVP unless explicitly pulled forward.

## Returning User Flow

Common commands:

```bash
kundol dashboard
kundol list
kundol list --search <query>
kundol scan <project>
kundol runtimes
kundol index
```

If daemon support exists:

```bash
kundol daemon status
```

Returning dashboard should prioritize:

- New projects since last visit.
- Projects that became stale.
- Largest space changes.
- New cleanup opportunities.
- Runtime health changes.
- Docker warnings if Docker support is enabled.

## Product Principle

kundol should earn trust before asking for action.

The first run should answer:

- What did you find?
- Why is it useful?
- What is safe?
- What needs review?
- What can I do next?

It should not start with deletion.
