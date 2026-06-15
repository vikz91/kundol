# Terminal UI

Created: 2026-06-15 15:33:00 IST  
Related tasks: `KUN-024`, `KUN-032`, `KUN-036`, `KUN-042`

## Summary

kundol's TUI is a compact terminal-first shell over the same services used by CLI commands.
It should render project state, navigation, and confirmations, but it must not perform workspace scans, cleanup, archive, Docker purge, or filesystem deletion directly.

## Current Shell

The first shell lives under `src/tui/`.

- `app.tsx` owns top-level view selection and keyboard intent mapping.
- `types.ts` defines presentation-only view models.
- `theme.ts` centralizes colors, labels, and symbols.
- `keymap.ts` centralizes keyboard shortcuts and footer help labels.
- `components/` contains reusable pure UI building blocks.
- `views/` contains dashboard, project list, project detail, project scan, runtime audit, and settings stubs.
- `format.ts` contains pure formatting helpers that can be tested without Ink.

## Design Rules

- Keep views domain-logic-free.
- Accept already-shaped view models from CLI/core integration code.
- Emit typed user intents such as `start-index` or `start-project-scan`; let services handle the work.
- Avoid color-only meaning. Text labels such as `dirty`, `SAFE`, `CAUTION`, and lifecycle statuses must remain visible.
- Keep tables stable with fixed column widths and ASCII truncation.
- Keep destructive flows preview-first. TUI components may render confirmation UI, but deletion must remain in core safety services.
- Prefer short labels and dense layouts. Terminal users should be able to scan the page quickly.

## Integration Expectations

The CLI default command should:

1. Load config and database state outside React components.
2. Build a `TuiModel`.
3. Render `KundolTuiApp`.
4. Listen for `TuiActionIntent` events.
5. Route intents to core services or command-level orchestration.

The TUI must keep working when dashboard data is partial.
Missing scan/runtime data should render as empty states, not crashes.

## Keyboard Map

- `d` - dashboard
- `p` - projects
- `r` - runtimes
- `i` - start index intent
- `s` - start selected-project scan intent
- `,` - settings
- `q`, `escape`, `ctrl+c` - quit intent

## Testing Notes

Pure helpers should be tested without Ink.
Rendered component tests can be added after the project scaffold installs `ink`, `react`, and a renderer strategy.
