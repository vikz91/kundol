# Docker Monitoring And Cleanup Knowledge Base

Created: 2026-06-13 07:29:15 IST  
Last updated: 2026-09-15 11:20:56 IST
Related tasks: `KUN-025`, `KUN-029`, `KUN-030`, `KUN-031`, `KUN-F007`, `KUN-F008`, `KUN-F009`, `KUN-F010`, `KUN-083`

## Purpose

kundol should monitor and track Docker resources in addition to project directories.
Docker support covers stored images, containers, volumes, networks, and build cache so users can understand disk usage, identify deleteable resources, and run safe purge workflows.

Docker cleanup has higher risk than project-local generated files.
Every destructive Docker workflow must be dry-run first and require explicit confirmation.

The proposed [`optimisations.json`](../registry/optimisations.json) catalogue separates stopped containers, images, BuildKit cache, networks, Compose resources, and volumes by resource ID and review tier. Volumes and the Docker Desktop disk image are inventory-only entries. The registry is not wired into the CLI; current storage apply still uses broad `docker system prune --force` without volumes, as documented in [`context.md`](context.md). Future integration must replace that broad action with resource-level revalidation and selected removal.

For first-time testing, [`demo/docker-sandbox.md`](demo/docker-sandbox.md) packages the CLI with a fixture-only `docker` command. Its prune action touches only seeded files inside the disposable container and keeps fake volume data; it does not connect to a Docker daemon or test real volume management.

## Resource Types

Track these Docker resource types:

- Images
- Containers
- Volumes
- Networks
- Build cache
- Compose projects when labels are available

## Discovery Commands

Prefer Docker CLI JSON output where possible.
Do not parse human table output unless there is no supported structured alternative.

Suggested commands:

- `docker system df --format json`
- `docker image ls --format json`
- `docker container ls --all --format json`
- `docker volume ls --format json`
- `docker network ls --format json`
- `docker builder du --verbose` when available
- `docker inspect` for selected resources that need labels, mount info, or timestamps

Docker may not be installed or the daemon may not be running.
Those states should produce informative status output, not crashes.

## Classification

### Safe Candidates

Safe candidates still require confirmation before removal.

- Dangling images with no tags.
- Stopped containers older than the configured threshold.
- Build cache entries that Docker reports as reclaimable.
- Unused networks not used by any container.

### Caution Candidates

These require stronger warnings and should never be selected by default:

- Unused named volumes.
- Images used by recently stopped containers.
- Images with local-only names or no remote registry reference.
- Compose-managed resources.
- Resources with labels that indicate ownership by another tool.
- Resources related to active development projects.

### Protected Resources

Never purge automatically:

- Running containers.
- Volumes mounted by any container.
- Networks used by any container.
- Images used by running containers.
- Resources with explicit keep/protect labels.
- Kubernetes, Docker Desktop, or system-managed resources when identifiable.

## Recommended Metadata

For each Docker resource, track:

- Resource ID.
- Resource type.
- Name or repository/tag.
- Size bytes when available.
- Created at.
- Last used at when available.
- In-use status.
- Dangling status.
- Labels.
- Compose project label.
- Related project path when inferable.
- Reclaimable bytes.
- Recommendation category: `safe`, `caution`, `protected`.
- Reason text shown to the user.

## Recommendations

Recommended messages should explain why something is considered deleteable.

Examples:

- Delete dangling image: no repository tag and not used by any container.
- Delete stopped container: stopped for more than 30 days.
- Prune build cache: Docker reports cache as reclaimable.
- Review named volume: unused but may contain databases or user data.
- Keep running container: currently active.

## Purge Workflows

All purge workflows must support:

- `--dry-run`
- explicit confirmation
- resource preview
- reclaimable size estimate
- audit logging
- clear success/failure summary

Recommended command shapes:

```text
kundol docker scan
kundol docker analyze
kundol docker list
kundol docker purge --dry-run
kundol docker purge --dangling-images
kundol docker purge --stopped-containers --older-than 30d
kundol docker purge --build-cache
kundol docker purge --volumes
```

Volume purge must never be bundled into a generic purge by default.
It should require a specific flag such as `--volumes` plus confirmation.

## Docker Compose Awareness

Docker Compose resources often include labels:

- `com.docker.compose.project`
- `com.docker.compose.service`
- `com.docker.compose.version`
- `com.docker.compose.project.working_dir`
- `com.docker.compose.project.config_files`

When labels are present:

- Group resources by Compose project.
- Link Docker resources back to a project path when `working_dir` exists.
- Treat named volumes as caution.
- Do not remove Compose-managed resources while any related container is running.

## Data Model Notes

Future schema can add a `docker_resources` table or a generic `resources` table.

Recommended fields:

```text
id
resource_type
docker_id
name
status
size_bytes
reclaimable_bytes
labels_json
compose_project
related_project_id
recommendation
recommendation_reason
last_seen_at
created_at
updated_at
```

Actions table should log Docker actions:

- `DOCKER_SCAN`
- `DOCKER_ANALYZE`
- `DOCKER_PURGE_DRY_RUN`
- `DOCKER_PURGE`

## Safety Requirements

- Never remove running containers.
- Never remove mounted volumes.
- Never remove named volumes without a dedicated volume confirmation.
- Never remove networks in use.
- Never run broad `docker system prune --volumes` as a default path.
- Prefer targeted resource deletion over broad prune commands.
- Always show the exact resource IDs/names before removal.
- Always show estimated reclaimable bytes before removal.

## Testing Requirements

Docker behavior should be tested behind an adapter.
Unit tests should not require a real Docker daemon.

Test cases:

- Docker unavailable.
- Docker daemon unavailable.
- Dangling image classification.
- Running container protection.
- Mounted volume protection.
- Unused named volume caution.
- Compose project grouping.
- Dry-run purge does not execute deletion.
- Purge only deletes explicitly selected safe resources.

## Knowledge Maintenance Workflow

When agents add Docker support:

1. Update this file with any new Docker resource rules.
2. Add or update tasks in `docs/plan.md`.
3. Add chronological notes in `docs/learnings.md`.
4. Add tests for every safety rule.
5. Keep Docker cleanup separate from project-local cleanup unless a project relation is explicitly known.
