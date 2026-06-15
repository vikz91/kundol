# Implementation Wave 001 Coordination

Created: 2026-06-15 15:21:12 IST  
Related tasks: KUN-003, KUN-004, KUN-005, KUN-006, KUN-008, KUN-009, KUN-010 through KUN-020, KUN-025 through KUN-032

## Purpose

Coordinate the first parallel implementation wave without changing settled product decisions.

kundol remains a Bun + TypeScript CLI/TUI with a single user-scoped SQLite database at `$HOME/.kundol/kundol.db`. Config lives in SQLite tables. `index` is broad workspace discovery, `scan <project>` is deep project inspection, and `clean <project>` is the dry-run-first cleanup path.

## Active Workstreams

| Workstream | Active tasks | Owner | Scope |
|---|---|---|---|
| Foundation and CLI | KUN-003, KUN-004 | Fullstack Developer Agent 1 | Package scaffold, TypeScript config, scripts, CLI entrypoint, command routing, help output. |
| SQLite and config | KUN-005, KUN-006, KUN-008, KUN-009 | Fullstack Developer Agent 2 | Schema, migrations, DB init, settings, workspaces, excluded paths, first-run defaults. |
| Discovery core | KUN-010, KUN-011, KUN-012, KUN-013, KUN-014 | Fullstack Developer Agent 3 | Marker detection, traversal, runtime/type inference, size calculation, read-only Git metadata. |

## Dependencies

- KUN-004 depends on KUN-003, but command stubs can be developed against the scaffold while package scripts settle.
- KUN-006 depends on KUN-005; keep schema and migration code together until the first DB contract is stable.
- KUN-009 depends on KUN-008; first-run behavior should use the same config access layer that later commands use.
- KUN-010 through KUN-014 are active as core modules; defer DB persistence and command integration until KUN-004, KUN-006, KUN-007, and KUN-009 provide stable contracts.
- KUN-015 and KUN-016 should wait for repository/config contracts and the discovery core outputs.
- KUN-017 through KUN-020 should wait until `index` writes stable project rows.
- KUN-025 through KUN-032 should not delete anything and should wait for a shared safety policy module before scan and clean behavior are wired.

## Merge-Risk Areas

- `package.json`, `tsconfig.json`, and script names: foundation and test/integration agents may both need these.
- CLI command registry: avoid multiple agents independently wiring the same command names.
- SQLite schema shape: repositories, config, index, scan, and dashboard all depend on table names and column semantics.
- Timestamp and path normalization: use one shared convention for IST task docs, UTC or ISO storage, and absolute filesystem paths.
- Safety classification vocabulary: keep safe, caution, and protected categories consistent between scan output, clean execution, and docs.

## Recommended Integration Order

1. Merge KUN-003 scaffold first.
2. Merge KUN-004 CLI routing after package scripts and binary naming are present.
3. Merge KUN-005 and KUN-006 together so schema and migrations cannot drift.
4. Merge KUN-008 and KUN-009 after the DB initialization path is stable.
5. Merge KUN-010 through KUN-014 as pure/read-only discovery modules before wiring them to DB writes.
6. Implement KUN-007 repository functions, then KUN-015 lifecycle inference and KUN-016 `index` integration.
7. Start KUN-025 before KUN-030 through KUN-032 so scan recommendations use one safety policy.
8. Add registry commands KUN-017 through KUN-020 after `index` writes stable project rows.

## Coordination Notes

- Keep implementation code scoped by layer: `cli` calls application services, application services call core/repositories, and core never imports CLI/TUI code.
- Do not introduce hidden network calls in `index`, `list`, `dashboard`, or `scan`.
- Do not add project-file mutation to `index` or `scan`.
- Use the demo seeder for manual smoke testing once `init`, `index`, `list`, and `scan` begin to work.
