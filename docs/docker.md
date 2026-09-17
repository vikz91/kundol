# Docker Cleanup

`kundol optimise storage` probes user-scope owner-tool caches and never calls `docker system prune`. The separate `kundol optimise docker [context]` route resolves a supplied, saved, or discovered named Docker endpoint and daemon identity and clears ambient Docker overrides. `kundol optimise all --workdir <path> --docker-context <name>` uses the same pinned identity inside its combined plan; a stale saved context fails without silently switching. Without a supplied or saved context, it discovers installed contexts: one is selected automatically; several require a numbered choice (or an explicit context in non-interactive runs). The chosen context is saved only after daemon validation. Later explicit contexts are temporary unless `--save-defaults` is supplied. `-f` never resolves discovery ambiguity. No Docker rule is published yet; `--allow-beta` can inventory only protected unused networks and volumes in that pinned context, never remove them. Docker Desktop disk storage is protected and never a direct deletion target.

The [first-time sandbox](demo/docker-sandbox.md) exercises generated-project cleanup. Earlier fake Docker-prune fixtures have been retired; the image does not mount the host Docker socket, and the public storage route does not prune Docker resources.

## Future resource-level design

Staged, unpublished Docker adapters parse bounded exact IDs/names, mounts, labels, Compose ownership, and retention risks. They recheck daemon identity and live resource state at targeted lookup. `optimise docker [context] --allow-beta` exposes only protected network and volume inventories, with no action; a stopped-container adapter is staged but not code-approved for beta execution. Image/Compose/BuildKit actions likewise remain inactive pending private-daemon acceptance of real Docker CLI behavior and owner races. Ordinary Docker-in-Docker requires a privileged service, which is not authorized for this programme without separate risk approval; fixture tests alone do not publish these rules.

| Registry tier | Proposed treatment |
|---|---|
| Review, explicit selection | Stopped containers, dangling/unused images, BuildKit cache, and stopped Compose resources after checking use, mounts, and ownership. |
| Protected, inventory only | Unmounted volumes and the Docker Desktop disk image; running or mounted resources remain protected. |

The beta-catalogue volume rule is protected and has no delete action. Volume removal would require a separate policy, dedicated opt-in, and explicit confirmation. A missing CLI, stopped daemon, changed context, or incomplete inventory fails closed. See [registry policy](optimisation-registry.md), [the 75-rule plan](registry-75-implementation-plan.md), and [current CLI usage](usage.md).
