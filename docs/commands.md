# Public Commands

Created: 2026-06-14 00:33:03 IST
Last updated: 2026-09-17 12:00:00 IST
Related tasks: `KUN-077`, `KUN-080`, `KUN-092`

kundol is CLI-only. The cleanup group is British-spelled `optimise`; there is no `optimize` alias, dashboard, or public indexing/scan/clean command. Bare `kundol` prints a welcome banner. `tools` browses the JSON optimisation catalogue without running its rules.

| Command | Current effect |
|---|---|
| `kundol optimise all [--workdir <path>] [--docker-context <name>]` | Builds one plan across user, workdir, pinned Docker-context, and system rules. Scopes resolve from supplied or saved defaults, with Docker discovery when needed; `--allow-beta` attempts the beta readiness gates in every scope. |
| `kundol optimise storage` | Probes published user-scope owner-tool cache rules; `--allow-beta` also attempts the code-approved Yarn Classic cache review and reports every unavailable beta ID. |
| `kundol optimise projects [workdir]` | Finds matching projects to depth 7 and probes published rules; `--allow-beta` adds two Linux-only Python environment review rules. |
| `kundol optimise repos [workdir]` | Uses the same registry-backed scanner/cleanup handler and beta opt-in as `projects`; Git is not required. |
| `kundol optimise docker [context]` | Pins one named Docker context and daemon identity; `--allow-beta` inventories unused networks and volumes as protected, non-removable resources. No force flag or broad prune. |
| `kundol tools available` | Lists rules marked `published` in `registry/optimisations.json`. |
| `kundol tools search <query>` | Searches published rule IDs, labels, descriptions, and categories. |
| `kundol tools list --status <status>` | Lists `all`, `proposed`, `wip`, `beta`, or `published` rules; `all` is the default. |
| `kundol tools request` | Opens a prefilled GitHub issue with a Markdown request outline. |
| `kundol issue` | Opens GitHub's issue chooser for a bug or feature report. |

Catalogue commands read the bundled JSON and use each rule's current delivery status. They do not execute a rule or change its status. The request and issue commands print their URLs and open the browser when a platform opener is available.

Project paths and Docker contexts are remembered across runs in `~/.kundol/kundol.db`. The first valid project path is saved as an absolute canonical path. Docker-only and all-scope commands use an explicit or saved context, or discover one: a sole installed context is selected automatically; several require a numbered choice. Docker defaults are saved only after daemon identity validation. Explicit values are temporary overrides once defaults exist; add `--save-defaults` to deliberately replace supplied defaults. Stale defaults fail clearly without silently switching scopes. `--save-defaults` is supported on all/projects/repos/docker. Storage and project routes do not require Docker; help and catalogue commands remain read-only. `-f` never selects an ambiguous Docker context, and a non-interactive run must supply one when discovery returns several.

Each `optimise` command prints a plan before selection, then reports and audits applied results. All five accept `--allow-beta` for exact code-approved beta rules; 64 other beta IDs are listed as unavailable instead of being hidden behind a summary. The `all` route is the explicit cross-scope form: it resolves a supplied or saved workdir and a supplied, saved, or discovered Docker context, probes all four registry scopes, rejects overlapping targets, prints one combined plan, and collects one selection. It does not turn catalogue-only beta entries into executable handlers. Storage never invokes workdir, system, or Docker-context rules. All, storage, projects, and repos accept `y` for safe suggestions or displayed numbers for explicit review. Their `-f, --force` selects only safe, force-eligible targets after planning, even with beta opt-in. Docker pins the resolved named context, has no force flag, and never selects protected inventory. Bare `optimise` only shows help. There are no public `--dry-run`, `--apply`, `--json`, or `--max-depth` workflow flags. Standard `--help` and `--version` still work.

After scopes resolve, without a TTY and without `-f`, an optimise command prints its plan, records cancellation, and exits 0. Apply failures return 70. Registry plans show known target footprint; reports show known reclaimed bytes for applied path targets. Owner-tool commands may have unknown sizes. See [usage.md](usage.md) and [context.md](context.md) for target selection and live checks.

```bash
kundol optimise all --workdir ~/Projects --docker-context my-context
kundol optimise all --workdir ~/Projects --docker-context my-context --allow-beta
kundol optimise storage
kundol optimise projects ~/Projects
kundol optimise projects ~/Projects --allow-beta
kundol optimise repos ~/Projects -f
kundol optimise docker my-context
kundol optimise docker my-context --allow-beta
kundol tools available
kundol tools search "pnpm"
kundol tools list --status beta
kundol tools request
kundol issue
```

For a first run against disposable files, follow the [Docker sandbox](demo/docker-sandbox.md) guide.

## Request a tool

Check `kundol tools list` for an existing target first. If the owning tool or generated target is missing, [open a registry request](https://github.com/vikz91/kundol/issues/new?title=%5BRegistry%20request%5D%3A%20&body=Owning%20tool%3A%0A%0AExact%20target%20and%20scope%3A%0A%0AOwner%20documentation%3A%0A%0AWhy%20add%20it%3A%0A%0AData%20and%20safety%20risks%3A%0A). Name the exact target and scope, link the owning tool's documentation, explain the benefit, and flag data or retention risks. A request starts a catalogue proposal; it does not activate cleanup. See the [contribution guide](CONTRIBUTING.md) for claiming an issue and proposing a protected registry entry.
