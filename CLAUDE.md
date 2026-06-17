# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@paulrevival/ai-wincon-bar` is a Node.js CLI that acts as a [custom status line](https://docs.anthropic.com/en/docs/claude-code/settings#status-line) command for Claude Code. Claude Code pipes a JSON context object to stdin on every turn; the tool renders a color-coded context-window / rate-limit bar to stdout.

Published as an ESM package, bundled by tsup into a single `dist/index.js` with a `#!/usr/bin/env node` shebang. Bundled `SKILL.md` is shipped with the package and installed to `~/.claude/skills/` during setup.

## Commands

```bash
npm run build    # tsup → dist/index.js (the published bin entry)
npm test         # vitest run (all tests)
npm run dev      # tsup --watch
npm run lint     # tsc --noEmit (type-check only — there is no ESLint)
```

Run a single test file or by name:

```bash
npx vitest run tests/format.test.ts
npx vitest run -t "renders all elements with default config"
```

`npm run lint` is **type-checking, not linting** — keep `src` within `tsconfig.json`'s `include`.

## Architecture: one binary, three modes

`src/index.ts` dispatches based on invocation context. This is the core design — get it right before touching flow:

1. **Status line mode** — no CLI args **and** stdin is not a TTY. Claude Code is piping JSON. Read stdin, parse, render, write to stdout. Any error in this path must call `process.exit(0)` silently (see `handleStatusLineRender`) — throwing or printing an error corrupts the user's status bar.
2. **Interactive mode** — no CLI args **and** stdin IS a TTY. User ran `ai-wincon-bar` (or `config`) directly. Shows current config + preview, offers reconfigure. Uses `@inquirer/*` prompts.
3. **Subcommand mode** — any args (`config`, `uninstall`, `help`). Handled by `commander` in `cli.ts`.

### Render pipeline (status line mode)

```
stdin JSON → pickRenderData() → loadConfig() → renderStatusLine() → stdout
```

- `pickRenderData` (in `config.ts`) — the caching gate. **Read its doc comment before changing it.** Real data (`used_percentage > 0`) is cached and returned directly. A zero burst (e.g. during `/compact`) falls back to the **same-session** cache; a cache from a *different* `session_id` (left over after `/clear` starts a new session) is treated as stale and ignored. TTL is `CACHE_TTL_MS` (10s).
- `renderStatusLine` (in `render.ts`) — assembles toggleable parts joined by `" | "`. Each element is gated by `config.elements.*`; `modelName` hides when model data is absent, `tariff` hides when `rate_limits.five_hour` is absent. Tokens section is intentionally uncolored; only bar/percent/tariff get ANSI.
- `format.ts` — pure helpers (`formatTokens`, `getColorForPercentage`, `renderBar`). These are exhaustively unit-tested; keep them side-effect-free.

### Side-effect modules (mutate the user's `~/.claude`)

`config.ts`, `setup.ts`, `uninstall.ts` all resolve paths via helpers in `config.ts`:
- `getConfigPath()` / `getCachePath()` → `<AI_WINCON_BAR_DIR>/ai-wincon-bar.json` and `cache.json` (default `~/.claude/ai-wincon-bar/`)
- `getSettingsPath()` → `AI_WINCON_BAR_SETTINGS_PATH` or `~/.claude/settings.json`

**Always use these helpers, never hardcode `~/.claude/...`.** Tests rely on the env overrides for isolation (`tests/config.test.ts` sets both to a temp dir per process). Malformed config/settings files are caught and merged with defaults — do not introduce throws on bad JSON.

`setup.ts:installSkill()` copies the `SKILL.md` found as a sibling of the compiled output (`dist/../SKILL.md`); when running from source it no-ops because that file isn't there.

## ESM conventions

`package.json` is `"type": "module"`. **All intra-project imports use `.js` extensions** (e.g. `import { loadConfig } from "./config.js"`) even though the sources are `.ts`. This is required by the ESM/bundler resolution and must be kept when adding new modules. The codebase is strict-mode TypeScript (`"strict": true`).
