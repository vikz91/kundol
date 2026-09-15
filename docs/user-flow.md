# User Flow

Created: 2026-06-13 17:15:01 IST
Last updated: 2026-09-15 14:07:32 IST
Related tasks: `KUN-004`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-017`, `KUN-024`, `KUN-032`, `KUN-036`, `KUN-042`, `KUN-089`, `KUN-092`

## First-time test

Start with the [disposable Docker sandbox](demo/docker-sandbox.md). From the repository root:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside Bash, `kundol` is on `PATH`. The image seeds disposable generated-project files. No host project, home directory, or Docker socket is mounted.

```bash
kundol
kundol tools available
kundol tools list --status proposed
kundol optimise projects /sandbox/projects
kundol optimise repos /sandbox/projects
```

`tools` reads the bundled catalogue without cleanup. Each optimiser prints a registry plan. For projects or repos, `y` selects safe suggestions, displayed numbers select explicit review targets, and blank cancels. `-f` selects only safe targets after planning. Without a TTY and without `-f`, a run prints its plan, records cancellation, and exits 0. Exit Bash to discard changes; a new container starts from seeded fixtures. `optimise storage` is a public command, but the base image lacks its optional owner tools and is intended as a project cleanup trial.

## Current local CLI

For source development, install Bun dependencies and run the same public commands through `bun run dev --`:

```bash
bun install --frozen-lockfile
bun run dev -- --help
bun run dev -- tools search "pnpm"
bun run dev -- optimise projects <workdir>
```

Bare `kundol` prints a welcome banner, not a dashboard. The cleanup group uses British spelling `optimise`; `tools` browses registry rules or opens a request, and `issue` opens GitHub's chooser. `repos` currently uses the same project handler without requiring Git. A real `optimise ... -f` can change machine state, so inspect its plan and use disposable fixtures for exploratory testing. Active runs write SQLite actions at `~/.kundol/kundol.db` and session logs under `~/.kundol/sessions`. See [usage](usage.md).

## Future design

Earlier first-run designs included `init`, workspace selection/indexing, a dashboard/TUI, project-registry views, runtime health, archives, and a background daemon. Those older commands and implementations have been retired. If a workspace experience returns, it should ask for narrow explicit roots, show findings before action, keep destructive work behind an exact plan and confirmation, and never clean in the background.

Current command behavior: [commands](commands.md). Implementation and safety limits: [context](context.md).
