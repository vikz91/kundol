# Project Runtime Context

Created: 2026-06-13 07:25:45 IST
Last updated: 2026-09-15 14:07:32 IST
Related tasks: `KUN-010`, `KUN-025`, `KUN-083`, `KUN-092`, `KUN-098`

`kundol optimise projects <workdir>` and `kundol optimise repos <workdir>` share the registry-backed scanner; `repos` does **not** require Git metadata. The scanner searches to fixed depth 7 for direct child marker patterns in published workdir rules, then probes generated entries directly under each detected root. The older hardcoded project optimizer and shared safety policy have been retired. There is no public runtime-audit command.

## Published project rules

| Family | Direct child marker | Current registry candidate |
|---|---|---|
| SwiftPM | `Package.swift` | Generated `.build` directory, safe suggestion after live checks. |
| JavaScript | `package.json` | `node_modules` directory, safe suggestion after live checks. |
| Python | `pyproject.toml`, `requirements.txt`, or `setup.py` | Bytecode/test/lint caches are safe suggestions; `htmlcov` is explicit review. |
| Rust | `Cargo.toml` | Cargo `target` directory, safe suggestion after live checks. |
| Visual Studio | `*.sln` | `.vs` state is protected inventory, with no removal action. |

A published rule must have a literal generated name, matching marker, exact file/directory kind, minimum review tier, required live validators, and a code-approved removal policy. `-f` selects only safe, force-eligible candidates; a report needs its displayed number selected after review. The published CLI binding scans each target and its contents for changes in the preceding seven days. This is a conservative activity signal, not proof that no process has an old file open. Apply re-probes path identity and scope before deletion.

Manifests, lockfiles, source, `.git`, `.env*`, databases, media, assets, uploads, migrations, `vendor`, virtual environments, and project roots are not cleanup targets. Broad build/release directories and retained reports remain proposed or review-only until their owner and release checks exist. The [registry guide](optimisation-registry.md) describes the gate for publishing additional generated targets.

## Proposed expansion

The [optimisation registry](../registry/optimisations.json) also contains proposed Java, .NET, Go, iOS, Android, Unity, and other runtime targets. A proposed rule can be researched without activating cleanup. A published rule with already approved selectors and handlers can be added through JSON review; new removable names, owner adapters, or validation policy need code and disposable safety tests. Ambiguous `bin` output has a minimum review tier because it can hold releases or retained artifacts.
