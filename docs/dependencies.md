# Dependencies and System Tools

Created: 2026-06-13 07:30:45 IST
Last updated: 2026-09-15 13:02:49 IST
Related tasks: `KUN-077`, `KUN-083`, `KUN-089`, `KUN-092`, `KUN-098`

`package.json` and `bun.lock` are the dependency sources of truth. Kundol runs on Bun (declared minimum `>=1.2.0`) with TypeScript and Bun SQLite; it is a CLI-only app.

| Scope | Packages | Use |
|---|---|---|
| Runtime | `commander`, `zod` | Command routing and validation of the active optimisation registry. |
| Development | `typescript`, `@types/bun`, `eslint`, `@eslint/js`, `typescript-eslint`, `husky` | Types, linting, and local Git hooks. |

Use `bun install --frozen-lockfile` for a reproducible local install and `bun run check` for the full project check. The check runs tool-version validation, lint, typecheck, registry validation, Bun tests, a build check, and CLI smoke tests. The pre-commit hook runs tool/lint/type/build checks and the version-bump helper; pre-push runs the CLI smoke test. The macOS release workflow builds a standalone Bun executable, combines architectures with `lipo`, and signs it with `codesign`.

The [Docker demo](demo/docker-sandbox.md) installs only production packages with `bun install --frozen-lockfile --production --ignore-scripts`, so Husky's `prepare` hook does not run in the image. Its `docker` command and startup process runner are fixture-only mocks inside the container.

## Optional host tools

`optimise storage` probes published npm, Python/pip, uv, Go, and pnpm owner-cache rules before adding rows. Missing tools or paths outside approved user roots are skipped; selected commands run through exact structured argument lists after live checks. Docker, Bun-cache, and Yarn actions remain proposed and are not in the current public storage apply. On macOS, `optimise startup` uses `osascript` to list classic Login Items and `launchctl` to disable selected safe user LaunchAgents. The Docker demo simulates those startup process calls.

Filesystem access uses Node/Bun APIs; process execution uses `Bun.spawn`; persistence uses `bun:sqlite`; tests use `bun test`. No TUI, web framework, ORM, or separate test runner is currently required.
