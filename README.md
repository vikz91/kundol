# kundol

kundol is a Bun + TypeScript CLI/TUI for indexing developer workspaces, identifying projects across runtimes, and safely analyzing generated files that can be cleaned.

The implementation is just starting. Current scaffold:

- Bun runtime and package scripts
- TypeScript strict mode
- Commander-based CLI entrypoint
- MVP command skeletons from `docs/commands.md`
- Demo workspace seeder in `scripts/seed-demo-workspace.ts`

## Development

```bash
bun install
bun run dev --help
bun run typecheck
bun test
```

The CLI surface is intentionally stubbed until the database, discovery, analysis, and TUI services land.
