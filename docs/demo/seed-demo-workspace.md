# Demo Workspace Seeder

Created: 2026-06-15 00:00:00 IST  
Last updated: 2026-06-15 00:00:00 IST  

Use this script to create a fake workspace for manual kundol CLI testing.

## Run

```bash
bun run scripts/seed-demo-workspace.ts /tmp/kundol-demo-workspace
```

Then test kundol commands:

```bash
kundol init --workspace /tmp/kundol-demo-workspace
kundol index
kundol dashboard
kundol list
kundol scan node-api-orders
kundol clean node-api-orders
```

## What It Creates

The script creates Node.js, Python, and Go demo projects.

Each project has:

- Fake source files under 1MB.
- Runtime markers such as `package.json`, `pyproject.toml`, `requirements.txt`, and `go.mod`.
- Fake `.git` metadata.
- Fake generated/deletable artifacts around 1MB+.
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
