# Usage

Created: 2026-09-15 13:07:32 IST
Last updated: 2026-09-15 15:40:44 IST

Run `kundol --help` to see the installed CLI. From a source checkout, install dependencies and prefix the same commands with `bun run dev --`:

```bash
bun install --frozen-lockfile
bun run dev -- --help
bun run dev -- tools available
```

## Browse optimisation tools

```bash
kundol tools available
kundol tools search "pnpm"
kundol tools list
kundol tools list --status proposed
kundol tools list --status wip
kundol tools list --status beta
kundol tools list --status published
```

`available` and `search` show only rules marked `published` in the bundled `registry/optimisations.json`. Search matches rule IDs, labels, descriptions, and category names without regard to case. `list` shows every rule by default; `--status` accepts `all`, `proposed`, `wip`, `beta`, or `published`. These commands read the catalogue and do not run cleanup or change a rule's status.

A published rule is eligible only through its supported optimisation flow and safety tier. `proposed` and `wip` entries are catalogue and implementation work. `beta` requires an experimental opt-in, which the current public CLI does not expose. A protected published rule is inventory only.

## Request a tool or file an issue

```bash
kundol tools request
kundol issue
```

`tools request` opens a GitHub issue editor with a Markdown outline for the owning tool, exact target and scope, owner documentation, benefit, and data risks. `issue` opens the general GitHub issue chooser for bugs and feature requests. Both print the URL so you can continue manually if a browser opener is unavailable. You submit the issue on GitHub after reviewing its contents.

## Run an optimisation

```bash
kundol optimise storage
kundol optimise projects ~/Projects
kundol optimise repos ~/Projects
```

`storage` probes published user-scope owner-tool cache rules. `projects` discovers matching projects within the supplied workdir to depth 7, then probes published project-generated rules. `repos` currently calls the same handler as `projects`; it does not require Git. All three cleanup routes use the JSON registry's probe-review-apply engine.

Each command prints a plan before action. For storage and projects, enter `y` to select safe suggestions, displayed numbers to select explicit review targets, or leave the answer blank to cancel. Protected inventory cannot be selected. `-f, --force` skips the prompt and selects only safe, force-eligible targets; it does not apply review or protected targets. Without an interactive terminal and without `-f`, the plan is printed and the run cancels. Apply outcomes are reported and audited in SQLite and session logs.

Use an explicit disposable workdir when trying project cleanup. The [Docker sandbox](demo/docker-sandbox.md) supplies one, and [public commands](commands.md) documents current limits and exit behavior.

Generated-path cleanup needs the isolated `/usr/bin/python3` system helper for no-follow deletion. If the interpreter or descriptor-based filesystem operations are unavailable, the selected action fails without deleting the target. Large target footprints may be shown as unknown when measurement exceeds the scan limit.
