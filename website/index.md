---
layout: home

hero:
  name: kundol
  text: Reclaim developer storage with a plan.
  tagline: Review caches and generated project files, choose targets, and keep a local audit of the results.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Command reference
      link: /reference/cli

features:
  - title: Review before cleanup
    details: Every optimisation prints its targets and safety tiers before you choose what to apply.
    link: /safety
  - title: Browse supported rules
    details: Explore the bundled catalogue, including published rules and experimental proposals.
    link: /reference/rules
  - title: Understand the code
    details: Follow the CLI, registry engine, live checks, and audit flow in the architecture diagrams.
    link: /architecture
---

## Choose a starting point

- [Getting started](./getting-started.md): install from cloned/downloaded source with `bun run register:cli` or download a macOS executable. Homebrew is coming soon.
- [Safety and selection](./safety.md): understand safe, review, protected, and beta rules.
- [Troubleshooting](./troubleshooting.md): explain skipped targets, missing tools, and audit results.

kundol is a macOS-first command-line tool. The manual describes the version built with this site; use `kundol --version` and `kundol --help` to check your installed version.
