# Docker Cleanup Context

Created: 2026-06-13 07:29:15 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-025`, `KUN-029`, `KUN-030`, `KUN-031`, `KUN-083`, `KUN-092`

## Current CLI

`kundol optimise storage` probes `docker info`. If it succeeds, the printed plan selects `docker system prune --force` by default. The CLI executes that broad command after confirmation or `-f`. It does not list individual Docker resources, estimate their reclaimable bytes, recheck resource IDs, or offer a Docker-specific command. The command omits `--volumes`; the protected Docker-volumes row is informational. See [current implementation context](context.md) and [`storage-optimizer.ts`](../src/services/optimize/storage-optimizer.ts).

This broad prune can remove stopped containers, unused networks, dangling images, and build cache from the connected daemon. Review the plan before applying on a real machine. `-f` skips the confirmation, not the scan.

## Disposable demo

The [first-time Docker sandbox](demo/docker-sandbox.md) installs a fixture-only `docker` executable **inside the container**. Its `info` enables the storage-plan row; its `system prune --force` deletes seeded files under `/sandbox/fake-docker/pruneable` and keeps `/sandbox/fake-docker/volumes` and running-container fixtures. Those are ordinary files, not real Docker resources or host volumes. The documented `docker run` command mounts neither host files nor the Docker socket.

## Proposed resource-level design

The [optimisation registry](../registry/optimisations.json) proposes separate rules for stopped containers, images, BuildKit cache, networks, Compose resources, volumes, and the Docker Desktop disk image. The registry is not wired into the public CLI. A future adapter should replace the broad prune with an inventory and selected resource IDs, using structured Docker output and `inspect` when labels, mounts, or timestamps matter.

| Registry tier | Proposed treatment |
|---|---|
| Review, explicit selection | Stopped containers, dangling/unused images, BuildKit cache, and stopped Compose resources after checking use, mounts, and ownership. |
| Protected, inventory only | Unused networks, unmounted volumes, and the Docker Desktop disk image. Running or mounted resources remain protected. |

Any future apply path must show exact IDs and known sizes, recheck live use and mounts, apply only explicitly selected review resources, and record failures. The proposed volume rule has no delete action. If volume deletion is ever added, it needs a dedicated opt-in and confirmation; broad `docker system prune --volumes` must not become the default. A missing CLI or stopped daemon should produce a clear skip or warning.
