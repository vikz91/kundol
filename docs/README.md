# kundol Docs

Created: 2026-06-13 07:21:12 IST
Last updated: 2026-09-15 16:12:23 IST

For implemented behavior in this checkout, start with [usage](usage.md), [public commands](commands.md), and [codebase context](context.md). The five public optimisation routes use the JSON registry engine; `optimise all` resolves supplied or saved scopes, discovering a Docker context when needed, and the standalone Docker route has no published Docker rule yet. Startup and earlier hardcoded cleanup paths have been retired. Try project cleanup against disposable files with the [Docker sandbox](demo/docker-sandbox.md). The [75-rule implementation plan](registry-75-implementation-plan.md) separates staged modules from published behavior. [Homebrew readiness](homebrew-publishing-readiness.md) dates its release and formula status so a later tag or PR merge calls for re-verification; dated [learnings](learnings.md) and [plan](plan.md) entries preserve historical decisions.

| Area | Pages |
|---|---|
| Work coordination | [Agent guide](agents.md), [task ledger](plan.md), [learning log](learnings.md). |
| Product and design | [Product goal](product-goal.md), [architecture](architecture.md), [user flow](user-flow.md), [early implementation wave](workflows/implementation-wave-001.md). |
| Current CLI | [Usage](usage.md), [commands](commands.md), [codebase context](context.md), [workspace fixture](demo/seed-demo-workspace.md), [Docker sandbox](demo/docker-sandbox.md). |
| System and project knowledge | [Storage optimiser](storage-optimizer.md), [SQLite audit and scope defaults](storage-config.md), [Docker](docker.md), [project runtimes](project-runtimes.md), [dependencies](dependencies.md). |
| Optimisation catalogue | [Cleanup target research](developer-cleanup-targets.md), [JSON registry and engine](optimisation-registry.md). Published user and project rules drive their CLI flows; other rules remain research or implementation work. |
| Brand and launch | [Brand](brand.md), [launch guide](launch.md), [launch research](viral-launch.md). |
| Contributing and release | [Contributing and registry requests](CONTRIBUTING.md), [request form](../.github/ISSUE_TEMPLATE/registry_request.yml), [author](AUTHOR.md), [changelog](CHANGELOG.md), [release workflow](release.md), [Homebrew readiness](homebrew-publishing-readiness.md). |

The [public help manual](https://vikz91.github.io/kundol/) provides searchable user guides and generated references. See [manual authoring and publication](manual-publishing.md) for the VitePress and GitHub Pages workflow.

Add dated, task-linked durable decisions under `docs/`; keep chronological discoveries in [learnings.md](learnings.md). Link any new page here and in [agents.md](agents.md).
