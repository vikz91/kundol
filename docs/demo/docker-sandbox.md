# First-Time Docker Sandbox

Created: 2026-09-15 11:29:12 IST
Last updated: 2026-09-15 15:40:44 IST
Related tasks: `KUN-089`, `KUN-092`, `KUN-098`, `KUN-101`, `KUN-102`

This disposable **development demo** packages the current CLI as `kundol` in a Bash container. The example run mounts no host project, home directory, or Docker socket, disables container networking, and discards container writes on exit. Building the image still stores an image on the host.

From the repository root, with Docker running:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside Bash, try generated-project cleanup against disposable fixtures:

```bash
kundol --help
kundol optimise projects /sandbox/projects
kundol optimise repos /sandbox/projects
kundol tools available
kundol tools list --status proposed
```

Each optimiser prints a registry plan first. For projects and repos, `y` selects safe suggestions when matching published targets are found; displayed numbers select explicit review targets. `-f` selects only safe targets after planning. Without a TTY or `-f`, a direct `docker run ... kundol optimise ...` invocation prints the plan and cancels. `tools` commands browse the bundled catalogue without applying cleanup. The image includes system Python for no-follow project deletion, but no pip, npm, uv, Go, or pnpm owner cache to optimise; storage reports those rules unavailable.

| Seeded under `/sandbox` | Demonstrates |
|---|---|
| `projects/` | Six fake Node.js, Python, and Go projects with `node_modules`, build/cache output, and protected `.git`, `.env*`, database, upload, and report examples. The published registry markers currently discover four of these roots. |
| `home/.kundol/` | Created by CLI runs for SQLite action records and session logs inside the disposable home. |

The image runs Linux. It tests the registry-driven project cleanup path with disposable generated files; it does not simulate macOS startup changes or mount a Docker socket. The retired broad Docker-prune and temporary-file demos were removed from the sandbox. Any published owner-tool cache actions run only inside the isolated container.

To reset fixtures in the same container, run:

```bash
bun /opt/kundol/scripts/seed-docker-sandbox.ts /sandbox
```

Exit and start a new `docker run --rm -it ...` for a fresh copy. See [the local project-only seeder](seed-demo-workspace.md) if you deliberately want host-side fake project files.
