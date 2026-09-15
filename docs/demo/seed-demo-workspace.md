# Demo Workspace Seeder

Created: 2026-06-15 00:00:00 IST  
Last updated: 2026-09-15 11:29:12 IST

Use this script to create a fake workspace for manual kundol CLI testing.

## Run

```bash
bun run scripts/seed-demo-workspace.ts /tmp/kundol-demo-workspace
```

Then test kundol commands:

```bash
kundol optimise projects /tmp/kundol-demo-workspace
kundol optimise repos /tmp/kundol-demo-workspace
```

## What It Creates

The script creates Node.js, Python, and Go demo projects.

Each project has:

- Fake source files under 1MB.
- Runtime markers such as `package.json`, `pyproject.toml`, `requirements.txt`, and `go.mod`.
- Fake `.git` metadata.
- Fake generated/deletable artifacts around 1MB+.
- Visible fake Node dependency files under `node_modules`, with small 1KB package payloads plus larger cache blobs.
- Examples of protected/caution files such as `.env`, local databases, reports, or uploads where useful.

Generated artifact examples:

- `node_modules`
- `dist`
- `coverage`
- `.venv`
- `__pycache__`
- `.pytest_cache`
- `bin`
- `coverage.out`

This is test data only.
The generated dependency/build artifacts are fake binary files, not real installed dependencies.

For a disposable container with additional fake Docker and startup fixtures, see [`docker-sandbox.md`](docker-sandbox.md).
