# One-Click Optimize Storage Plan

Created: 2026-06-15 21:51:27 IST  
Related tasks: `KUN-073`, `KUN-F013`

## Goal

Add a future `Optimize storage` workflow that finds and removes obvious reproducible junk across developer tooling, Docker, project caches, and selected system temporary locations.

The product promise should be:

```text
One click to preview safe reclaimable storage.
One explicit confirmation to apply only the safe set.
```

Do not market it as a blind one-click system cleaner. kundol should stay trustworthy by showing exactly what it will remove, why it is safe, and what it refuses to touch.

## Proposed UX

CLI:

```bash
kundol optimize
kundol optimize --apply --no-dry-run
kundol optimize --json
kundol optimize --include docker,package-caches,projects
kundol optimize --exclude docker
```

Dashboard:

- Add an `Optimize` view/action.
- Show it in the main dashboard as `u optimize`.
- Show total reclaimable bytes grouped by category.
- Default button is `Preview`.
- Apply button is disabled until preview exists.
- Apply requires a second-step confirm: press `y` after the dry-run preview.
- Every run writes session audit entries:
  - `OPTIMIZE_PREVIEW`
  - `OPTIMIZE_APPLY`
  - scoped entries such as `OPTIMIZE_DOCKER_PRUNE`, `OPTIMIZE_NPM_CACHE`, `OPTIMIZE_PROJECT_GENERATED`

## Safety Levels

### Default Safe Apply

These may be included in the default apply set after a dry-run preview.

| Category | Candidate | Why it is safe enough | Apply method |
|---|---|---|---|
| Project generated files | Existing safe project cleanup candidates such as `node_modules`, `dist`, `build`, `.next`, `.turbo`, `coverage`, `target`, `bin/obj`, Python caches | Already classified by kundol safety policy and tied to indexed projects | Reuse `scan`/`clean` engine; never touch protected/caution items |
| pnpm store | `pnpm store prune` | Official pnpm cleanup for unreferenced store packages; may cause future re-downloads, not data loss | Run pnpm command if available |
| Yarn cache | `yarn cache clean` | Official Yarn cache removal; cache refills later | Run Yarn command if available |
| npm cache verify | `npm cache verify` | npm cache is self-healing; verify is non-destructive and can garbage-collect invalid entries | Run npm verify by default |
| Docker build cache | Docker-reported reclaimable build cache | Build cache is reproducible; Docker can report reclaimability | Prefer targeted `docker builder prune` with filters; dry-run first |
| Docker stopped containers | Stopped containers older than configured threshold, with no protected labels | Containers are not running; age threshold reduces accidental loss | Targeted removal by container ID |
| Docker dangling images | Untagged images unused by containers | Reproducible image layers, not active | Targeted removal by image ID |
| Docker unused networks | Networks unused by containers and not system/default networks | Not attached to any container | Targeted removal by network ID |
| Tool logs/caches inside known cache dirs | Old package-manager log files, old build logs under app-owned cache roots | Reproducible operational noise | Only known directories, age threshold, size preview |

### Review-Only

These may be detected and shown, but must not be included in default apply.

| Category | Candidate | Risk |
|---|---|---|
| Docker named volumes | Unused named volumes | May contain databases, uploads, or local app state |
| Docker Compose resources | Compose containers, networks, volumes, images | May belong to active dev environments even when stopped |
| `npm cache clean --force` | Full npm cache deletion | npm docs say clean is typically unnecessary; verify is safer default |
| Project virtual environments | `.venv`, `venv`, `.tox`, `.nox` | Reproducible but expensive to recreate; can contain local state |
| Package manager global stores | Entire npm/Yarn/pnpm directories by path deletion | Can include auth/config/log metadata mixed with cache |
| Downloads, Desktop, Documents | Anything user-facing | User-created content |
| OS application caches | Browser, IDE, editor, simulator, Docker Desktop internal caches | Can break sessions, sign-ins, indexes, or active work |
| Generated reports | reports, screenshots, videos, coverage HTML if outside known safe rules | May be deliverables |
| Old archives | `.zip`, `.tar.gz`, app archives | May be backups |

### Protected / Never Default

- `.git`
- `.env` and `.env.*`
- databases: `.db`, `.sqlite`, `.sqlite3`
- uploads
- media
- assets
- migrations
- source directories
- Docker volumes unless the user selects a volume-specific flow
- running containers
- images used by running containers
- mounted volumes
- networks used by containers
- `/tmp` wholesale deletion
- OS root/system directories
- app support folders not owned by kundol unless the specific tool command owns the cleanup

## Category Plan

## macOS Cleanup Function Catalog

This is the implementation candidate list for the new optimizer.
Each function must support `analyze()` first and must never execute in tests against the real machine.

### Package Manager Functions

| Function | Command candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeNpmCacheVerify` | `npm cache verify` | yes | safe | npm verifies cache integrity and garbage-collects unneeded data. Prefer this over force-clean. |
| `optimizeNpmCacheCleanForce` | `npm cache clean --force` | no | review | Removes npm cache data; npm generally expects cache to be self-healing, so this is opt-in only. |
| `optimizePnpmStorePrune` | `pnpm store prune` | yes | safe | Removes unreferenced store packages; may cause future re-downloads. |
| `optimizeYarnCacheClean` | `yarn cache clean` | yes | safe | Removes Yarn cache archives; future installs re-download. |
| `optimizeYarnMirrorCacheClean` | `yarn cache clean --mirror` | no | review | Can remove global mirror cache; keep opt-in. |
| `optimizePipCacheInfo` | `python -m pip cache info` / `pip cache info` | preview only | safe | Inspect pip cache before purging. |
| `optimizePipCachePurge` | `python -m pip cache purge` / `pip cache purge` | no | review | Clears pip wheel/HTTP cache; safe-ish but can slow future installs. |

### Runtime Cache Functions

| Function | Command candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeGoBuildCache` | `go clean -cache` | yes, if Go available | safe | Removes Go build cache. |
| `optimizeGoTestCache` | `go clean -testcache` | yes, if Go available | safe | Expires Go test results cache. |
| `optimizeGoModCache` | `go clean -modcache` | no | review | Removes downloaded module cache; can be large but causes re-downloads. |
| `optimizeCargoTargetDirs` | delete indexed-project `target` dirs | yes, project-safe only | safe | Use project scan policy, not global Cargo cache deletion. |
| `optimizeCargoRegistryCache` | delete global Cargo registry/cache | no | review | Shared global dependency cache; avoid default. |
| `optimizeGradleProjectCaches` | delete indexed-project `.gradle` and `build` dirs | yes, project-safe only | safe | Use project policy. |
| `optimizeGlobalGradleCache` | delete `~/.gradle/caches` subsets | no | review | Shared global cache; can be expensive to rebuild. |
| `optimizeMavenTargetDirs` | delete indexed-project `target` dirs | yes, project-safe only | safe | Use project policy. |
| `optimizeGlobalMavenRepository` | delete `~/.m2/repository` | no | protected/review | Too broad; shared dependency store. |

### Docker Functions

| Function | Command candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeDockerSystemDf` | `docker system df --format json` | preview only | safe | Estimate Docker reclaimable space. |
| `optimizeDockerDanglingImages` | targeted `docker image rm <id>` | yes | safe | Only dangling and unused by containers. |
| `optimizeDockerStoppedContainers` | targeted `docker container rm <id>` | yes, age threshold | safe | Only stopped containers older than threshold. |
| `optimizeDockerBuildCache` | `docker builder prune` with confirmation/filter | yes after preview | safe | Use Docker-reported reclaimable build cache. |
| `optimizeDockerUnusedNetworks` | targeted `docker network rm <id>` | yes | safe | Only unused non-default networks. |
| `optimizeDockerSystemPrune` | `docker system prune` without `--volumes` | no by default | review | Useful but broad; prefer targeted cleanup. |
| `optimizeDockerSystemPruneAll` | `docker system prune -a` | no | review/danger | Can remove unused images a user expects to keep. |
| `optimizeDockerVolumes` | `docker volume prune` or `docker system prune --volumes` | no | protected/review | Volumes may contain databases/uploads; dedicated explicit flow only. |

### Indexed Project Junk Functions

| Function | Command candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeProjectNodeModules` | delete safe indexed-project `node_modules` | yes, inactive projects | safe | Existing project scan policy. |
| `optimizeProjectBuildOutputs` | delete safe `dist`, `build`, `.next`, `.nuxt`, `.vite`, `.turbo`, `.parcel-cache` | yes | safe | Existing policy. |
| `optimizeProjectCoverage` | delete safe `coverage`, `htmlcov`, coverage output files | yes | safe | Existing policy; reports outside known dirs stay review-only. |
| `optimizeProjectPythonCaches` | delete `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache` | yes | safe | Existing policy. |
| `optimizeProjectDotnetOutputs` | delete `bin`, `obj`, `TestResults`, `.vs` | yes | safe | Existing policy. |
| `optimizeProjectJavaOutputs` | delete `target`, `build`, `.gradle` | yes | safe | Existing policy. |
| `optimizeProjectGoOutputs` | delete `coverage.out`, generated coverage dirs | yes | safe | Existing policy. |
| `optimizeProjectVirtualenvs` | delete `.venv`, `venv`, `.tox`, `.nox` | no | review | Reproducible but expensive and sometimes stateful. |

### macOS User Cache And Temporary Functions

| Function | Command/path candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeKundolTemp` | kundol-owned temp dirs only | yes | safe | Only directories created by kundol with known prefixes. |
| `optimizeSeedDemoTemp` | `/tmp/kundol-demo*`, `/tmp/kundol-*` from demo/test runs | yes, if owned and old | safe | Only if known generated prefixes and age threshold pass. |
| `optimizeUserTmpKnownPrefixes` | selected old files under `$TMPDIR` with known safe prefixes | no initially | review | Must avoid sockets, locks, symlinks, open files, and active app temp. |
| `optimizeTmpWholesale` | delete `/tmp` or `$TMPDIR` recursively | never | protected | Too dangerous; may contain active app state. |
| `optimizeUserLibraryCachesPreview` | inspect `~/Library/Caches` sizes | preview only | review | App caches can be active; use app-owned tools where possible. |
| `optimizeUserLibraryCachesDelete` | delete arbitrary `~/Library/Caches/*` | no | review/danger | Only with app closed and explicit selected app cache. |
| `optimizeSystemLibraryCaches` | `/Library/Caches`, `/System/Library/Caches` | never | protected | Use macOS Safe Mode for Apple-managed cache refresh instead. |
| `optimizeCrashLogsOld` | old user diagnostic logs | no initially | review | Useful, but must avoid current diagnostics and user-selected reports. |
| `optimizeAppLogsOld` | old logs under known app log dirs | no initially | review | Require age threshold and exact paths. |

### macOS Developer Tool Functions

| Function | Command/path candidate | Default execute? | Safety | Notes |
|---|---|---:|---|---|
| `optimizeXcodeDerivedData` | `~/Library/Developer/Xcode/DerivedData` | no | review | Safe-ish for developers but can be large and costly to rebuild. |
| `optimizeXcodeArchives` | `~/Library/Developer/Xcode/Archives` | never default | protected/review | Can contain release artifacts. |
| `optimizeXcodeDeviceSupport` | old `~/Library/Developer/Xcode/iOS DeviceSupport` | no | review | Versioned support files; requires explicit selection. |
| `optimizeAndroidBuildCache` | Gradle/project build caches | project-safe only | safe/review | Prefer project-scoped Gradle rules. |
| `optimizeAndroidSdkCaches` | Android SDK caches/system images | no | review | May delete SDKs/images the user needs. |
| `optimizeSimulatorCaches` | simulator caches/devices | no | review | Can remove app state/test data; never default. |

## Execution Policy For macOS System Junk

For the first implementation, do not execute broad macOS junk cleanup automatically.

Allowed to execute by default after preview:

- tool-owned commands with clear semantics: `npm cache verify`, `pnpm store prune`, `yarn cache clean`, selected Go cache commands
- targeted Docker cleanup without volumes
- indexed-project generated files already classified safe
- kundol-owned temp/demo folders

Preview-only or review-only:

- `~/Library/Caches`
- `$TMPDIR` and `/tmp`
- Xcode/Android/simulator caches
- pip purge
- npm force clean
- Docker volumes
- global runtime dependency caches

Never:

- `/System`
- `/Library` broad deletion
- `/var` broad deletion
- browser profile data
- cloud sync folders
- database files
- media/assets/uploads
- Docker volumes by default

### 1. Indexed Project Cleanup

Use the existing project scan/clean safety policy.

Default safe:

- `node_modules`
- `dist`
- `build`
- `.next`
- `.nuxt`
- `coverage`
- `.cache`
- `.turbo`
- `.parcel-cache`
- `.vite`
- `tsconfig.tsbuildinfo`
- Java `target`, Gradle `build`, `.gradle`
- .NET `bin`, `obj`, `TestResults`, `.vs`
- Python `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `htmlcov`, `dist`, `build`, `*.egg-info`
- Rust `target`
- Go `coverage.out`, generated coverage directories

Guardrails:

- Only clean indexed projects.
- Only clean items that classify as `safe`.
- Default to projects not modified/opened recently, or show active projects as review-only.
- Keep per-project dry-run item list.

### 2. Docker Cleanup

Use structured Docker discovery first.

Default safe:

- dangling images unused by any container
- stopped containers older than threshold
- unused networks
- reclaimable build cache

Review-only:

- unused named volumes
- Compose-managed resources
- images used by recently stopped containers
- local-only image names

Never:

- `docker system prune --volumes` as a default
- running containers
- mounted volumes
- networks in use

Preferred implementation:

- Analyze with `docker system df --format json` and structured `docker ... ls --format json` where possible.
- Apply targeted removals by resource ID.
- If using Docker prune commands, never include `--volumes` in default mode.

### 3. JavaScript Package Caches

Default safe:

- `pnpm store prune`
- `yarn cache clean`
- `npm cache verify`

Review-only:

- `npm cache clean --force`
- deleting cache directories manually
- Yarn mirror cache if configured

Notes:

- pnpm warns that pruning too often can require re-downloads when switching branches.
- npm cache is self-healing; verification is the safer default.
- Yarn cache clean removes shared cache files and will require re-downloads later.

### 4. Other Runtime Caches

Good candidates for future support:

- Go build cache: use `go clean -cache` only after previewing `go env GOCACHE`
- Go test cache: `go clean -testcache`
- Rust target dirs: use project-local `target` classification first; avoid deleting global Cargo registry/cache by default
- Python caches: project-local caches are safe; pip cache purge should be review-only unless the user opts in
- Java/Gradle: project-local `.gradle` and `build` safe; global Gradle cache review-only
- Maven: project-local `target` safe; global `~/.m2/repository` review-only
- Xcode/Android/Unity caches: future platform-specific review-only until strong safety rules exist

### 5. Temporary Folders

Do not delete `/tmp` wholesale.

Possible safe subset:

- kundol-owned temp folders
- stale folders matching known safe prefixes from this app or seeded demos
- files older than a conservative threshold in user temp directories only when:
  - not open by a process if detectable
  - not a socket, pipe, mount, lock file, or symlink target
  - not owned by another user
  - not inside system-managed paths

Default recommendation:

- keep temp cleanup disabled in default apply
- show as review-only with a strong warning

### 6. System Junk

Avoid broad "system junk" cleanup in MVP.

Possible future review-only detectors:

- old OS crash logs
- old app logs
- old package manager logs
- old simulator/device support caches
- old update leftovers where OS/tool provides an official cleanup command

Rules:

- Prefer official tool-owned cleanup commands.
- Do not recursively delete from `~/Library`, `/Library`, `/var`, `/System`, or app support folders by pattern alone.
- Avoid browser, editor, IDE, and cloud-sync caches by default.

## Analyze Result Shape

```ts
interface OptimizeCandidate {
  id: string;
  category: "project" | "docker" | "package-cache" | "runtime-cache" | "temp" | "system";
  label: string;
  pathOrResource: string;
  sizeBytes: number | null;
  safety: "safe" | "review" | "protected";
  defaultSelected: boolean;
  reason: string;
  applyPlan: {
    kind: "delete-path" | "run-command" | "docker-remove" | "skip";
    command?: string[];
    path?: string;
    resourceId?: string;
  };
}
```

## Implementation Phases

### Phase 1: Preview-Only Optimizer

- Add `kundol optimize` and dashboard Optimize view.
- Aggregate existing project safe cleanup candidates.
- Detect Docker availability and show Docker categories without applying.
- Detect package manager cache commands and estimate status where possible.
- Show total safe/review/protected bytes.
- Log `OPTIMIZE_PREVIEW`.

### Phase 2: Safe Apply

- Add `kundol optimize --apply --no-dry-run`.
- Apply only default safe candidates:
  - existing project safe cleanup
  - `pnpm store prune`
  - `yarn cache clean`
  - `npm cache verify`
  - targeted Docker dangling/stopped/build-cache/network cleanup
- Record each applied category and failure in the session audit log and SQLite actions table.

### Phase 3: Advanced Review

- Add category toggles.
- Add threshold config:
  - stopped container age
  - inactive project age
  - temp-file age
  - package cache inclusion
- Add review-only opt-ins:
  - npm force clean
  - pip cache purge
  - Docker volumes
  - global runtime caches

## Open Decisions

- Should `optimize` clean active projects by default, or only paused/stale projects?
- Should package cache cleanup be default-selected or a separate checkbox because it may slow future installs?
- Should Docker safe cleanup use targeted removals only, or allow `docker system prune` without `--volumes` after preview?
- Should `temp` stay entirely review-only for the first release?
- Should the optimizer keep a restore manifest for path deletions, or rely on existing archive-before-clean behavior for projects?

## Recommended Default

For the first implementation:

```text
Default safe apply =
  project safe generated files from paused/stale projects
  + pnpm store prune
  + yarn cache clean
  + npm cache verify
  + Docker dangling images
  + Docker stopped containers older than 30 days
  + Docker reclaimable build cache
  + Docker unused networks

Review only =
  npm cache clean --force
  + pip cache purge
  + global Gradle/Maven/Cargo caches
  + Docker named volumes
  + Compose-managed resources
  + temp folder cleanup
  + system junk
```
