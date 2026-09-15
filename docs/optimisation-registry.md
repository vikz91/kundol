# Optimisation Registry

Created: 2026-09-15 11:06:57 IST  
Related task: `KUN-083`  
Status: catalogue and validation; the public CLI does not load these rules yet.

[`optimisations.json`](../registry/optimisations.json) is the proposed single source of truth for developer-machine optimisation definitions. It contains 76 rules in the 13 categories researched in [`developer-cleanup-targets.md`](developer-cleanup-targets.md). A rule has a stable ID, display copy, scope, target selector, optional probe commands, review policy, live validators, action descriptor, and source references. Repeated targets have one canonical rule: SwiftPM `.build` belongs to project-generated files, while Maven and Gradle shared stores belong to JVM.

The registry is `schemaVersion: 1` and `integration: catalogue_only`. Existing `kundol optimise` commands still use their current hardcoded planners and apply paths; the catalogue creates no new command and grants no permission to delete a path. A future engine can consume a validated rule in three phases: probe and identify a precise target; show resource identity, size, evidence, and safety tier for review; then re-identify and validate the live target before a dedicated executor acts and audits the result. The engine must deduplicate physical paths and Docker/VM resource IDs when rules overlap.

| JSON field | Meaning |
|---|---|
| `categories` | Stable category IDs and human labels for plan grouping. |
| `sources` / `sourceRefs` | Official or owner-maintained source URLs, linked from each rule. |
| `id`, `categoryId`, `label`, `description` | Stable rule identity and concise user-facing copy. |
| `scope`, `selector` | Where to inventory and how to identify an exact generated path, tool cache, or owner-tool resource. |
| `probeCommands` | Optional structured argument arrays used for read-only inventory. |
| `review` | `safe` suggested, `review` explicit selection, or `protected` inventory only; `forceEligible` is false for review and protected rules. |
| `validators` | Checks the engine must repeat immediately before apply, including existence, activity, path containment, project markers, and resource-use evidence. |
| `action` | A structured owner-tool adapter, fixed argument array, generated-path removal, or `none`. |
| `messageTemplates` | Shared plan, success, skipped, and failure output templates. |

The JSON describes actions; it is not an executable shell script. Structured `argv` entries and adapters require dedicated process execution and code-owned safety checks. `protected` rules must use `selection: none` and `action: none`, including Docker volumes, VM disks, Open WebUI data, Git metadata, Xcode archives, app support/container data, and macOS System Data. The validator rejects shell command forms, duplicate IDs, missing category/source references, and suggested generated-path removal without live path, symlink, marker, and activity checks.

Contributors can add or refine JSON rules through a registry-only PR when the selector, validator, and action IDs already have engine adapters. A new adapter or resource type still needs code and tests; an unimplemented adapter remains a proposal and must never silently fall back to directory deletion. The top-level `catalogue_only` marker is intentionally fixed until that engine and its CLI integration are ready. Keep sources specific to the target and distinguish removable generated data from configuration or user data.

Run `bun run registry:check` before a PR. `bun run check` includes that command and regression tests. Current follow-up work should narrow the broad Docker prune and top-level temp selection documented in [`context.md`](context.md) before wiring these rules into storage apply.
