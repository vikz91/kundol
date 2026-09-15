# Project Runtime Context

Created: 2026-06-13 07:25:45 IST
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-010`, `KUN-025`, `KUN-083`, `KUN-092`

`kundol optimise projects <workdir>` and `kundol optimise repos <workdir>` use the same active scanner. `repos` does **not** require Git metadata. The scanner searches to a fixed depth of 7, detects projects from direct child markers, and considers generated entries directly under each detected project root. A Bun marker also adds Node.js. There is no public runtime-audit command or registry-driven project cleanup. See [current implementation context](context.md), [the active scanner](../src/services/project-optimizer/project-optimizer.ts), and [shared safety policy](../src/core/safety/policy.ts).

## Active markers and examples

| Family | Direct child marker examples | Generated entries that may be selected |
|---|---|---|
| Node.js | `package.json`, npm/pnpm/Yarn locks, `.nvmrc` | `node_modules`, `dist`, `build`, `.next`, `.nuxt`, coverage and cache folders, `.eslintcache`, `tsconfig.tsbuildinfo` |
| Bun | `bun.lock`, `bun.lockb`, `.bun-version` | Node.js generated entries; `package.json` alone detects Node.js, not Bun. |
| Deno | `deno.json`, `deno.jsonc`, `deps.ts`, `import_map.json` | Project-local `dist`, `build`, coverage and cache folders. |
| Python | `pyproject.toml`, requirements/Poetry/Pipfile/uv files, `setup.py`, `tox.ini` | `__pycache__`, pytest/mypy/ruff caches, `htmlcov`, `dist`, `build`, `*.egg-info`. |
| Go | `go.mod`, `go.sum`, `go.work` | `bin`, `coverage.out`, `*.test`; `bin` may hold deliverables, so inspect the plan. |
| Rust | `Cargo.toml`, `Cargo.lock`, rust-toolchain files | `target`, coverage and profiling output. |
| Java | Maven/Gradle build files and wrappers | `target`, `build`, `.gradle`, coverage. |
| .NET | `*.csproj`, `*.sln`, `global.json`, build props, package lock | `bin`, `obj`, `TestResults`, `.vs`, coverage. |

A name must match the active generated-entry allowlist **and** classify as `safe` with `canAutoClean` under the shared policy. Some safety-policy names are not in the active scanner's allowlist; for example, `.nox`, `.tox`, `Temp`, `Library`, and `Logs` are not selected by these commands. The allowlist also treats `build` and `target` as safe across detected runtimes, so inspect any ambiguous output before confirming.

Manifests, lockfiles, source, `.git`, `.env*`, databases, media, assets, uploads, migrations, user report/release directories, `vendor`, and virtual environments are not auto-cleaned by the active project commands. A specifically named generated report such as `tarpaulin-report.html` **is** selected. `.venv` and `venv` are caution items, not safe candidates. The supplied workdir and detected project roots are never deleted. Apply checks a candidate's current presence, type, symlink status, generated name, and safety class before removal. It does not fully defend against an ancestor becoming a symlink between plan and deletion; see [the known gap](context.md).

## Proposed expansion

The [optimisation registry](../registry/optimisations.json) contains additional scoped runtime rules and revalidation requirements, including SwiftPM and Android research targets. Those entries are proposed definitions, not active CLI behavior. It rates Go `bin`, .NET `TestResults`, and Rust Tarpaulin reports more cautiously than the current allowlist; the CLI still treats these as selected safe candidates. iOS, Android, and Unity projects are not detected by the current project optimiser. Add a runtime to the active marker and candidate logic, safety policy, tests, and this page together.
