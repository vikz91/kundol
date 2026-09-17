# Registry implementation programme: 75 proposed rules

Baseline: 2026-09-15, branch `codex/implement-registry-proposals`. The registry has 20 published and 75 proposed rules. This plan covers every baseline proposal by ID, including protected inventory. Splitting an unsafe multi-owner proposal may add new IDs, but its original ID must be mapped to the replacement and never silently dropped.

## Completion contract

A rule is published only after its own owner-grounded handler, live validators, audit path, documentation, and disposable regression/security/performance tests exist. A protected rule remains inventory-only. A review rule never becomes force-eligible merely to meet a count. Missing tools, ambiguous ownership, unverified release output, unavailable native test environments, and incomplete inventories fail closed. A status-only promotion is not implementation.

The earlier host restriction remains in force: no beta or proposed owner-tool probe or cleanup action is run directly on this machine. Static checks may run locally; executable tests use injected runners and an isolated Docker image without a host mount or Docker socket. A separate [real multi-runtime seed image](demo/runtime-seed.md) restores npm, pnpm, Maven/JDK, Python, Go, and .NET dependencies and builds one sandbox project per owner to give Linux rules genuine artifact evidence. macOS-only integrations require a disposable macOS environment before publication; Linux mocks alone cannot establish owner behavior.

The final PR/merge gate applies only after all 75 baseline IDs have an evidenced implementation or an explicitly approved, semantically equivalent replacement. If a rule cannot pass the gate safely, keep it unpublished and inert and report the blocker rather than merging a misleading “all tools published” PR.

## Parallel agent lanes

- Root: shared engine contracts, scope routing, safety/performance framework, cross-lane integration, documentation consistency, CI, commit/push/PR/merge.
- Workdir agent: 17 workdir proposals, owner markers, path-backed and Git-resource adapters, release-aware handling, disposable project fixtures.
- User agent: 41 user proposals, owner/version/cache managers, stable identities, owner command/API actions, per-tool availability and resource-use checks.
- Context agent: 8 Docker-context and 9 system proposals, context isolation, exact resource inventories, protected system data, native-environment gates.

Agents first audit their entire lane, then implement bounded waves in separate handler/test files. The root owns common schema, engine, CLI, registry status, and shared docs to avoid concurrent conflicts. Each lane supplies rule-level evidence and tests; no agent flips another lane's statuses.

## Audit findings and first implementation checkpoint

The three lane audits found that none of the 75 baseline proposals could safely be published by changing JSON status alone. Most adapter selectors had no CLI binding; filesystem adapter paths were not represented by physical path identity; and selected owner resources were re-enumerated in full. The baseline also combines unlike ownership in several entries: `.NET bin` and `obj`, Yarn Classic and modern caches, Terraform providers/modules and backend metadata, and Docker Compose group operations versus single resources. Protected rows must remain inventory only. Platform-specific system removals require native disposable evidence.

The first bounded waves have established the path/resource adapter union, a code-owned exact-ID local handler manifest, targeted `{ list, lookup }` selectors, per-rule validators, evidence/identity budgets, truncation reporting, four-at-a-time read-only probes, and an explicit `optimise docker <context>` route. Docker process execution pins a named context, clears ambient Docker overrides, and records the daemon identity. This route currently has no published Docker rule; a private-daemon acceptance run is still required. Executable checks run only inside a no-mount/no-socket Docker image.

| Baseline proposal | Current disposition | Evidence and remaining gate |
|---|---|---|
| `project.dotnet.bin_obj` | Split: `project.dotnet.obj` published safe; `project.dotnet.bin` beta review | `obj` has project-local marker, quiet/race/security and CLI fixtures; final/release `bin` needs explicit release exclusion and review evidence. |
| `store.bun.cache` | Published review | Workspace-bound owner path and whole-cache `bun pm cache rm`; includes bunx packages, requires approved user root, no force selection. Docker owner/CLI fixtures pass. |
| `project.typescript.build_info` | Published safe | Only explicit direct incremental/composite `tsBuildInfoFile` under a discovered tsconfig root; bounded JSONC/config scan, targeted recheck, secure file removal, Docker CLI/race fixtures. |
| `project.cmake.build` | Published review | Exact `CMakeCache.txt` source/build identity, `CMakeFiles`, bounded release/protected-tree scan, targeted recheck, secure removal; no force selection. Nested regular-file insertion between final scan and unlink is not atomic. |
| `store.yarn.cache` | Beta executable with `--allow-beta`, Classic 1.x only | Selected workspace and configuration are checked for CLI delegation, the exact owner cache path is pinned with `--cache-folder`, and explicit review is required. Modern Yarn remains rejected and needs a separate rule. |
| `store.nuget.http_cache`, `store.nuget.global_packages` | Published review | Disposable .NET SDK tests verify selected env override, sibling-store preservation, exact-path re-list, truncation rejection, and CLI force exclusion/explicit review. Full combined check remains a release gate. |
| `store.conda.cache` | Split: `store.conda.safe_cache` published review; original unused-package scope beta | Separate pinned tarball/index/log aggregate previews and owner actions preserve sibling stores in disposable Conda 26.7.1 Docker fixtures. `--packages` can miss symlink-dependent environments; `--all` also includes unreviewed tempfiles, so the original remains inactive. |
| `store.deno.cache` | Beta catalogue | Disposable Deno 2.9.6 proved whole-`DENO_DIR` `deno clean` also erased persistent `localStorage`; any future removable cache subset needs a narrower version-aware rule and action. |
| `project.java.build_output` | Published review | Standalone Maven default `target` and simple Java Gradle default `build` only; exact owner grammar, quiet generated marker, release/protected scan, targeted lookup/action, both variant CLI Docker fixtures. Dynamic/inherited/custom output remains unsupported. |
| `docker.network.unused`, `docker.volume.unused` | Beta protected inventory modules staged | Bounded list/inspect matching, daemon identity, and no-action CLI fixture exist; private-daemon acceptance of actual Docker JSON/filter/context behavior is required. An unexecuted TLS/private-network acceptance harness is staged under `tests/docker-acceptance/`. |
| `docker.container.stopped` | Beta exact-ID module staged | Injected fixtures recheck state, references, labels, mounts, and exact `rm` argv; private-daemon acceptance and residual owner races must be reviewed. |
| `docker.image.dangling`, `docker.image.unused` | Beta exact-ID modules staged | Docker remove has no atomic tag/fingerprint precondition, and ID removal can span platform variants. A tag/state change between inspect and remove could exceed the reviewed scope; exact-ID fixtures alone cannot justify publication. |
| `docker.buildkit.cache` | Beta bounded DU parser staged | Named Docker context does not prove a `buildx` builder is local; formatted builder list may contact remote endpoints and inspect lacks structured identity output. No live action handler or private-owner acceptance. |
| `project.python.virtual_envs` | Beta catalogue, work in progress | Process visibility cannot be inferred from `pyvenv.cfg` and age; unsupported or uncertain macOS visibility must skip. |
| `project.python.test_envs` | Beta pinned-session module staged | Exact tox/Nox session virtualenvs exclude reports/siblings; macOS same-user process visibility still needs disposable native proof. |
| `git.worktree.stale_metadata` | Beta catalogue | Git owner prune is aggregate: a missing linked path could be an unmounted drive, and the action has no per-preview-ID condition; Docker owner dry-run alone cannot justify publication. |

No implementation push, PR, or merge occurs at this checkpoint: the final gate is coverage of all 75 baseline proposals (including any split remainder), not an increased published count. The machine-readable [`baseline-75.json`](../registry/baseline-75.json) ledger and `bun run registry:programme` prevent silent rule loss; `bun run registry:release` is the strict publication gate and is expected to fail until every baseline ID or all mapped replacements are published.

As of the latest non-privileged Docker check, the live registry has 28 published and 69 beta catalogue entries (97 total after `.NET` and Conda splits). The full disposable gate passed lint, typecheck, registry validation, 75-baseline presence, build, CLI smoke, and 215 tests; the privileged private-daemon acceptance test was intentionally skipped. These counts are a checkpoint, not the 75-rule completion criterion.

The 69-rule beta relabel is a requested testing checkpoint, not a promotion to supported cleanup. The explicit `--allow-beta` route has five exact code-owned approvals: `store.yarn.cache` supports explicit-review Classic 1.x cache handling; Linux-only `project.python.virtual_envs` and `project.python.test_envs` require explicit review and process-use visibility; `docker.network.unused` and `docker.volume.unused` expose only protected inventory in a pinned context. The other 64 beta IDs fail closed before owner probes and are reported individually in their route; project discovery still uses published markers only. All 17 protected beta entries retain `action: none`. `bun run registry:release` still fails until the baseline and mapped replacements are genuinely published; ordinary `optimise storage` continues to show only eligible published owner targets.

Ordinary private Docker-in-Docker testing uses a privileged service sharing the host kernel. The harness hard-stops before its first Docker command without a separate exact-risk opt-in; it has not been run. Even with no host socket or bind mount, privilege is a meaningful host-security expansion. Docker removal rules remain beta catalogue and non-executable until a safe rootless route is evidenced or the user explicitly authorizes that exact acceptance run; beta network/volume inventory is read-only and protected. macOS-only system actions likewise remain beta catalogue only without disposable native acceptance evidence.

## Shared prerequisites

1. Define typed adapter targets: approved physical paths with scope-root/device/inode identity, or owner resources with stable owner ID, resource ID, and fingerprint. Do not pass an arbitrary adapter path through generic deletion.
2. Introduce code-owned handler manifests with capability probe, bounded inventory, targeted live lookup, live validators, exact action, and source/version notes. Inject command/API runners so unit tests cannot reach real owner tools.
3. Route user, workdir, Docker-context, and system scopes explicitly. Require a supplied workdir/context; never infer a whole-home, Docker socket, or privileged system target. System and Docker review actions need explicit target selection, not `-f`.
4. Extend project-root discovery with code-approved adapter marker metadata. Preserve no-follow containment and descriptor-relative generated-path deletion.
5. Bind actions to exact owner and target identity. Repository-wide owner commands must be represented as aggregate review targets with a fresh owner dry-run, not falsely named per-object deletions.
6. Add missing validators such as release-output exclusion, tool availability, in-use/resource dependency checks, package-manager owner verification, native-system ownership, and data-retention checks. Validator absence blocks readiness.
7. Improve resource apply from whole-inventory requery per candidate to targeted lookup or one bounded, cached owner snapshot with freshness verification. Keep sequential apply and audited attempt/outcome.

## Security and performance gates

- No shell or dynamic command strings, sudo escalation, generic recursive deletion, broad prune, volume/data removal, or symlink traversal. Actions use structured, code-approved arguments or owner APIs and are rejected if selector/action ownership differs.
- Re-probe target identity immediately before action. Revalidate after attempt audit. Treat changed fingerprints, new references, incomplete enumeration, recently changed trees, and owner-tool errors as skips/failures.
- Protected data (volumes, VM disks, archives, Git metadata, app support, credentials, databases, uploads, System Data) is never selectable. Ambiguous caches/build/release output remain explicit review until a stronger owner proof exists.
- Bound per-command execution and output (currently 15 seconds and 64 KiB), per-owner inventory pages/records, path traversal (currently 150,000 activity entries and 50,000 measured entries), global scan time, and concurrent read-only probes. An exceeded budget reports incomplete inventory and cannot authorize action.
- Benchmark scan with absent owners, large stores, many projects/resources, and slow/erroring owners. Avoid O(rules × projects × tree) repeat walks and O(selected × full owner inventory) apply. Action execution remains sequential per owner.

## Verification and release gates

For every baseline ID, record: authoritative owner source; platform/version availability; exact selector identity; scope; tier; action semantics; validators; negative/race tests; bounded-performance test; Docker or native integration evidence; CLI plan/report/audit; documentation status. Test false positives (wrong owner, active/in-use, symlink, replacement, protected content) as well as success. Container tests use `Dockerfile.test` or a disposable owner fixture, no host mount/socket, and no action against this machine.

After implementation, update all current-behavior docs (README, usage, commands, context, registry guide, storage/project/runtime/Docker guides, dependency and product pages, demo, and project plan). Preserve dated historical audit pages as history. Run registry validation, the 75-rule release gate, lint, typecheck, full tests, build/CLI smoke, security review, and Docker integration; add a macOS disposable acceptance gate for Mac-only handlers. Only then commit, push, create a PR with rule-level evidence, wait for required CI, and merge. Keep the branch unmerged if any required rule remains unverified.

## Baseline rule ledger

This is the exact set of 75 proposed IDs at programme start. Tier and selector/action reflect the baseline registry, not permission to publish unchanged. Lane agents will annotate each ID with implementation evidence, replacement mapping, and gate result.

| Baseline ID | Scope | Tier | Selector → action | Lane |
|---|---|---|---|---|
| `apple.xcode.derived_data` | user | review | adapter → adapter | User |
| `apple.simulator.unavailable_device` | user | review | adapter → adapter | User |
| `apple.simulator.runtime` | system | review | adapter → adapter | Context |
| `apple.xcode.platform_component` | system | review | adapter → adapter | Context |
| `apple.xcode.old_installation` | system | review | adapter → adapter | Context |
| `apple.xcode.archive` | user | protected | adapter → none | User |
| `android.avd` | user | review | adapter → adapter | User |
| `android.sdk.package` | user | review | adapter → adapter | User |
| `jvm.gradle.user_home` | user | review | adapter → adapter | User |
| `jvm.maven.repository` | user | review | adapter → adapter | User |
| `jvm.jdk.installation` | system | review | adapter → adapter | Context |
| `runtime.node.version` | user | review | adapter → adapter | User |
| `runtime.python.version` | user | review | adapter → adapter | User |
| `runtime.rust.toolchain` | user | review | adapter → adapter | User |
| `runtime.dotnet.version` | system | review | adapter → adapter | Context |
| `runtime.unity.editor` | system | review | adapter → adapter | Context |
| `store.homebrew.cleanup` | user | review | adapter → adapter | User |
| `store.deno.cache` | user | review | adapter → adapter | User |
| `store.conda.cache` | user | review | adapter → adapter | User |
| `store.nuget.http_cache` | user | review | adapter → command | User |
| `store.nuget.global_packages` | user | review | adapter → command | User |
| `store.bun.cache` | user | review | tool_cache → adapter | User |
| `store.yarn.cache` | user | review | adapter → adapter | User |
| `project.android.build` | workdir | review | adapter → adapter | Workdir |
| `project.javascript.build_cache` | workdir | review | generated_path → remove_generated | Workdir |
| `project.dotnet.bin_obj` | workdir | safe | generated_path → remove_generated | Workdir |
| `project.java.build_output` | workdir | review | adapter → adapter | Workdir |
| `project.cmake.build` | workdir | review | adapter → adapter | Workdir |
| `project.bazel.output` | user | review | adapter → adapter | User |
| `project.unity.library` | workdir | review | adapter → adapter | Workdir |
| `project.terraform.dot_terraform` | workdir | review | adapter → adapter | Workdir |
| `project.configured_tool_cache` | workdir | review | adapter → adapter | Workdir |
| `project.typescript.build_info` | workdir | safe | adapter → adapter | Workdir |
| `project.go.bin` | workdir | review | adapter → adapter | Workdir |
| `project.python.test_envs` | workdir | review | adapter → adapter | Workdir |
| `project.python.virtual_envs` | workdir | review | adapter → adapter | Workdir |
| `docker.container.stopped` | docker_context | review | adapter → adapter | Context |
| `docker.image.dangling` | docker_context | review | adapter → adapter | Context |
| `docker.image.unused` | docker_context | review | adapter → adapter | Context |
| `docker.buildkit.cache` | docker_context | review | adapter → adapter | Context |
| `docker.network.unused` | docker_context | protected | adapter → none | Context |
| `docker.compose.resource` | docker_context | review | adapter → adapter | Context |
| `docker.volume.unused` | docker_context | protected | adapter → none | Context |
| `docker.desktop.disk_image` | system | protected | adapter → none | Context |
| `vm.vagrant.box` | user | review | adapter → adapter | User |
| `vm.colima.profile` | user | review | adapter → adapter | User |
| `vm.lima.profile` | user | review | adapter → adapter | User |
| `vm.local_cluster.image` | docker_context | protected | adapter → none | Context |
| `vm.disk` | user | protected | adapter → none | User |
| `ai.ollama.model` | user | review | adapter → adapter | User |
| `ai.huggingface.cache` | user | review | adapter → adapter | User |
| `ai.duplicate_weights` | user | protected | adapter → none | User |
| `ai.hf_xet.cache` | user | review | adapter → adapter | User |
| `ai.open_webui.data` | user | protected | adapter → none | User |
| `ide.jetbrains.versioned_cache` | user | review | adapter → adapter | User |
| `ide.vscode.extension` | user | review | adapter → adapter | User |
| `ide.vscode.user_data` | user | protected | adapter → none | User |
| `ide.playwright.browser` | user | protected | adapter → none | User |
| `git.lfs.local_object` | workdir | review | adapter → adapter | Workdir |
| `git.worktree.stale_metadata` | workdir | review | adapter → adapter | Workdir |
| `git.clone.duplicate` | workdir | protected | adapter → none | Workdir |
| `git.worktree.generated` | workdir | review | adapter → adapter | Workdir |
| `git.metadata` | workdir | protected | adapter → none | Workdir |
| `app.leftover.cache` | user | review | adapter → adapter | User |
| `app.leftover.support` | user | protected | adapter → none | User |
| `app.sandbox.container` | user | protected | adapter → none | User |
| `download.old_installer` | user | review | adapter → adapter | User |
| `download.duplicate` | user | protected | adapter → none | User |
| `log.tool_owned` | user | review | adapter → adapter | User |
| `log.crash_dump` | user | review | adapter → adapter | User |
| `log.test_trace` | user | review | adapter → adapter | User |
| `macos.content_cache` | system | review | adapter → adapter | Context |
| `macos.tool_temp` | user | review | adapter → adapter | User |
| `macos.system_data` | system | protected | adapter → none | Context |
| `macos.user_caches.inventory` | user | protected | adapter → none | User |
