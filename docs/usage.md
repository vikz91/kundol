# Usage

Created: 2026-09-15 13:07:32 IST
Last updated: 2026-09-17 12:00:00 IST

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

A published rule is eligible only through its supported optimisation flow and safety tier. `--allow-beta` opts into five exact code-approved beta IDs: `store.yarn.cache` for Yarn Classic explicit review, Linux-only `project.python.virtual_envs` and `project.python.test_envs`, plus protected `docker.network.unused` and `docker.volume.unused` inventories. The other 64 beta entries remain catalogue-only and are reported individually when their route is invoked. A protected rule is inventory only at every status.

## Request a tool or file an issue

```bash
kundol tools request
kundol issue
```

`tools request` opens a GitHub issue editor with a Markdown outline for the owning tool, exact target and scope, owner documentation, benefit, and data risks. `issue` opens the general GitHub issue chooser for bugs and feature requests. Both print the URL so you can continue manually if a browser opener is unavailable. You submit the issue on GitHub after reviewing its contents.

## Run an optimisation

```bash
kundol optimise all --workdir ~/Projects --docker-context my-context
kundol optimise all --workdir ~/Projects --docker-context my-context --allow-beta
kundol optimise storage
kundol optimise projects ~/Projects
kundol optimise projects ~/Projects --allow-beta
kundol optimise repos ~/Projects
kundol optimise docker my-context
kundol optimise docker my-context --allow-beta
```

`all` is the explicit whole-catalogue workflow. It requires both `--workdir` and `--docker-context`, resolves those scopes before scanning, then combines user, workdir, pinned Docker-context, and system results into one plan and one selection. It refuses duplicate or nested targets across scopes. Without `--allow-beta`, it considers published rules; with the flag, it also runs every beta readiness gate, while rules without a code-approved handler remain unavailable and protected rules remain inventory-only.

`storage` probes published user-scope owner-tool cache rules, including Bun whole-cache review from the current package workspace; beta opt-in also probes Yarn Classic 1.x from that workspace and requires explicit review for its whole-cache owner action. Modern Yarn fails closed. `projects` discovers matching projects within the supplied workdir to depth 7, then probes published project rules; beta opt-in adds exact Python virtual and tox/Nox test environments on Linux only. `repos` calls the same handler as `projects`; it does not require Git. `docker` pins a named context and daemon identity; beta opt-in adds only protected network/volume inventories, not Docker cleanup. The scoped routes consider only their own scope; storage does not run project, system, or Docker-context rules. All routes use the JSON registry's probe-review-apply engine. Bare `optimise` remains help-only.

Each command prints a plan before action. For all, storage, and projects, enter `y` to select safe suggestions, displayed numbers to select explicit review targets, or leave the answer blank to cancel. A beta Python environment still needs its displayed number; `-f` never selects it. Protected Docker inventory cannot be selected. All/storage/projects/repos `-f, --force` skips the prompt and selects only safe, force-eligible targets; Docker has no force flag. Without an interactive terminal and without `-f`, the plan is printed and the run cancels. Apply outcomes are reported and audited in SQLite and session logs.

Use an explicit disposable workdir when trying project cleanup. The [real runtime seed](demo/runtime-seed.md) has a Python venv suitable for a `--allow-beta` preview without a host mount or socket. Native macOS Python process-use checks are not yet verified, so beta Python rules skip on macOS. The [Docker sandbox](demo/docker-sandbox.md) and [public commands](commands.md) document other limits and exit behavior.

Generated-path cleanup needs the isolated `/usr/bin/python3` system helper for no-follow deletion. If the interpreter or descriptor-based filesystem operations are unavailable, the selected action fails without deleting the target. Large target footprints may be shown as unknown when measurement exceeds the scan limit.
