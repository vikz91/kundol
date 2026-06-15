# Command Spec: `kundol scan <project>`

Created: 2026-06-14 01:08:32 IST  
Last updated: 2026-06-14 01:08:32 IST  
Related tasks: `KUN-030`, `KUN-031`, `KUN-032`, `KUN-059`, `KUN-063`

## Purpose

`kundol scan <project>` deeply inspects one project or a selected set of indexed projects.
This command was previously called `analyze`; `scan` is the friendlier customer-facing word.

It reads project contents, calculates cleanup opportunities, classifies safe/caution/protected items, and stores a scan result.
It must never delete files.

## Command

```bash
kundol scan <project>
```

## MVP Flags

```bash
kundol scan <project>
kundol scan <project> --json
kundol scan <project> --largest
kundol scan --all
kundol scan --status stale
kundol scan --runtime node
kundol scan --top-size 20
kundol scan --since-last-index
```

## Naming

Command meanings:

- `index` means broad workspace discovery and registry update.
- `scan` means deep inspection of one or more already indexed projects.
- `clean` means apply safe generated-file cleanup after preview.

Avoid using `analyze` as a customer-facing MVP command.
It can remain an internal service/module name if useful.

## Target Selection

Supported target modes:

| Mode | Meaning |
|---|---|
| `<project>` | Scan one project by id, name, or path. |
| `--all` | Scan all indexed, non-excluded projects. |
| `--status <status>` | Scan projects matching lifecycle status. |
| `--runtime <runtime>` | Scan projects matching runtime. |
| `--top-size <n>` | Scan the largest `n` indexed projects. |
| `--since-last-index` | Scan projects changed since last index. |

MVP can implement single-project scan first.
Bulk target flags are safe because scanning does not delete anything, but they may be implemented incrementally.

## Preconditions

- kundol must be initialized.
- Project must already be indexed unless a path target is explicitly supported.
- Database must be readable/writable.
- Project path must still exist.
- Project path must not be excluded.

If the project is not found:

```text
Project not found.
Run `kundol list --search <query>` or `kundol index`.
```

## What Scan Reads

Scan may read:

- Directory tree.
- Runtime marker files.
- Lockfiles/manifests.
- Generated directories.
- File sizes.
- Git status metadata.
- Project-local config files needed for classification.

Scan must not:

- Run package scripts.
- Install dependencies.
- Modify project files.
- Delete files.
- Start Docker containers.
- Connect to remote services.

## What Scan Saves

Per project scan result:

- Total project size.
- Safe cleanup bytes.
- Caution bytes.
- Protected bytes when cheaply known.
- Largest files/directories.
- Safe cleanup candidates.
- Caution items.
- Protected items.
- Recommendations.
- Git safety summary.
- Scan timestamp.
- Warnings.

Suggested tables:

```text
project_scans
scan_items
recommendations
```

Or equivalent schema under the project registry.

## Cleanup Classes

### Safe

Generated artifacts that can be recreated:

- `node_modules`
- `.next`
- `.nuxt`
- `.turbo`
- `.cache`
- `coverage`
- Python caches.
- Rust `target`.
- Java `target`/Gradle `build`.
- .NET `bin`/`obj`.

### Caution

Needs human review:

- Local databases.
- Media/uploads.
- Release builds.
- Generated reports.
- Unknown large files.
- Virtual environments if policy marks them caution.

### Protected

Never automatically clean:

- `.git`
- `.env`
- `.env.*`
- source files
- migrations
- assets
- uploads/media
- lockfiles/manifests
- database files

## Output

Plain output:

```text
voice-ai
Path: ~/Projects/voice-ai
Runtime: Node.js / Bun
Git: clean, remote exists

Total size:       5.8 GB
Safe cleanup:     4.1 GB
Needs review:     1.2 GB
Protected:        500 MB

Safe to clean:
  node_modules     3.2 GB
  .next            700 MB
  coverage         200 MB

Needs review:
  local.db         900 MB   database file
  exports/         300 MB   generated reports?

Recommendations:
  Run `kundol clean voice-ai` to preview safe cleanup.
  Review `local.db` manually.
```

## JSON Output

```json
{
  "ok": true,
  "project": {
    "id": "voice-ai",
    "name": "voice-ai",
    "path": "/Users/me/Projects/voice-ai"
  },
  "summary": {
    "totalSizeBytes": 5800000000,
    "safeCleanupBytes": 4100000000,
    "cautionBytes": 1200000000,
    "protectedBytes": 500000000
  },
  "items": [
    {
      "path": "node_modules",
      "kind": "safe",
      "sizeBytes": 3200000000,
      "reason": "Generated dependency directory."
    }
  ],
  "recommendations": [
    {
      "kind": "clean",
      "message": "Run `kundol clean voice-ai` to preview safe cleanup."
    }
  ],
  "warnings": []
}
```

## Exit Codes

| Code | Meaning |
|---:|---|
| `0` | Scan completed. |
| `1` | Unexpected error. |
| `2` | Not initialized. |
| `3` | Project not found or excluded. |
| `4` | Project path missing/unreadable. |
| `5` | Database write failed. |

Warnings alone must not produce non-zero exit.

## Safety Rules

- Never delete files.
- Never mutate project files.
- Never run install/build/test/package scripts.
- Never scan excluded paths.
- Never classify protected files as safe.
- Never include Docker resource cleanup in project scan.

## Tests

Required tests:

- Scans one indexed project.
- Fails clearly for missing project.
- Fails clearly for excluded project.
- Classifies safe generated directories.
- Classifies caution database/media/report files.
- Protects `.git`, `.env`, source, migrations, assets, lockfiles, and databases.
- Saves scan result metadata.
- JSON output has stable shape.
- Does not call cleanup/delete services.
- Bulk target selection does not include excluded projects.

## Open Questions

- Should `kundol scan <path>` auto-index an unindexed path, or require `kundol index` first?
- Should bulk scan run concurrently or sequentially in MVP?
