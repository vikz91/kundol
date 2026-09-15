# First-Time Docker Sandbox

Created: 2026-09-15 11:29:12 IST
Related task: `KUN-089`

This development image lets someone try the current `kundol` CLI against disposable fixtures. It installs `kundol` on the container's `PATH`, starts a Bash session, and seeds `/sandbox` during image build. Nothing in the examples mounts a Mac home, project directory, or Docker daemon socket into the container. Docker still stores the demo image on the host; each `--rm` demo container's writable changes are discarded at exit.

## Build and enter

From the repository root, with a Docker daemon running:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

At the container's Bash prompt, the command is installed directly:

```bash
kundol
kundol --help
kundol optimise projects /sandbox/projects
kundol optimise repos /sandbox/projects
kundol optimise storage
kundol optimise startup
```

Each optimise command prints a plan first. `projects`, `repos`, and `storage` ask `[y/N]`; answer `y` to apply to disposable files. Startup shows numbered fake user LaunchAgents; enter a number or `all` to simulate disabling them. Use `-f` only when you deliberately want to skip the prompt after planning. A command invoked through `docker run` without a TTY and without `-f` scans, prints its plan, then cancels.

To inspect a command without entering a shell:

```bash
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local kundol --help
```

To restore all fixtures after a cleanup inside the same container:

```bash
bun /opt/kundol/scripts/seed-docker-sandbox.ts /sandbox
```

Exit Bash and run a new `docker run --rm -it ...` for a fresh copy of the seeded image.

## What is seeded

| Fixture | Where | What a command can demonstrate |
|---|---|---|
| Six fake Node, Python, and Go projects | `/sandbox/projects` | Project markers, `node_modules`, build/cache output, and protected `.git`, `.env*`, report, and SQLite files. |
| Old and fresh temp entries | `/sandbox/tmp` | `optimise storage` selects the top-level ten-day-old temp directory and leaves the fresh entry out of its plan. `TMPDIR` points here inside the image. |
| Fake Docker build cache, dangling image, stopped container, unused network | `/sandbox/fake-docker/pruneable` | The container's **mock** `docker info` enables a Docker row; its `docker system prune --force` removes only these sandbox fixtures. |
| Fake Docker volume database and upload, plus running container | `/sandbox/fake-docker/volumes` and `/sandbox/fake-docker/running-containers` | These are protected fixture files. The mock prune leaves them in place. They are not actual Docker-managed volumes or host daemon resources. |
| Fake user LaunchAgents and Login Item names | `/sandbox/home/Library/LaunchAgents` and an injected mock runner | `optimise startup` runs its existing plan/selection/report flow against a simulated macOS startup environment. Fake `launchctl` actions are logged at `/sandbox/fake-startup/actions.log`; plist files remain. |
| Kundol state and audit | `/sandbox/home/.kundol` | SQLite actions and session logs stay inside the disposable container home. |

The Docker sandbox runs Linux. Its startup demonstration injects `darwin` into the CLI and uses an in-process `osascript`/`launchctl` mock; it does not test real macOS launchd or System Settings. The normal `src/cli/index.ts` entrypoint still uses the actual platform. The Docker command in the image is likewise a fixture-only mock, with no Docker daemon or socket access.

The `kundol` launcher runs the packaged app from `/opt/kundol` so Bun's cache command has a project directory. Supply an absolute workdir such as `/sandbox/projects` for project and repo scans.

The image uses the official Bun image and a frozen production dependency install. The shell wrappers in `docker/` register `kundol` and the fake `docker` command only **inside the container**. The seed script is `scripts/seed-docker-sandbox.ts`; it reuses the project fixture generator and adds Docker-like, temp, cache, and startup data. [Bun's Docker guide](https://bun.com/guides/ecosystem/docker) documents the base image and frozen-install pattern. [Docker's run reference](https://docs.docker.com/reference/cli/docker/container/run/) explains why these examples avoid binding the host Docker socket.
