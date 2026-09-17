# Contributing to kundol

Last updated: 2026-09-15 16:06:28 IST
Related tasks: `KUN-088`, `KUN-093`, `KUN-097`, `KUN-103`

kundol is a Bun + TypeScript CLI. Start with the [current code map](context.md) and [agent guide](agents.md); older dashboard and indexing docs describe retired commands and implementations.

```bash
bun install --frozen-lockfile
bun run dev -- --help
bun run check
```

Keep CLI behavior, tests, and docs in step. For cleanup changes, show the scanned plan before any apply path, recheck live targets, and test against temporary homes and workdirs. Never run destructive smoke tests on your real home, Docker state, or projects. JSON-only catalogue additions follow the [optimisation registry guide](optimisation-registry.md).

## Request or contribute a registry target

1. Run `kundol tools search <query>` for published targets and `kundol tools list` for the full catalogue; also search existing issues. The source definitions are in [`optimisations.json`](../registry/optimisations.json).
2. Run `kundol tools request` to open a prefilled Markdown GitHub issue, or [open the request directly](https://github.com/vikz91/kundol/issues/new?title=%5BRegistry%20request%5D%3A%20&body=Owning%20tool%3A%0A%0AExact%20target%20and%20scope%3A%0A%0AOwner%20documentation%3A%0A%0AWhy%20add%20it%3A%0A%0AData%20and%20safety%20risks%3A%0A). Name the owning tool, exact generated path or resource and scope, owner-maintained documentation, expected benefit, and retention or data risks. Say when ownership or safety is uncertain; omit private paths, usernames, and secrets. The [structured request form](../.github/ISSUE_TEMPLATE/registry_request.yml) is already on `main` and appears in GitHub's issue chooser.
3. Comment on the issue if you want to implement it. A maintainer can triage it, add `help wanted` or `good first issue`, and assign it. Reference the issue in your PR with `Closes #number`.

To draft the first entry, run `bun run registry:new -- --help`. The command asks for a stable rule ID, existing category ID, short label/description, scope, and either an existing source reference or a new owner-documentation URL. It appends one valid `proposed` rule and source without reformatting the whole registry. The generated rule is **protected inventory only**: its selector is an unimplemented placeholder, `action` is `none`, and it cannot remove anything. Inspect [the registry fields and safety policy](optimisation-registry.md), replace the placeholder only when supported by precise owner evidence and code-owned adapters, then run `bun run registry:check` and `bun run check`.

For example, replace `ToolName` and the URL with an actual owner-documented target. `--dry-run` previews the addition; remove it to write the entry.

```bash
bun run registry:new -- \
  --id store.toolname.cache --category shared_stores \
  --label "ToolName cache" --description "Inventory ToolName's generated cache." \
  --scope user --source-id toolname_cache \
  --source-title "ToolName cache guide" --source-url "https://owner.example/docs/cache" \
  --dry-run
```

In the PR, explain the exact target, source, selector, and safety tier. Ask a maintainer for the `registry` label. Once merged, the changelog automatically credits the PR author's GitHub handle; the linked request issue closes through the PR. A merged catalogue entry can remain `proposed` until its registry-backed CLI path exists.

## How a registry rule advances

The `status` on each JSON rule tracks **registry-backed delivery**, not the issue's progress. Move it through these phases in a reviewed PR with evidence for the next gate; merging an issue or PR does not advance it automatically.

| Phase | What the contributor must show | Availability |
|---|---|---|
| `proposed` | Exact owner-documented target, scope, source reference, and conservative review policy. A scaffolded entry starts protected with `action: none`. | Catalogue research only; no registry-backed CLI behavior. |
| `wip` | An implementation PR or linked work item identifies the precise selector/probe, required code-owned adapters, live validators, action or inventory plan, and disposable tests being built. Keep unsupported handlers inactive. | Still unavailable to CLI users. |
| `beta` | Experimental testing catalogue. Executable beta additionally requires implemented handlers, live revalidation, audit, disposable safety tests, documentation, explicit opt-in, and a code-owned approval for that exact ID. | Catalogue-only until those gates pass; review and protected tiers still restrict actions. |
| `published` | Supported normal CLI flow, stable plan/output and failure behavior, regression and safety coverage, and maintained user documentation. A maintainer reviews the evidence and changes the rule status. | Available through the supported CLI path, subject to its safety tier and selection policy. |

The current registry is `engine_ready`, with 28 published and 69 beta catalogue rules. Normal optimisation loads published rules; `--allow-beta` admits only five exact code-approved beta bindings (Yarn Classic review, two Linux Python reviews, and two protected Docker inventories). A status change to `published` can enable a target when its selector, validator, action, owner marker, target kind, and review tier satisfy code-owned policies; review that change as executable behavior. The other 64 beta IDs remain inactive and are reported individually in their route. Missing handlers fail closed, and all 17 protected beta entries remain non-removing. See the [registry guide](optimisation-registry.md) for selector, validator, and action contracts.

For other behavior changes or safety questions, open an issue. In a pull request, describe the trigger, resulting behavior, affected paths, and verification command. The [PR template](../.github/pull_request_template.md) provides a short outline.

During an interactive `git commit`, the version hook asks for a major, minor, or patch bump and stages it in that same commit. Use `KUNDOL_VERSION_BUMP=skip` when a version change is intentionally inappropriate; non-interactive commits skip the prompt.
