# Troubleshooting

## The command only prints help

Bare `kundol` shows the welcome screen; bare `kundol optimise` shows help. Choose a scope such as `kundol optimise projects ~/Projects`. Use the British spelling `optimise`.

For exact options, run `kundol optimise projects --help` or open the [command reference](./reference/cli.md). There are no public `scan`, `clean`, `--dry-run`, `--apply`, or `--json` workflow options.

## The plan appears, but nothing changes

- A blank selection cancels. In a terminal, enter `y` for safe suggestions or displayed numbers for explicit review.
- Piped and other non-interactive runs cancel unless `-f` is supplied. Use `-f` only when you intend to apply safe, force-eligible targets.
- Protected entries are inventory only. Beta status alone does not mean a rule has an executable handler.
- Read each skipped or unavailable reason. A target may have changed since planning or failed an activity, ownership, or identity check.

## A tool or target is unavailable

- Run the command from the relevant package workspace when reviewing Bun or Yarn caches.
- Confirm the owner tool is installed and available in the same shell. Yarn beta cache review supports Classic 1.x; modern Yarn is rejected.
- Supply a real workdir containing recognized project markers. Discovery stops at depth 7 and skips symlinks and protected/generated directories.
- Beta Python environment rules run on Linux only; they skip on macOS.
- Use `kundol tools list` to distinguish unpublished catalogue entries from supported rules.

## Generated-file deletion fails

Check that `/usr/bin/python3` is available and supports descriptor-based filesystem operations. Kundol refuses this deletion path when the helper is unavailable. Read the exact target error for permissions or changed-path checks before retrying.

## Docker produces no cleanup targets

Use a supplied or saved context, or let Kundol discover installed contexts. Ensure the selected daemon is reachable:

```bash
docker context ls
kundol optimise docker my-context --allow-beta
```

Kundol pins that context and daemon identity. There is currently no published Docker resource cleanup rule; `--allow-beta` adds protected network and volume inventories only. Docker has no force option.

## A saved directory or Docker context no longer works

Saved scopes live in `~/.kundol/kundol.db` and are validated on every relevant run. Kundol reports stale defaults instead of silently switching. Supply a valid value for a temporary override, or replace the default deliberately:

```bash
kundol optimise projects ~/Work --save-defaults
kundol optimise docker my-context --save-defaults
```

With no explicit or saved Docker context, a sole installed context is selected automatically. Multiple contexts need a numbered interactive choice; without a terminal, supply the context explicitly. `-f` only affects cleanup selection and never resolves this ambiguity. Missing Docker or a failed daemon check stops before scanning and does not save a Docker default. `storage`, `projects`, and `repos` do not need Docker.

## A size is unknown

Directory measurement stops after its scan budget. An incomplete measurement appears as unknown, and owner-tool actions may also have unknown savings. Known reclaimed bytes are not a complete measurement of every action's disk effect.

## Interpret exit codes and audit warnings

| Result | Exit code |
| --- | --- |
| Successful run or cancelled selection | `0` |
| One or more apply failures | `70` |

Argument and parsing errors can also return a nonzero code. Read the terminal output alongside the code; cancellation is not evidence that cleanup occurred.

Audit records live under `~/.kundol/`. If an audit warning appears after an action, inspect its reported outcome before rerunning: the action may have succeeded even though its audit write failed.

## Report a problem or request a rule

```bash
kundol issue
kundol tools request
```

These open GitHub in a browser and print a URL you can open manually. Review and submit the issue yourself. Include your version, operating system, command, and relevant output; remove private paths or other sensitive details before sharing.
