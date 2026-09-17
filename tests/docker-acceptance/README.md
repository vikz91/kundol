# Private-daemon Docker acceptance harness

This is a deliberately separate acceptance test for the proposed protected
network/volume selectors, proposed dangling/unused image selectors, and
proposed stopped-container exact-ID action. It is
**not** part of the ordinary `bun test` run; the test is skipped unless the
isolated client service sets `KUNDOL_ACCEPTANCE_INNER=isolated-client`.

The Compose graph has a rootless Docker-in-Docker daemon on an `internal: true`
network, with no published port, host bind mount, host Docker socket, device,
host PID namespace, or host IPC namespace. The unprivileged client is built
from a repository snapshot and shares only a new named volume containing
short-lived TLS client certificates. Its Docker context points to
`tcp://daemon:2376`; command runners clear ambient `DOCKER_*` overrides and
require a full pinned context name, endpoint, and daemon ID. Test fixtures are
created **inside that private daemon only**. The fixture image is built from
local static BusyBox bytes using `FROM scratch` and `--network none`, so the
private daemon need not pull from the internet.

## Privilege and execution gate

The official rootless DinD image still requires `privileged: true` to run
nested Docker. That gives its container broad capabilities against the host
kernel and is a material security risk, even without a host socket or mounts.
The repository runner refuses to issue *any* Docker command without this exact
opt-in value:

```sh
KUNDOL_ACCEPT_PRIVILEGED_DIND=I_ACCEPT_PRIVILEGED_DIND \
KUNDOL_ACCEPTANCE_ORCHESTRATOR_CONTEXT=default \
bash scripts/run-docker-acceptance.sh
```

Do not invoke that command without explicit approval of the privileged
container risk. If a genuinely non-privileged private-daemon alternative is
available, use it instead and adjust the isolation checks first. This harness
has been written but **not executed** because that approval has not been
given. Lack of an acceptance pass keeps these Docker owner rules proposed.

### Non-privileged VM alternative (investigated, not provisioned)

Official Docker documentation does **not** support ordinary rootless DinD
without `--privileged`: that flag is required to disable the outer container's
seccomp, AppArmor, and mount masks. A separate disposable Linux VM is a better
boundary. Lima's official `docker` template provisions a rootless daemon in a
VM, and `limactl copy` can transfer a repository snapshot into the guest
without sharing a host directory. The VM configuration must explicitly set
`mounts: []` and `portForwards: []`: Lima's usual template mounts host home
read-only and forwards a guest Docker socket to the host. Then run an adapted
acceptance client **inside the guest**, pinning its rootless daemon's Unix
socket and ID. Do not mount the macOS host Docker socket or use the normal
host daemon as the resource owner.

This path is not ready to run here: `limactl` is not installed, the guest image
and Bun runtime have not been pinned/verified, and this test currently assumes
TLS to the private Compose daemon. VM provisioning and the endpoint variant
need a separate, reviewed harness before an acceptance pass can be claimed.
See [Lima's Docker template](https://github.com/lima-vm/lima/blob/master/templates/docker.yaml)
and [Lima copy](https://lima-vm.io/docs/reference/limactl_copy/).

The `default` context in this example must resolve to a local Unix-socket
daemon; a remote TCP/SSH context is rejected. The runner also refuses ambient
`DOCKER_*` overrides, and pins the orchestrator's context endpoint and daemon
ID before startup and before project-scoped cleanup.

The runner requires Docker Compose v2 and `jq`. Before creating anything, it
validates the rendered service graph: only the daemon may be privileged;
every mount must be a named volume; neither service may have ports, devices,
host networking, PID sharing, or IPC sharing; the network must be internal.
The client then checks its isolated home, certificate files, literal endpoint,
and absence of `/var/run/docker.sock` before any owner command.

## Acceptance criteria and cleanup

The private daemon test must:

1. Create an explicit TLS Docker context and verify the daemon's ID.
2. Inventory an unattached, full-ID network and a dangling named volume;
   exclude a network and volume attached to a running fixture container.
3. Target-lookup the exact protected resources with unchanged fingerprints,
   and confirm the protected binding exposes no action adapter.
4. Inventory a locally imported dangling image and a sole-tag unused image by
   full `sha256:<64>` IDs, exclude images used by the running or stopped
   fixture containers, and target-lookup both with unchanged fingerprints.
5. Inventory one exited container by full 64-character ID, target-lookup it,
   and recheck its stopped state and owner references.
6. Remove only each reviewed full container/image ID without `--force`,
   `--volumes`, a broad `prune`, or a bulk selector. Image removal uses
   `--no-prune` to prevent implicit parent deletion. Verify the running
   fixture, its image, unused network, and unused volume still exist and retain
   their fingerprints.

The runner uses a unique Compose project name and traps `docker compose down
--volumes` for **only that project**. This removes the test containers, private
network, and certificate volume; the nested daemon's writable layer and all
its fixture resources disappear with it. It does not call host resource-owner
cleanup or `docker system prune`. A locally built client image may remain and
can be inspected or removed separately after confirming its exact identity.

References: [official Docker image](https://hub.docker.com/_/docker),
[rootless DinD privilege note](https://docs.docker.com/engine/security/rootless/tips/),
[Compose internal networks](https://docs.docker.com/compose/how-tos/networking/).
