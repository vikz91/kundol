<p align="center">
  <img src="../assets/logo.png" alt="kundol logo" width="96" height="96">
</p>

# kundol Knowledge Base

Created: 2026-06-13 07:21:12 IST  
Last updated: 2026-06-15 21:37:29 IST  

This directory stores durable project knowledge for agents.
Use `learnings.md` for chronological notes, and promote stable decisions or reusable explanations into this directory.

Current pages:

- [`architecture.md`](architecture.md) - scalable Bun + TypeScript TUI architecture, module boundaries, data flow, and maintainability rules
- [`brand.md`](brand.md) - logo asset, color palette, and brand usage notes
- [`commands.md`](commands.md) - narrowed MVP command surface and later command groups
  - [`commands/default-tui.md`](commands/default-tui.md) - hardened spec for `kundol`
  - [`commands/init.md`](commands/init.md) - hardened spec for `kundol init`
  - [`commands/index.md`](commands/index.md) - hardened spec for `kundol index`
  - [`commands/scan.md`](commands/scan.md) - hardened spec for `kundol scan <project>`
- [`dependencies.md`](dependencies.md) - Bun/npm dependencies, optional packages, and required/optional system tools
- [`demo/seed-demo-workspace.md`](demo/seed-demo-workspace.md) - fake workspace seeder for manual CLI testing
- [`docker.md`](docker.md) - Docker resource monitoring, analysis, purge workflows, and safety rules
- [`launch.md`](launch.md) - open-source launch supply chain for GitHub, branding, community, content, metrics, and future cloud services
- [`product-goal.md`](product-goal.md) - main goal, product shape, worker model, runtime scope, and future roadmap
- [`project-runtimes.md`](project-runtimes.md) - supported runtime families, project markers, cleanup candidates, caution files, and workflow notes
- [`storage-config.md`](storage-config.md) - user-scoped database, workspace config, and ignore pattern decisions
- [`storage-optimizer.md`](storage-optimizer.md) - plan for one-click optimize storage with safety tiers and cleanup candidates
- [`user-flow.md`](user-flow.md) - install, init, first index, first dashboard, review, project scan, cleanup, and daemon flow
- [`viral-launch.md`](viral-launch.md) - research-backed low-cost viral launch strategy from successful OSS launch patterns
- [`workflows/implementation-wave-001.md`](workflows/implementation-wave-001.md) - coordination note for the first parallel implementation wave

Recommended pages:

- `sqlite.md` - schema, migrations, query patterns, test database practices
- `tui.md` - terminal UI components, layouts, keyboard patterns, visual language
- `safety.md` - dry-run behavior, protected paths, confirmation rules
- `runtime-audit.md` - runtime version detection and latest-version strategy
- `release.md` - packaging, smoke tests, and release checklist

When adding a page, include:

- Date created or updated
- Related `plan.md` task IDs
- Decision or knowledge summary
- Rationale
- Consequences or follow-up tasks
