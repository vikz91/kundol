# First-Time Docker Sandbox

Created: 2026-09-15 11:29:12 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-089`, `KUN-092`

This disposable **development demo** packages the current CLI as `kundol` in a Bash container. The example run mounts no host project, home directory, or Docker socket, disables container networking, and discards container writes on exit. Building the image still stores an image on the host.

From the repository root, with Docker running:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside Bash:

```bash
kundol --help
kundol optimise projects /sandbox/projects
kundol optimise repos /sandbox/projects
kundol optimise storage
kundol optimise startup
```

Each optimiser prints a plan first. For projects, repos, and storage, answer `y` to apply to sandbox data. Startup displays fake user LaunchAgents; enter a number or `all` to simulate disabling them. `-f` skips the prompt after planning. Without a TTY or `-f`, a direct `docker run ... kundol optimise ...` invocation prints the plan and cancels.

| Seeded under `/sandbox` | Demonstrates |
|---|---|
| `projects/` | Six fake Node.js, Python, and Go projects with `node_modules`, build/cache output, and protected `.git`, `.env*`, database, upload, and report examples. |
| `tmp/` | A ten-day-old top-level temp directory selected by storage, plus a fresh unselected file. `TMPDIR` points here. |
| `fake-docker/` | Pruneable fake build cache, dangling image, stopped container, and unused network files. Fake volume database/upload files and a running-container file remain after prune. |
| `home/Library/LaunchAgents/`, `fake-startup/` | Fake safe user startup items, protected Apple item, and an action log. The mock disable action leaves plist files intact. |
| `home/.kundol/` | SQLite action records and session logs inside the disposable home. |

The image runs Linux. Its `kundol` launcher injects a simulated macOS startup platform and in-process `osascript`/`launchctl` runner; it does not test real launchd or System Settings. The container's `docker` command is a fixture-only mock supporting `info` and `system prune --force`. `fake-docker/volumes` contains ordinary files, **not** actual Docker volumes or host daemon resources. Other available cache commands, such as Bun's, run only inside the isolated container.

To reset fixtures in the same container, run:

```bash
bun /opt/kundol/scripts/seed-docker-sandbox.ts /sandbox
```

Exit and start a new `docker run --rm -it ...` for a fresh copy. See [the local project-only seeder](seed-demo-workspace.md) if you deliberately want host-side fake project files.
