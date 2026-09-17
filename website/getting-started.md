# Getting started

## Run from source

Install [Bun](https://bun.sh/docs/installation) 1.2 or newer, then clone the repository:

```bash
git clone https://github.com/vikz91/kundol.git
cd kundol
bun install --frozen-lockfile
bun run dev -- --help
bun run dev -- tools available
```

This manual uses `kundol` for brevity. From the checkout, replace it with `bun run dev --`; for example, `kundol tools available` becomes `bun run dev -- tools available`.

Generated-file deletion requires `/usr/bin/python3` with descriptor-based filesystem support. Owner-tool cache rules also require their corresponding tool, such as npm or pnpm.

## Try disposable projects

With Docker running, build the included sandbox from the repository root:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside the container:

```bash
kundol optimise projects /sandbox/projects
```

- Read the printed targets, actions, and safety tiers.
- Press Enter with a blank answer to cancel, enter `y` for safe suggestions, or enter displayed target numbers for explicit selection.
- Exit the container when finished. Starting a new container restores the disposable fixtures.

The example mounts no host projects or Docker socket. Building it leaves a Docker image on your machine.

## Choose a scope

| Goal | Command |
| --- | --- |
| Review owner-tool caches | `kundol optimise storage` |
| Review generated files under a workdir | `kundol optimise projects ~/Projects` |
| Use the equivalent repos route | `kundol optimise repos ~/Projects` |
| Inspect a named Docker context | `kundol optimise docker my-context` |
| Combine all scopes in one plan | `kundol optimise all --workdir ~/Projects --docker-context my-context` |

Replace example paths and context names with your own. `all` requires both scopes explicitly. `repos` does not require Git. Docker currently has no published resource cleanup rule; beta opt-in adds protected network and volume inventory only.

## Find supported tools

```bash
kundol tools available
kundol tools search "pnpm"
kundol tools list --status beta
```

Catalogue commands do not run cleanup. Continue with [safety and selection](./safety.md), the [command reference](./reference/cli.md), or the [rule catalogue](./reference/rules.md).
