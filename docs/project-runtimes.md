# Project Runtime Context

Created: 2026-06-13 07:25:45 IST
Last updated: 2026-09-15 18:14:45 IST
Related tasks: `KUN-010`, `KUN-025`, `KUN-083`, `KUN-092`, `KUN-098`, `KUN-102`, `KUN-103`

`kundol optimise projects <workdir>` and `kundol optimise repos <workdir>` share the registry-backed scanner; `repos` does **not** require Git metadata. The scanner searches to fixed depth 7 for direct child markers in published workdir rules, including direct TypeScript config, CMake source, Maven POM, and Gradle build/settings markers, then probes owner-verified generated entries under each detected root. The older hardcoded project optimizer and shared safety policy have been retired. There is no public runtime-audit command.

## Published project rules

| Family | Direct child marker | Current registry candidate |
|---|---|---|
| SwiftPM | `Package.swift` | Generated `.build` directory, safe suggestion after live checks. |
| JavaScript | `package.json` | `node_modules` directory, safe suggestion after live checks. |
| Python | `pyproject.toml`, `requirements.txt`, or `setup.py` | Bytecode/test/lint caches are safe suggestions; `htmlcov` is explicit review. |
| Rust | `Cargo.toml` | Cargo `target` directory, safe suggestion after live checks. |
| Java Maven / Gradle | Standalone `pom.xml`, or direct `build.gradle[.kts]` plus `settings.gradle[.kts]` | Default Maven `target` or simple Java Gradle `build`, explicit review only; release archives and protected entries block the candidate. |
| Visual Studio | `*.sln` | `.vs` state is protected inventory, with no removal action. |

A published rule must have a literal generated name, matching marker, exact file/directory kind, minimum review tier, required live validators, and a code-approved removal policy. `-f` selects only safe, force-eligible candidates; a report needs its displayed number selected after review. The CLI streams each target and its contents for changes in the preceding seven days and refuses activity checks beyond 150,000 entries. This is a conservative activity signal, not proof that no process has an old file open. Eligible directory sizes are measured up to 50,000 entries; incomplete footprints are unknown. Apply re-probes only each selected path, then rechecks identity, scope, marker, and activity before removal. The no-follow deletion helper needs `/usr/bin/python3`; a concurrent final-entry replacement inside the opened parent remains possible. See [context](context.md) for that safety limit.

Manifests, lockfiles, source, `.git`, `.env*`, databases, media, assets, uploads, migrations, `vendor`, and project roots are not cleanup targets. Virtual environments are never default or force targets; `--allow-beta` can review an exact Python `.venv` or pinned tox/Nox session on Linux after owner and same-user process checks. Broad build/release directories and retained reports remain beta catalogue or review-only until their owner and release checks exist. The [registry guide](optimisation-registry.md) describes the gate for publishing additional generated targets.

## Beta expansion

The [optimisation registry](../registry/optimisations.json) also contains beta-catalogue Go, iOS, Android, Unity, and other runtime targets. `.NET obj` intermediates are a published safe project-local rule; `.NET bin` remains beta-catalogue and review-only because it may hold releases. Exact-config TypeScript `.tsbuildinfo` is published safe; CMake builds need an exact `CMakeCache.txt` source/build match and explicit selection. The published Java rule accepts only standalone default Maven POMs and simple built-in Java Gradle builds: inherited Maven configurations, custom output locations, complex/multi-project Gradle scripts, and project property/init files are unsupported. External Gradle init scripts or command-line overrides cannot be proven from static project markers, so Java output requires a seven-day quiet tree, generated marker, release/protected-content scan, and explicit user selection. A beta catalogue rule can be researched without activating cleanup. New removable names, owner adapters, or validation policy need code and disposable safety tests.
