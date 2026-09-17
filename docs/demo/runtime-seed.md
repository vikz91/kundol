# Real multi-runtime Docker seed

`Dockerfile.runtime-seed` installs Node/npm/pnpm, JDK/Maven, Python/pip, Go, and the .NET SDK into one disposable Linux image. [`seed-runtime-artifacts.mjs`](../../scripts/seed-runtime-artifacts.mjs) restores pinned small public dependencies and builds six real projects in `/sandbox/projects`: separate npm and pnpm projects, Maven/JDK, Python virtualenv, Go module, and .NET console. Their owner caches live only in `/sandbox/home`. Each project also has `KEEP.user-data` outside generated output. The seeder ages the finished sandbox trees eight days so quiet-period rules can be previewed; it never runs cleanup.

| Project | Restored package | Real generated evidence |
|---|---|---|
| `node-npm` | lodash 4.17.21 | npm cache, `node_modules`, `package-lock.json`, `dist` |
| `node-pnpm` | zod 3.24.1, TypeScript 5.9.3 | pnpm store/lock, `node_modules`, `dist`, `.tsbuildinfo` |
| `java-maven` | JUnit 4.13.2 | Maven repository, default `target/classes` and `target/test-classes` |
| `python-venv` | requests 2.32.3 | pip cache, `.venv`, `__pycache__` |
| `go-module` | google/uuid v1.6.0 | Go module/build caches, `go.sum`, compiled `bin` |
| `dotnet-console` | Newtonsoft.Json 13.0.3 | NuGet HTTP/global stores, `obj`, `bin` |

```bash
docker build -f Dockerfile.runtime-seed -t kundol-runtime-seed:local .
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --user 10001:10001 kundol-runtime-seed:local
```

The default command checks the code-owned artifact manifest and real package caches. It does not mount a host project or Docker socket. Dependency downloads happen during `docker build`; run-time verification can use `--network none`. Rebuild after changing a pinned dependency or seed script. The image records runtime versions in `/sandbox/runtime-seed-manifest.json`; Ubuntu package versions may change across uncached builds, so report that manifest with a test result.

To see Kundol's project plan without selecting targets:

```bash
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --user 10001:10001 kundol-runtime-seed:local \
  bun run src/cli/index.ts optimise projects /sandbox/projects
```

To preview the Linux-only beta Python virtualenv in the same throwaway container, add the explicit opt-in. A non-interactive run prints the plan and cancels; it does not delete the venv:

```bash
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --user 10001:10001 kundol-runtime-seed:local \
  bun run src/cli/index.ts optimise projects /sandbox/projects --allow-beta
```

The real seed currently shows `project.python.virtual_envs` as `[beta review]`. It requires a displayed-number selection for removal, and `-f` never selects it. The tox/Nox beta rule needs a separately seeded pinned session fixture. Other beta rules without executable approval are reported individually by ID and reason; their owner probes do not run.

To exercise only currently published safe project actions in a throwaway container and assert that the Maven review target, final outputs, and all six `KEEP.user-data` files survive:

```bash
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  --user 10001:10001 kundol-runtime-seed:local \
  node scripts/verify-runtime-seed-cleanup.mjs
```

This command mutates only that ephemeral container; the seeded image and host projects stay unchanged.

No Docker-context cleanup is tested by this seed image. Docker resources require a separate, disposable daemon and an explicit named context; do not mount `/var/run/docker.sock` into this image.

## Manual Docker-context acceptance checklist

Use a disposable daemon/context only. Do not run these checks against your default or production Docker daemon, and do not run `docker system prune` or `docker volume prune`. The staged [private-daemon harness](../../tests/docker-acceptance/README.md) describes the fixture topology, but its DinD service requires `--privileged`; run that only in an environment where you have deliberately accepted that host-kernel risk. A separate disposable VM is preferable.

1. Before creating fixtures, record the named context's endpoint type, `docker --context <disposable-context> info --format '{{.ID}}'`, Docker server version, and image-store type. Confirm every subsequent command uses that exact `--context` value and the daemon ID remains unchanged. Do not share TLS keys, socket paths, or credentials.
2. Create one running container with an attached named network and volume, and one exited container with no volume. Also create one unattached network and volume. Check that list/inspect JSON reports full IDs, the running container stays running, and attached resources are excluded from unused inventories. Protected network/volume entries must never have a removal action.
3. In that same daemon, create a dangling image with no tags/digests and a separate unused image with exactly one tag and no container references. Record full `sha256:` IDs, tags, digests, child images, platform variants, and all-container references before and after a fresh inspect. Try only `docker --context <disposable-context> image rm --no-prune <full-id>` on those disposable images. Verify the active image and unrelated parent images remain; report whether a sole tag or more than one platform variant was removed.
4. For the image race, repeat with a new disposable image: inspect it, add a second tag before exact-ID removal, then record whether the removal touches the newly added tag. This is a product-safety test, not an instruction to accept the race in Kundol.
5. For the exited container, compare a fresh full-ID inspect to `docker --context <disposable-context> container rm <full-id>` and verify that only it disappears. Change its state or add a reference between inspect and removal in a separate disposable fixture; record Docker's response and whether the running/volume-backed container remains.
6. Report the command outputs or a concise before/after table: context name and daemon ID, Docker version/store type, exact fixture IDs, inventory counts, removed IDs/tags/platforms, protected resources preserved, and any error. Redact credentials and endpoint secrets. A successful happy-path run does not resolve non-atomic tag/state races by itself.

`optimise docker <context> --allow-beta` can inventory only protected unused networks and volumes in a private named context; Docker removal rules remain beta catalogue-only pending private-daemon acceptance and a safe owner-action policy. This Linux image has no Docker socket and cannot verify those context resources or native macOS Xcode, Simulator, app, or system-storage actions.
