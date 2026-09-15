# Contributing to kundol

kundol is a Bun + TypeScript CLI. Start with the [current code map](context.md) and [agent guide](agents.md); older dashboard and indexing docs describe removed public commands.

```bash
bun install --frozen-lockfile
bun run dev -- --help
bun run check
```

Keep CLI behavior, tests, and docs in step. For cleanup changes, show the scanned plan before any apply path, recheck live targets, and test against temporary homes and workdirs. Never run destructive smoke tests on your real home, Docker state, or projects. JSON-only catalogue additions follow the [optimisation registry guide](optimisation-registry.md).

Open an issue for a behavior change or safety question. In a pull request, describe the trigger, resulting behavior, affected paths, and verification command. The [PR template](../.github/pull_request_template.md) provides a short outline.

During an interactive `git commit`, the version hook asks for a major, minor, or patch bump and stages it in that same commit. Use `KUNDOL_VERSION_BUMP=skip` when a version change is intentionally inappropriate; non-interactive commits skip the prompt.
