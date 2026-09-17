# Safety and selection

Every optimisation probes its scope and prints a plan. Selected targets are checked again before action; results are reported and recorded locally.

## Read the safety tier

| Tier | Meaning | Selection |
| --- | --- | --- |
| Safe | Eligible for safe suggestions after live checks | `y`, displayed numbers, or `-f` when force-eligible |
| Review | Requires you to review the exact target and action | Displayed numbers only |
| Protected | Inventory only | Cannot be selected |

- A blank answer cancels the run.
- `-f, --force` skips the prompt and applies only safe, force-eligible targets. It is available on `all`, `storage`, `projects`, and `repos`.
- Without an interactive terminal and without `-f`, the plan is printed and the run cancels.
- Cleanup can require dependencies or caches to be downloaded or rebuilt later. Review the plan's action as well as its path.

There is no public `--dry-run` flag. To inspect a plan interactively, run without `-f` and leave the selection blank.

## Understand beta opt-in

Delivery status and safety tier are separate: a published rule can still require review or be protected. `--allow-beta` attempts only beta rules with code-approved handlers and readiness checks.

Current executable beta handlers cover:

- Yarn Classic 1.x cache review from a selected package workspace.
- Python virtual environments and tox/Nox test environments on Linux, requiring numbered selection.
- Protected Docker network and volume inventories, which cannot be removed.

Other beta entries remain catalogue-only and are reported as unavailable. Opting in never makes review or protected targets force-eligible. See the [rule catalogue](./reference/rules.md) for delivery status.

## Know the limits

- Project discovery is limited to depth 7 and does not traverse symlinks or generated/protected directories.
- Generated targets must pass marker, identity, ownership, and activity checks. Recent activity or incomplete checks can exclude a target.
- The seven-day no-change check cannot prove that no process still has an old file open. Stop relevant builds and tools before selecting cleanup.
- Generated-path deletion requires the system Python helper and supported descriptor operations; missing support prevents deletion.
- No undo archive is created. Keep anything you need before selecting its removal.

## Find the audit

- SQLite action records: `~/.kundol/kundol.db`.
- Per-process text logs: `~/.kundol/sessions/session-<timestamp>-<pid>.log`.

Session text logs are best effort. An audit warning after an action does not mean the action was rolled back; check the printed outcome before retrying. Read [troubleshooting](./troubleshooting.md) for common results.
