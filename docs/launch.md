# kundol Launch and Community Guide

Created: 2026-06-13
Last updated: 2026-09-15 14:07:32 IST
Related tasks: `KUN-001`, `KUN-049`–`KUN-055`, `KUN-092`, `KUN-095`

This is a launch checklist for the **current CLI**. See [commands](commands.md) and [codebase context](context.md) for implemented behavior, [release workflow](release.md) for publishing, and [launch research](viral-launch.md) for the rationale.

## Positioning and proof

kundol is a macOS-first CLI for developer-machine cache and generated-project optimisation. `optimise storage|projects|repos` runs registry plans; `tools available|search|list|request` browses or requests registry tools, and `issue` opens GitHub reporting. `repos` uses the same project handler without Git filtering. See [usage](usage.md).

Lead with a short, real terminal demo: scan a disposable workdir, show the plan, then choose whether to apply. Each run prints a plan before prompting; `-f` skips the prompt after planning. Show protected project files and the resulting audit record. Do not advertise project inventory, dashboards, archive, runtime audits, or a `--dry-run` flag as public features.

For first-time testing, link the [Docker sandbox](demo/docker-sandbox.md). It supplies fake projects without mounting host projects or the host Docker socket. The project cleanup path runs against disposable generated files.

Safety copy must be specific. Published project rules require approved selectors, markers, live path checks, and safety tiers; protected inventory cannot be removed. The current public storage route does not prune Docker or arbitrary temp entries. [Current limits](context.md#present-limits) include owner-tool re-download costs, so avoid blanket safety claims.

## Repository readiness

Before a public launch:

1. Verify the README's install, [usage guide](usage.md), help, Docker demo, and CLI examples from a fresh checkout. Run `bun run check` and the local [release build](release.md#local-build) on macOS.
2. Publish a license, code of conduct, and security reporting policy. The repository already has [issue templates](../.github/ISSUE_TEMPLATE/bug_report.md), a [PR template](../.github/pull_request_template.md), and a [contribution guide](CONTRIBUTING.md).
3. Add one terminal recording that shows `optimise projects` against disposable fixtures and the plan/report. Keep claims tied to that output.
4. Provide a clear limitations section and a route for reporting false positives, install failures, and confusing plans.
5. Enable GitHub Discussions only if a maintainer can answer safety and support questions promptly. Seed a few useful topics: welcome, safety reports, generated-file candidates, and runtime markers.

The repository contains merged-PR CI, changelog, and release workflows. After a successful changelog run, the release job creates and pushes the version tag itself; no manual tag push starts it. The [release guide](release.md#repository-requirements) lists the bot permissions needed for changelog and tag pushes and notes that live GitHub behavior still needs validation.

## Launch and feedback loop

Use GitHub as the primary install and feedback destination. A launch post should include one concrete command, one truthful before/after result from disposable files, the Docker trial path, and the safety limits. A small terminal clip can become the README example, a short post, and a longer explanation; do not invent reclaimed-byte figures.

During launch week, answer safety and install reports first. Turn repeated questions into docs or issues, and generated-file/runtimes gaps into small fixture-backed contributor tasks. Track release downloads, successful trial feedback, install failures, and false-positive reports rather than treating stars as proof of safe use.

Keep the local CLI usable without an account. Any future hosted or team product is an optional product decision, not a current kundol command or launch promise.
