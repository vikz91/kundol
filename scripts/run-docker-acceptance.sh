#!/usr/bin/env bash
set -euo pipefail

# This runner deliberately does not call docker at all without the exact opt-in.
if [[ "${KUNDOL_ACCEPT_PRIVILEGED_DIND:-}" != "I_ACCEPT_PRIVILEGED_DIND" ]]; then
  echo "Refusing privileged rootless DinD acceptance run. Set KUNDOL_ACCEPT_PRIVILEGED_DIND=I_ACCEPT_PRIVILEGED_DIND only after approving that specific host-kernel risk." >&2
  exit 2
fi

for executable in docker jq; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "Missing required executable: $executable" >&2
    exit 2
  fi
done

if env | grep '^DOCKER_' >/dev/null; then
  echo "Ambient DOCKER_* overrides are forbidden for the private-daemon runner" >&2
  exit 2
fi

orchestrator_context="${KUNDOL_ACCEPTANCE_ORCHESTRATOR_CONTEXT:-}"
if [[ ! "$orchestrator_context" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]]; then
  echo "An explicit, bounded local Docker orchestrator context is required" >&2
  exit 2
fi

docker_cmd=(docker --context "$orchestrator_context")
endpoint="$(docker context inspect "$orchestrator_context" --format '{{.Endpoints.docker.Host}}')"
if [[ ! "$endpoint" =~ ^unix:///[a-zA-Z0-9_./-]+$ || "$endpoint" == *..* ]]; then
  echo "Only an explicit local Unix-socket Docker orchestrator context is permitted" >&2
  exit 2
fi
daemon_id="$("${docker_cmd[@]}" info --format '{{.ID}}')"
if [[ -z "$daemon_id" || ${#daemon_id} -gt 256 ]]; then
  echo "The local orchestrator daemon did not provide a stable identity" >&2
  exit 2
fi

verify_orchestrator() {
  local live_endpoint live_id
  live_endpoint="$(docker context inspect "$orchestrator_context" --format '{{.Endpoints.docker.Host}}')" || return 1
  live_id="$("${docker_cmd[@]}" info --format '{{.ID}}')" || return 1
  [[ "$live_endpoint" == "$endpoint" && "$live_id" == "$daemon_id" ]]
}

if ! "${docker_cmd[@]}" compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required" >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_file="$script_dir/../tests/docker-acceptance/compose.yaml"

# Check the rendered Compose graph before creating anything. The only
# privileged service is the disposable daemon; neither service can see a host
# path/socket, port, device, PID or IPC namespace. The network has no gateway.
if ! verify_orchestrator || ! "${docker_cmd[@]}" compose -f "$compose_file" config --format json | jq -e '
  (.services | keys | sort) == ["acceptance", "daemon"] and
  .services.daemon.privileged == true and
  (.services.acceptance.privileged // false) == false and
  .networks.private.internal == true and
  all(.services[];
    all((.volumes // [])[]; .type == "volume") and
    ((.ports // []) | length) == 0 and
    ((.devices // []) | length) == 0 and
    ((.network_mode // "") == "") and
    ((.pid // "") == "") and
    ((.ipc // "") == "")
  )
' >/dev/null; then
  echo "Rendered Compose graph violates private-daemon isolation requirements" >&2
  exit 2
fi

# The project name is unique and is the only cleanup target. This leaves
# unrelated host Docker resources untouched. Compose-built images may remain.
project="kundol-acceptance-$(date +%s)-$$"
cleanup() {
  if verify_orchestrator; then
    "${docker_cmd[@]}" compose -f "$compose_file" -p "$project" down --volumes ||
      echo "Private acceptance project $project needs scoped manual cleanup" >&2
  else
    echo "Orchestrator identity changed; refusing cleanup. Inspect only acceptance project $project before manual recovery." >&2
  fi
}
trap cleanup EXIT

if ! verify_orchestrator; then
  echo "Orchestrator identity changed before acceptance startup" >&2
  exit 2
fi
"${docker_cmd[@]}" compose -f "$compose_file" -p "$project" up --build --exit-code-from acceptance
