# Project Runtimes Knowledge Base

Created: 2026-06-13 07:25:45 IST  
Last updated: 2026-06-13 08:34:13 IST  
Related tasks: `KUN-010`, `KUN-012`, `KUN-025`, `KUN-026`, `KUN-027`, `KUN-028`, `KUN-030`, `KUN-031`, `KUN-033`, `KUN-036`, `KUN-F006`

## Purpose

This document is the source of truth for current and future project runtimes, project markers, generated files, cleanup candidates, caution files, protected files, and workflow notes.

Agents must update this file whenever kundol learns a new ecosystem rule.
Use this KB to drive project type inference, cleanup analysis, recommendations, runtime audit, docs, and tests.

## Current Project Runtime Families

- JavaScript and TypeScript: Node.js, Bun, Deno
- Java
- .NET
- Python
- Rust
- Go

## Future Roadmap Runtime Families

- iOS
- Android
- Unity3D remains an extended candidate from earlier planning, but it is not part of the currently aligned core runtime scope.

## Classification Principles

- A project may have multiple runtime families.
- Store all detected runtimes when possible, but choose one primary display type for tables.
- Prefer explicit markers over folder names.
- Lockfiles and manifest files are stronger signals than generated directories.
- Never classify a directory as a project only because it has generated output like `dist` or `target`.

## Cleanup Safety Principles

- Generated dependency directories are usually safe cleanup candidates.
- Build outputs and caches are usually safe cleanup candidates.
- Source files, migrations, assets, uploads, local databases, and environment files are protected.
- Runtime-specific metadata may be safe only if it is reproducible and not user-authored.
- When unsure, classify as `caution`, not `safe`.

## Runtime Matrix

| Runtime family | Project markers | Safe cleanup candidates | Caution candidates | Protected examples |
|---|---|---|---|---|
| Node.js | `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `.nvmrc`, `.node-version` | `node_modules`, `dist`, `build`, `.next`, `.nuxt`, `coverage`, `.cache`, `.turbo`, `.parcel-cache`, `.vite`, `.eslintcache`, `tsconfig.tsbuildinfo` | `.npmrc`, generated reports, local SQLite files | `.env`, `.env.*`, `src`, `public`, `assets`, `migrations`, `.git` |
| Bun | `bun.lock`, `bun.lockb`, `package.json` with Bun scripts, `.bun-version` | `node_modules`, `.bun`, `dist`, `build`, `coverage`, `.cache`, `.turbo`, `.vite` | `bunfig.toml`, `.npmrc` | source files, env files, assets, migrations |
| Deno | `deno.json`, `deno.jsonc`, `deps.ts`, `import_map.json` | `coverage`, `dist`, `.cache`, generated reports | local Deno cache if inside project, custom import maps | source files, env files, assets |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`, `gradlew`, `mvnw` | `target`, `build`, `.gradle`, `out`, `coverage`, `surefire-reports` | `.mvn`, Gradle wrapper files, local databases | `src`, `pom.xml`, Gradle build files, migrations, resources |
| .NET | `*.csproj`, `*.sln`, `global.json`, `Directory.Build.props`, `packages.lock.json` | `bin`, `obj`, `TestResults`, `coverage`, `.vs` | `*.user`, local databases, publish output | source files, `.sln`, `.csproj`, migrations, appsettings secrets |
| Python | `pyproject.toml`, `requirements.txt`, `poetry.lock`, `Pipfile`, `Pipfile.lock`, `uv.lock`, `setup.py`, `setup.cfg`, `tox.ini` | `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, `.nox`, `.tox`, `htmlcov`, `dist`, `build`, `*.egg-info` | `.venv`, `venv`, generated notebooks, local `.sqlite`/`.db` files | `.env`, source packages, migrations, data directories |
| Rust | `Cargo.toml`, `Cargo.lock`, `rust-toolchain`, `rust-toolchain.toml` | `target`, `coverage`, `tarpaulin-report.html`, `.profraw`, `.profdata` | `Cargo.lock` for libraries, generated benchmark outputs | `src`, `migrations`, assets, env files |
| Go | `go.mod`, `go.sum`, `go.work` | `bin`, `coverage.out`, `*.test`, generated coverage directories | vendored dependencies in `vendor`, local binaries that may be deliverables | source files, `migrations`, assets, config |
| Unity3D | `ProjectSettings/ProjectVersion.txt`, `Assets`, `Packages/manifest.json` | `Library`, `Temp`, `Obj`, `Build`, `Builds`, `Logs`, `UserSettings`, `.vs` | `Packages/packages-lock.json`, generated addressable bundles, large media files | `Assets`, `ProjectSettings`, `Packages/manifest.json`, source scripts |

## JavaScript And TypeScript Workflows

### Node.js

Detect:

- Manifest: `package.json`
- Lockfiles: `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`
- Version hints: `.nvmrc`, `.node-version`

Runtime audit:

- `node --version`
- `npm --version`
- `pnpm --version`
- `yarn --version`
- NVM presence when available

Cleanup workflow:

- Recommend deleting `node_modules` for inactive projects.
- Recommend deleting framework build outputs like `.next`, `.nuxt`, `dist`, and `build`.
- Treat `.npmrc` as caution because it may contain registry/auth configuration.
- Do not delete package manifests or lockfiles.

### Bun

Detect:

- `bun.lock`
- `bun.lockb`
- `package.json`
- `.bun-version`

Runtime audit:

- `bun --version`

Cleanup workflow:

- Recommend deleting `node_modules` and local build/cache folders.
- Do not delete Bun lockfiles by default.
- Treat `bunfig.toml` as project configuration and do not clean it automatically.

### Deno

Detect:

- `deno.json`
- `deno.jsonc`
- `deps.ts`
- `import_map.json`

Runtime audit:

- `deno --version`

Cleanup workflow:

- Recommend deleting project-local coverage and generated output.
- Be conservative around import maps and dependency files.
- Global Deno cache should not be part of project cleanup unless a future machine-cleaning mode explicitly supports it.

## Python Workflow

Detect:

- `pyproject.toml`
- `requirements.txt`
- `poetry.lock`
- `Pipfile`
- `Pipfile.lock`
- `uv.lock`
- `setup.py`
- `setup.cfg`
- `tox.ini`

Runtime audit:

- `python --version`
- `python3 --version`
- `pip --version`
- `poetry --version`
- `uv --version`

Cleanup workflow:

- Recommend deleting Python caches: `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`.
- Recommend deleting build artifacts: `dist`, `build`, `*.egg-info`.
- Treat `.venv` and `venv` as safe only with clear messaging because recreating environments may take time.
- Treat notebooks, generated reports, and local databases as caution.

## Go Workflow

Detect:

- `go.mod`
- `go.sum`
- `go.work`

Runtime audit:

- `go version`

Cleanup workflow:

- Recommend deleting coverage output such as `coverage.out`.
- Treat `bin` carefully because it may contain deliverable binaries.
- Do not delete `vendor` automatically.
- Do not mutate Go module files.

## Rust Workflow

Detect:

- `Cargo.toml`
- `Cargo.lock`
- `rust-toolchain`
- `rust-toolchain.toml`

Runtime audit:

- `rustc --version`
- `cargo --version`
- `rustup --version`

Cleanup workflow:

- Recommend deleting `target` for inactive projects because it is usually reproducible and large.
- Recommend deleting coverage/profiling outputs like `.profraw`, `.profdata`, and Tarpaulin reports.
- Do not delete manifests, source, or migrations.
- Treat `Cargo.lock` carefully: it is usually protected for binaries/apps.

## Unity3D Workflow

Detect:

- `ProjectSettings/ProjectVersion.txt`
- `Assets/`
- `Packages/manifest.json`

Runtime audit:

- Unity version from `ProjectSettings/ProjectVersion.txt`.
- Unity Hub and editor detection can be future work.

Cleanup workflow:

- Recommend deleting `Library`, `Temp`, `Obj`, `Logs`, and local build output folders when archiving.
- Never delete `Assets`, `ProjectSettings`, or `Packages/manifest.json`.
- Treat `Build` and `Builds` as safe candidates only if clearly generated and not release artifacts.
- Large media files under `Assets` are protected and should only appear as review recommendations.

## .NET Workflow

Detect:

- `*.csproj`
- `*.sln`
- `global.json`
- `Directory.Build.props`
- `packages.lock.json`

Runtime audit:

- `dotnet --version`
- `dotnet --list-sdks`
- `dotnet --list-runtimes`

Cleanup workflow:

- Recommend deleting `bin`, `obj`, `TestResults`, and coverage output.
- Treat `.vs` as safe cleanup for local IDE metadata.
- Treat `*.user` and local database files as caution.
- Do not delete project files, solution files, migrations, or app configuration automatically.

## Java Workflow

Detect:

- `pom.xml`
- `build.gradle`
- `build.gradle.kts`
- `settings.gradle`
- `settings.gradle.kts`
- `gradlew`
- `mvnw`

Runtime audit:

- `java -version`
- `javac -version`
- `mvn --version`
- `gradle --version`

Cleanup workflow:

- Recommend deleting Maven `target` and Gradle `build` output.
- Recommend deleting project-local `.gradle` caches.
- Treat `.mvn`, `mvnw`, `mvnw.cmd`, `gradlew`, and `gradlew.bat` as protected project tooling.
- Do not delete `src`, resources, build definitions, migrations, or env files.

## Knowledge Maintenance Workflow

When an agent adds support for a runtime:

1. Update this file with markers, cleanup candidates, caution candidates, protected files, runtime audit commands, and tests needed.
2. Update `docs/README.md` if a new runtime-specific doc is created.
3. Update `agents.md` only if the document index changes.
4. Update `plan.md` task notes or add tasks if implementation work is needed.
5. Add chronological context to `learnings.md`.

When implementation disagrees with this document, update the document or implementation in the same task.
Do not let runtime rules drift.
