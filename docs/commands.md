# Commands

Created: 2026-06-14 00:33:03 IST  
Last updated: 2026-06-16 05:45:00 IST  
Related tasks: `KUN-077`, `KUN-F013`

## Direction

kundol is now a CLI-only cleanup tool.

There is no dashboard, TUI, init/index/list/show/scan/clean/runtimes/config command surface in the target product.

## Commands

| Command | Purpose |
|---|---|
| `kundol` | Print the ASCII welcome banner and examples. |
| `kundol optimise storage` | Scan machine-level storage targets, confirm, clean listed items, report, and audit. |
| `kundol optimise startup` | Scan system and app startup items, choose listed user startup items, disable them, report, and audit. |
| `kundol optimise projects <workdir>` | Scan projects under a workdir to depth 7, confirm, remove safe generated/dependency artifacts, report, and audit. |
| `kundol optimise repos <workdir>` | Repo-scoped alias for the same safe generated-artifact cleanup flow under Git-oriented workdirs. |

`optimise` intentionally uses British spelling. Do not add an `optimize` alias unless the product direction changes.

## Only Option

Each optimise subcommand exposes exactly one workflow option:

```bash
-f, --force
```

`-f` skips the confirmation prompt after scanning. It must not skip scanning, planning, safety checks, live path re-checks, reporting, or audit logging.

Do not expose:

```bash
--dry-run
--apply
--no-dry-run
--json
--max-depth
```

Max depth is fixed at 7 for the public CLI.

## Run Contract

Every optimise command follows this sequence:

1. Print or prepare the ASCII command context.
2. Scan the requested scope.
3. Classify cleanup candidates.
4. Print the proposed cleanup plan.
5. Ask for confirmation unless `-f` is present.
6. Execute only listed cleanup targets.
7. Re-check live filesystem paths immediately before deletion.
8. Print removed, skipped, failed, and reclaimed-byte totals.
9. Write session and durable audit records.

## Examples

```bash
kundol
kundol optimise storage
kundol optimise storage -f
kundol optimise startup
kundol optimise startup -f
kundol optimise projects ~/Projects
kundol optimise projects ~/Projects -f
kundol optimise repos ~/Projects
kundol optimise repos ~/Projects -f
```

## Safety

Never automatically remove:

- project roots
- `.git`
- `.env` or `.env.*`
- database files
- uploads
- media
- assets
- migrations
- source files

Docker volumes remain protected from default storage optimisation.

Startup optimisation currently supports macOS startup discovery. The displayed list is filtered to user LaunchAgents under `~/Library/LaunchAgents`; system LaunchAgents, LaunchDaemons, Apple items, and app Login Items are kept out of the action list. Startup rows show discovered name and description; missing metadata is shown as `! unknown`.
