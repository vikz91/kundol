# Product Goal

Created: 2026-06-13 08:34:13 IST
Last updated: 2026-09-17 12:00:00 IST
Related tasks: `KUN-003`, `KUN-004`, `KUN-010`, `KUN-011`, `KUN-012`, `KUN-016`, `KUN-032`, `KUN-033`, `KUN-036`, `KUN-057`, `KUN-077`, `KUN-080`, `KUN-092`, `KUN-098`

kundol is a macOS-first Bun and TypeScript CLI for optimising developer-machine storage and generated code-project artifacts. It should help a user see **what** is selected, **why**, and **what happened** before trusting it with cleanup. The first-time [Docker sandbox](demo/docker-sandbox.md) makes that workflow testable against disposable files.

## Current product

```text
chosen scope, or explicit all-scope workdir and Docker context
  -> deterministic scan and classification
  -> printed plan and confirmation/selection (or -f)
  -> applicable live checks and execution
  -> report, SQLite actions, and session audit
```

The public optimisation commands are `kundol optimise all|storage|projects|repos|docker`. All use the JSON registry probe-review-apply engine. `all` requires an explicit workdir and named Docker context and combines user, workdir, Docker-context, and system results into one plan without weakening rule eligibility. Project roots are discovered from published direct markers under an explicit workdir; `repos` uses the same workflow without Git filtering. Storage offers scoped npm, pip, uv, Go, pnpm, Bun, NuGet, and reviewed Conda safe-category owner-cache rules. Docker requires a named context and has no published resource rule yet. Broad Docker prune, arbitrary top-level temp deletion, and startup-item changes are outside the public cleanup paths. `kundol tools available|search|list` browses the catalogue; `kundol tools request` and `kundol issue` open GitHub issue flows. See [usage](usage.md), [commands](commands.md), and [context](context.md) for exact behavior and limits.

The earlier workspace index, project registry, scan/clean, recommendation, archive, and startup implementation has been retired. Historical SQLite migration tables remain for database compatibility, while active optimise runs record actions and session audits. Deterministic workers are system code, not AI agents.

## Design direction

Keep CLI presentation separate from scanners and safety services. Explain each candidate and report partial failure instead of hiding it. Preserve project source and user data; do not scan the whole home directory by default or modify source code. Do not install/update runtimes, sync to cloud, or add team dashboards as part of this CLI.

Individual Docker resource inventory, attributed temp selection, runtime audits, iOS/Android analyzers, and any future UI are proposals rather than shipped features. Docker resource safety stays separate from project-local generated-file rules. The [registry guide](optimisation-registry.md) describes publication gates and current review policy.
