<p align="center">
  <img src="../assets/logo.png" alt="kundol logo: cyan K with a mint centre on charcoal" width="96" height="96">
</p>

# kundol Knowledge Base

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-09-15 11:39:56 IST

This directory stores durable project knowledge for agents.
Use [learnings.md](learnings.md) for chronological notes, and promote stable decisions or reusable explanations into this directory.

Current pages:

- [`agents.md`](agents.md) - operating guide for agents working in the repository
- [`plan.md`](plan.md) - task ledger, dependencies, and decisions
- [`learnings.md`](learnings.md) - chronological implementation discoveries
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contributor setup and cleanup safety guidance
- [`AUTHOR.md`](AUTHOR.md) - original author credit
- [`CHANGELOG.md`](CHANGELOG.md) - merged PR entries by version
- [`release.md`](release.md) - commit-time version choice, changelog, executable packaging, and GitHub release flow
- [`architecture.md`](architecture.md) - historical Bun + TypeScript layered architecture, including removed TUI surfaces
- [`brand.md`](brand.md) - GitHub description, logo asset and description, palette, and brand usage notes
- [`commands.md`](commands.md) - CLI-only command surface, including storage, startup, projects, and repos optimisation
- [`context.md`](context.md) - implementation-grounded map of current commands, macOS scopes, modules, persistence, safety limits, and tests
- [`developer-cleanup-targets.md`](developer-cleanup-targets.md) - sourced, proposed macOS developer cleanup categories, targets, and safety strategies
- [`optimisation-registry.md`](optimisation-registry.md) - versioned JSON catalogue, contribution format, validation, and safety boundaries
- [`dependencies.md`](dependencies.md) - Bun/npm dependencies, optional packages, and required/optional system tools
- [`demo/seed-demo-workspace.md`](demo/seed-demo-workspace.md) - fake Node, Python, and Go workspace seeder for current project optimiser testing
- [`demo/docker-sandbox.md`](demo/docker-sandbox.md) - first-time disposable Docker image, installed `kundol` command, and simulated cleanup fixtures
- [`docker.md`](docker.md) - planned Docker resource monitoring and targeted purge design; current storage command uses system prune
- [`launch.md`](launch.md) - open-source launch supply chain for GitHub, branding, community, content, metrics, and future cloud services
- [`product-goal.md`](product-goal.md) - current macOS CLI goal, product shape, retained project analysis, and future roadmap
- [`project-runtimes.md`](project-runtimes.md) - supported runtime families, project markers, cleanup candidates, caution files, and workflow notes
- [`storage-config.md`](storage-config.md) - user-scoped database, workspace config, and ignore pattern decisions
- [`storage-optimizer.md`](storage-optimizer.md) - historical storage optimizer plan; superseded by CLI-only `optimise` command direction where applicable
- [`user-flow.md`](user-flow.md) - historical first-run flow; superseded by CLI-only optimise workflows where applicable
- [`viral-launch.md`](viral-launch.md) - research-backed low-cost viral launch strategy from successful OSS launch patterns
- [`workflows/implementation-wave-001.md`](workflows/implementation-wave-001.md) - coordination note for the first parallel implementation wave

Recommended pages:

- `sqlite.md` - schema, migrations, query patterns, test database practices
- `safety.md` - plan-first cleanup behavior, protected paths, confirmation rules
- `runtime-audit.md` - runtime version detection and latest-version strategy

When adding a page, include:

- Date created or updated
- Related [plan.md](plan.md) task IDs
- Decision or knowledge summary
- Rationale
- Consequences or follow-up tasks
