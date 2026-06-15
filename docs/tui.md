# Terminal UI

Created: 2026-06-15 15:33:00 IST  
Last updated: 2026-06-15 16:20:00 IST  
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
- `u` - run optimize storage dry-run preview
- `y` - apply selected safe optimize cleanup after preview
- `/` - type project search in the dashboard project list
- `t` - toggle scanned-only project list
- `o` - cycle dashboard project sort: name, size, cleanable, last scanned
- `x` - clear dashboard project filters
- `r` - runtimes
- `i` - start index intent
- `s` - start selected-project scan intent
- `,` - settings
- `+` / `-` - change numeric setting in config view
- `v` - save config view changes
- `q`, `escape`, `ctrl+c` - quit intent

## CLI/Dashboard Parity

Every dashboard workflow should show the matching command-line path:

- Project list search/filter/sort: `/`, `t`, and `o` in the dashboard; `kundol list --search <query> --scanned --sort <field>` in the CLI.
- Project detail: `enter` in the dashboard; `kundol show <project>` in the CLI.
- Project scan: `s` in the dashboard; `kundol scan <project> --largest` in the CLI.
- Cleanup preview: `c` in the dashboard; `kundol clean <project>` in the CLI.
- Cleanup apply remains an explicit shell command shown by both surfaces: `kundol clean <project> --apply --no-dry-run`.
- Optimize storage: `u` runs dry-run details in the dashboard; `y` applies selected safe cleanup after preview. Review-only items such as `/tmp`, `~/Library/Caches`, and Docker volumes are not applied.
- Runtime check: `r` in the dashboard; `kundol runtimes` or `kundol runtimes --json` in the CLI.
- Config archive threshold: `+`, `-`, and `v` in the dashboard; `kundol config --archive-before-clean-days <days>` in the CLI.

## Machine Status Bar

OpenTUI renders a one-row machine status bar at the bottom of the dashboard.
The bar uses emoji-led segments with clear gaps on wide terminals:

```text
🕒 HH:MM:SS+TZ   🏷️ machine   📁 project-dir   🌿 git   🧠 MEM%   ⚙️ CPU%   🔋 BAT%   🐳 docker
```

The renderer keeps the bar at height 1 and responsively shortens long values for narrower terminals instead of letting segments overlap.
Machine tag is read from `KUNDOL_MACHINE_TAG`, then `KUNDOL_NODE_TAG`, then the OS hostname.
Battery shows `n/a` when unavailable.
Docker shows `down` or `-` when the engine is down and the running container count when the engine is up.

## Testing Notes

Pure helpers should be tested without Ink.
Rendered component tests can be added after the project scaffold installs `ink`, `react`, and a renderer strategy.

## OpenTUI Implementation Note

Source checked: installed `@opentui/core@0.4.1` package metadata/types and npm registry metadata on 2026-06-15.

### Package Choice

Use `@opentui/core` for the first OpenTUI implementation in this repo.

Rationale:

- `@opentui/core@0.4.1` is already present in `package.json` and `bun.lock`.
- The current documented entrypoint is `createCliRenderer` from `@opentui/core`.
- Core exposes imperative renderables such as `TextRenderable` and `BoxRenderable`, which are enough for a minimal dashboard/list shell.
- `@opentui/react` exists on npm with latest version `0.4.1`, but it is not installed here. Add it only if the project intentionally migrates to OpenTUI's React reconciler; do not mix it into the current Ink files opportunistically.

The existing `src/tui` components still import Ink. Future OpenTUI work should either add a separate OpenTUI adapter/shell or deliberately migrate the TUI layer. Do not half-convert individual Ink components to OpenTUI renderables.

### Bun Requirements

OpenTUI core ships a native Zig-backed package with platform optional dependencies, including Darwin, Linux, Linux musl, and Windows builds for common CPU architectures. Keep Bun as the runtime/package manager and keep the package versions aligned.

Current repo baseline:

- Bun engine: `>=1.2.0`
- TypeScript: ESM, strict mode
- Installed OpenTUI package: `@opentui/core@0.4.1`

If `@opentui/react` is added later, pin it to the same OpenTUI release line as core.

### Minimal Core Renderer Shape

Use `createCliRenderer()` only for interactive TTY entrypoints. It sets up terminal input/output, owns process streams, installs process listeners, and puts stdin into raw mode during terminal setup.

```ts
import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core";

export async function runOpenTuiShell(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI === "true") {
    throw new Error("OpenTUI requires an interactive terminal.");
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: "alternate-screen",
    clearOnShutdown: true,
  });

  const root = new BoxRenderable(renderer, {
    id: "kundol-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    padding: 1,
  });

  const title = new TextRenderable(renderer, {
    id: "kundol-title",
    content: "kundol",
  });

  root.add(title);
  renderer.root.add(root);
  renderer.requestRender();

  const onKeyPress = (key: { name: string; ctrl: boolean }) => {
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy();
    }
  };

  renderer.keyInput.on("keypress", onKeyPress);
}
```

Keep actual project data loading outside this renderer function. Pass already-shaped presentation models into the OpenTUI shell, and emit typed intents back out for commands such as index, scan, clean preview, or quit.

### Lifecycle Cleanup

Always destroy the renderer on every exit path.

- Wrap top-level OpenTUI startup in `try/finally` when the caller owns the process.
- Call `renderer.destroy()` on quit, fatal errors, and command cancellation.
- Prefer `exitOnCtrlC: false` so kundol can route `ctrl+c` through the same quit intent as `q` and `escape`.
- Do not leave background scans or cleanup services inside renderables. Renderables should request work through command-level orchestration that can be cancelled or awaited before shutdown.

### Keyboard Handling

Use `renderer.keyInput.on("keypress", handler)` for global shortcuts.

OpenTUI key events include at least:

- `name`
- `ctrl`
- `meta`
- `shift`
- `option`
- `sequence`
- `eventType`

Map keys to the same intent vocabulary already documented for the TUI:

- `d` -> dashboard
- `p` -> projects
- `r` -> runtimes
- `i` -> start index intent
- `s` -> start selected-project scan intent
- `,` -> settings
- `q`, `escape`, `ctrl+c` -> quit intent

Use `event.preventDefault()` only when a handler intentionally consumes an input. Keep destructive actions behind explicit confirmation states and service-level dry-run behavior.

### CI And Non-TTY Caveats

Do not initialize OpenTUI in CI, snapshot tests, pipes, or redirected output.

Guard interactive startup with:

```ts
const canRenderTui = process.stdin.isTTY && process.stdout.isTTY && process.env.CI !== "true";
```

When `canRenderTui` is false:

- Default `kundol` should print a concise non-interactive summary or help text.
- Scriptable commands such as `dashboard`, `list`, `scan`, `clean --dry-run`, and `runtimes` should keep using plain output/JSON paths.
- Tests should prefer pure format/model tests. If renderer tests are needed, use `@opentui/core/testing` and `createTestRenderer` rather than real terminal streams.
