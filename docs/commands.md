# Public Commands

Created: 2026-06-14 00:33:03 IST
Last updated: 2026-09-15 12:02:05 IST
Related tasks: `KUN-077`, `KUN-080`, `KUN-092`

kundol is CLI-only. The public group is British-spelled `optimise`; there is no `optimize` alias, dashboard, or public indexing/scan/clean command. Bare `kundol` prints a welcome banner.

| Command | Current effect |
|---|---|
| `kundol optimise storage` | Plans package/runtime cache maintenance, broad Docker system prune without volumes, old top-level temp entries, and eligible previously scanned project rows. |
| `kundol optimise startup` | On macOS, offers non-Apple user LaunchAgents for disablement; system agents and Login Items are not actionable. |
| `kundol optimise projects <workdir>` | Finds projects to fixed depth 7 and removes safe generated artifacts inside them. |
| `kundol optimise repos <workdir>` | Uses the same scanner/cleanup handler as `projects`; Git is not required. |

Each command scans, prints a plan, asks `[y/N]` or startup item numbers, applies selected actions, reports results, and writes session/SQLite audit records. `-f, --force` skips only the prompt after planning. There are no public `--dry-run`, `--apply`, `--json`, or `--max-depth` workflow flags. Standard `--help` and `--version` still work.

Without a TTY and without `-f`, an optimise command prints its plan, records cancellation, and exits 0. Apply failures return 70. Project reclaimed bytes are scan-time estimates; storage and startup do not report actual reclaimed bytes. See [context.md](context.md) for target selection, live checks, and current safety gaps.

```bash
kundol optimise storage
kundol optimise startup
kundol optimise projects ~/Projects
kundol optimise repos ~/Projects -f
```

For a first run against disposable files, follow the [Docker sandbox](demo/docker-sandbox.md) guide.
