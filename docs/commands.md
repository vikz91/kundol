# Commands

Created: 2026-06-14 00:33:03 IST  
Last updated: 2026-09-15 10:22:44 IST
Related tasks: `KUN-077`, `KUN-F013`, `KUN-080`

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
| `kundol optimise repos <workdir>` | Alias for the same scanner and cleanup handler as `projects`; Git metadata is not required. |

`optimise` intentionally uses British spelling. Do not add an `optimize` alias unless the product direction changes.

## Only Option

Each optimise subcommand exposes exactly one workflow option:

```bash
-f, --force
```

`-f` skips the confirmation prompt or startup item selection after scanning. It does not skip scanning, planning, available live checks, reporting, or audit logging.

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

1. Scan the requested scope and classify candidates.
2. Print the selected cleanup plan.
3. Ask `[y/N]` for storage/projects/repos or ask for startup item numbers; `-f` skips the prompt.
4. Execute selected actions with the applicable live checks.
5. Print applied/disabled/removed, skipped, and failed counts. Project reports include estimated reclaimed bytes; storage and startup reports do not.
6. Write session and durable audit records.

Without an interactive terminal, a run without `-f` still prints its plan, then cancels and exits with code 0. Apply results containing failures return code 70. See [`context.md`](context.md) for exact target scopes and limitations.

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

Startup optimisation currently supports macOS discovery. The displayed action list is filtered to non-Apple user LaunchAgents under `~/Library/LaunchAgents`; system LaunchAgents, LaunchDaemons, Apple-labeled agents, and app Login Items are not actionable. Startup rows show discovered name and description; missing metadata is shown as `! unknown`.
