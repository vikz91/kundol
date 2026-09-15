# User Flow

Created: 2026-06-13 17:15:01 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-004`, `KUN-008`, `KUN-009`, `KUN-016`, `KUN-017`, `KUN-024`, `KUN-032`, `KUN-036`, `KUN-042`, `KUN-089`, `KUN-092`

## First-time test

Start with the [disposable Docker sandbox](demo/docker-sandbox.md). From the repository root:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside its Bash shell, `kundol` is on `PATH`. The image seeds fake project files, Docker-like resources and protected volumes, an old temp entry, and simulated macOS startup items. No host project, home directory, or Docker socket is mounted.

```bash
kundol
kundol optimise projects /sandbox/projects
kundol optimise repos /sandbox/projects
kundol optimise storage
kundol optimise startup
```

Each run scans and prints a plan. For projects, repos, or storage, answer `y` to act on the container fixtures; any other answer cancels. Startup displays eligible fake user LaunchAgents: enter item numbers or `all` to simulate disabling them. `-f` skips the question after scanning. With no TTY and no `-f`, a run prints its plan, records cancellation, and exits 0. Exit Bash to discard changes; a new container starts from the seeded image. The sandbox's Docker and startup commands are mocks, so they do not verify real daemon or macOS launchd behavior.

## Current local CLI

For source development, install Bun dependencies and run the same public commands through `bun run dev --`:

```bash
bun install
bun run dev -- --help
bun run dev -- optimise projects <workdir>
```

Running bare `kundol` prints a welcome banner, not a dashboard. The public group uses British spelling `optimise` and has only `storage`, `startup`, `projects <workdir>`, and `repos <workdir>`. `repos` currently uses the project scanner without requiring Git. A real local `optimise storage -f` or `optimise startup -f` can change machine state, so preview those plans and use the sandbox for exploratory apply testing. Active runs write SQLite actions at `~/.kundol/kundol.db` and session logs under `~/.kundol/sessions`.

## Future design

Earlier first-run designs included `init`, workspace selection/indexing, a dashboard/TUI, registry views, runtime health, archives, and a background daemon. Their internal modules or data tables partly remain, but **none of those commands is registered**. If a workspace experience returns, it should ask for narrow explicit roots, show findings before action, keep destructive work behind an exact plan and confirmation, and never clean in the background. It should not scan the entire home directory by default.

Current command behavior: [commands](commands.md). Implementation and safety limits: [context](context.md).
