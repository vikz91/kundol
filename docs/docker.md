# Docker Cleanup

The current public `kundol optimise storage` route probes published user-scope owner-tool cache rules. It does not call `docker system prune` or act on Docker containers, images, networks, volumes, or Desktop disk storage. The Docker rules in the [optimisation registry](../registry/optimisations.json) remain proposed or protected, so `kundol tools list --status proposed` can display them but no public command applies them.

The [first-time sandbox](demo/docker-sandbox.md) still seeds fake Docker-like files and a fixture-only `docker` executable for development history. These are ordinary container files, not host daemon resources, and the current public storage route does not use that mock to prune them.

## Future resource-level design

A future Docker flow should inventory exact resource IDs, sizes when known, active mounts, labels, Compose ownership, and retention risks before offering a plan. It must recheck live use immediately before any selected action and record failures.

| Registry tier | Proposed treatment |
|---|---|
| Review, explicit selection | Stopped containers, dangling/unused images, BuildKit cache, and stopped Compose resources after checking use, mounts, and ownership. |
| Protected, inventory only | Unmounted volumes and the Docker Desktop disk image; running or mounted resources remain protected. |

The proposed volume rule has no delete action. Volume removal would require a dedicated opt-in and explicit confirmation. A missing CLI or stopped daemon should produce a clear skip or warning when Docker handlers are eventually implemented. See [registry policy](optimisation-registry.md) and [current CLI usage](usage.md).
