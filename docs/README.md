# kundol Docs

Created: 2026-06-13 07:21:12 IST
Last updated: 2026-09-15 14:07:32 IST

For implemented behavior, start with [usage](usage.md), [public commands](commands.md), and [codebase context](context.md). The three public cleanup routes use the JSON registry engine; startup and earlier hardcoded cleanup paths have been retired. Try project cleanup against disposable files with the [Docker sandbox](demo/docker-sandbox.md). Research pages distinguish published rules from future work.

| Area | Pages |
|---|---|
| Work coordination | [Agent guide](agents.md), [task ledger](plan.md), [learning log](learnings.md). |
| Product and design | [Product goal](product-goal.md), [architecture](architecture.md), [user flow](user-flow.md), [early implementation wave](workflows/implementation-wave-001.md). |
| Current CLI | [Usage](usage.md), [commands](commands.md), [codebase context](context.md), [workspace fixture](demo/seed-demo-workspace.md), [Docker sandbox](demo/docker-sandbox.md). |
| System and project knowledge | [Storage optimiser](storage-optimizer.md), [SQLite audit and historical configuration](storage-config.md), [Docker](docker.md), [project runtimes](project-runtimes.md), [dependencies](dependencies.md). |
| Optimisation catalogue | [Cleanup target research](developer-cleanup-targets.md), [JSON registry and engine](optimisation-registry.md). Published user and project rules drive their CLI flows; other rules remain research or implementation work. |
| Brand and launch | [Brand](brand.md), [launch guide](launch.md), [launch research](viral-launch.md). |
| Contributing and release | [Contributing and registry requests](CONTRIBUTING.md), [request form](../.github/ISSUE_TEMPLATE/registry_request.yml), [author](AUTHOR.md), [changelog](CHANGELOG.md), [release workflow](release.md), [Homebrew readiness](homebrew-publishing-readiness.md). |

Add dated, task-linked durable decisions under `docs/`; keep chronological discoveries in [learnings.md](learnings.md). Link any new page here and in [agents.md](agents.md).
