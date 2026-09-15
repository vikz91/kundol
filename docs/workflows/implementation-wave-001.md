# Implementation Wave 001 — Archived Coordination Note

Created: 2026-06-15
Archived: 2026-09-15
Related tasks: `KUN-003`–`KUN-020`, `KUN-025`–`KUN-032`, `KUN-092`

This page records the first Bun/TypeScript implementation split. Its original `init`, `index`, project-registry `list`, `scan`, `clean`, dashboard, and TUI integration plan is **historical**. Those commands are not registered in the current public CLI; `kundol tools list` is a different command that reads the optimisation catalogue. Use [usage](../usage.md), [commands](../commands.md), [codebase context](../context.md), and the [task ledger](../plan.md) for current work.

## What the wave established

| Area | Early work |
|---|---|
| Foundation | Bun package, TypeScript config, CLI routing, scripts, and help output. |
| Data | User-scoped SQLite schema, migrations, settings, workspaces, and exclusions. |
| Discovery and safety | Project marker traversal, read-only metadata, scan candidates, and shared path classification. |

The discovery, project-registry, scan/clean, and archive modules built after this early wave have since been retired. The public storage route does not read persisted scan rows; it probes published user-scope cache rules. The public product now uses `kundol optimise storage|projects|repos` workflows and catalogue browsing under `kundol tools ...`.

## Durable coordination rules

Keep command registration owned by one integration worker, and avoid concurrent edits to schema, package scripts, or shared safety vocabulary. CLI handlers call services/core; core does not import presentation code. Discovery and plans should remain read-only until the explicit apply path, and tests should use disposable homes/workdirs. These lessons survive the cancelled command plan; the task dependencies and integration order from Wave 001 do not.
