# Public Commands

Created: 2026-06-14 00:33:03 IST
Last updated: 2026-09-15 13:07:32 IST
Related tasks: `KUN-077`, `KUN-080`, `KUN-092`

kundol is CLI-only. The cleanup group is British-spelled `optimise`; there is no `optimize` alias, dashboard, or public indexing/scan/clean command. Bare `kundol` prints a welcome banner. `tools` browses the JSON optimisation catalogue without running its rules.

| Command | Current effect |
|---|---|
| `kundol optimise storage` | Probes published user-scope owner-tool cache rules, then offers safe suggestions and explicit review targets. |
| `kundol optimise startup` | On macOS, offers non-Apple user LaunchAgents for disablement; system agents and Login Items are not actionable. |
| `kundol optimise projects <workdir>` | Finds matching projects to depth 7 and probes published generated-path rules with live safety checks. |
| `kundol optimise repos <workdir>` | Uses the same registry-backed scanner/cleanup handler as `projects`; Git is not required. |
| `kundol tools available` | Lists rules marked `published` in `registry/optimisations.json`. |
| `kundol tools search <query>` | Searches published rule IDs, labels, descriptions, and categories. |
| `kundol tools list --status <status>` | Lists `all`, `proposed`, `wip`, `beta`, or `published` rules; `all` is the default. |
| `kundol tools request` | Opens a prefilled GitHub issue with a Markdown request outline. |
| `kundol issue` | Opens GitHub's issue chooser for a bug or feature report. |

Catalogue commands read the bundled JSON and use each rule's current delivery status. They do not execute a rule or change its status. The request and issue commands print their URLs and open the browser when a platform opener is available.

Each `optimise` command scans and prints a plan before selection, then reports and audits applied results. Storage and projects accept `y` for safe suggestions or displayed numbers for explicit review; startup accepts eligible item numbers. `-f, --force` selects only safe, force-eligible targets after planning. There are no public `--dry-run`, `--apply`, `--json`, or `--max-depth` workflow flags. Standard `--help` and `--version` still work.

Without a TTY and without `-f`, an optimise command prints its plan, records cancellation, and exits 0. Apply failures return 70. Registry plans show known target footprint; reports show known reclaimed bytes for applied path targets. Owner-tool commands may have unknown sizes. See [usage.md](usage.md) and [context.md](context.md) for target selection and live checks.

```bash
kundol optimise storage
kundol optimise startup
kundol optimise projects ~/Projects
kundol optimise repos ~/Projects -f
kundol tools available
kundol tools search "pnpm"
kundol tools list --status proposed
kundol tools request
kundol issue
```

For a first run against disposable files, follow the [Docker sandbox](demo/docker-sandbox.md) guide.

## Request a tool

Check `kundol tools list` for an existing target first. If the owning tool or generated target is missing, [open a registry request](https://github.com/vikz91/kundol/issues/new?title=%5BRegistry%20request%5D%3A%20&body=Owning%20tool%3A%0A%0AExact%20target%20and%20scope%3A%0A%0AOwner%20documentation%3A%0A%0AWhy%20add%20it%3A%0A%0AData%20and%20safety%20risks%3A%0A). Name the exact target and scope, link the owning tool's documentation, explain the benefit, and flag data or retention risks. A request starts a catalogue proposal; it does not activate cleanup. See the [contribution guide](CONTRIBUTING.md) for claiming an issue and proposing a protected registry entry.
