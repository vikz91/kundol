# Local Demo Workspace Seeder

Created: 2026-06-15 00:00:00 IST  
Last updated: 2026-09-15 12:03:35 IST
Related tasks: `KUN-089`, `KUN-092`

For first-time testing without host project or system cleanup, use the [disposable Docker sandbox](docker-sandbox.md). This script instead writes **fake project files on the host** under a folder you choose. Use a dedicated temp path and review the plan before applying:

```bash
bun run scripts/seed-demo-workspace.ts /tmp/kundol-demo-workspace
bun run dev -- optimise projects /tmp/kundol-demo-workspace
bun run dev -- optimise repos /tmp/kundol-demo-workspace
```

The seeder creates six fake Node.js, Python, and Go projects with manifests, small source files, fake `.git` metadata, and generated dependency/build data. Node examples include `node_modules`; Python examples include caches and `.venv`; Go examples include `bin` and `coverage.out`. It also places protected or review-only examples such as `.env`, databases, reports, and uploads. `.venv` is **not** an automatic cleanup candidate. The files are fixtures, not installed dependencies or real application data.

The Docker seed script reuses this workspace generator and adds fake Docker, startup, cache, and temp fixtures under `/sandbox` inside the container.
