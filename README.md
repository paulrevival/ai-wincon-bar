# 🪟 ai-wincon-bar

**Context window usage bar for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) status line.**

Displays a compact, color-coded view of your context window and rate limit usage — right in the Claude Code terminal status bar.

```
/my-project | [Sonnet 4.6] | ▓▓▓▓▓░░░░░ 45% | ▼:90K ▲:5K ▣:200K | 5h: 12% | 7d: 13% | ⧗ 00h:42m
```

---

## Features

- **Session name** — directory-basename label (`/my-project`) of where Claude was launched
- **Model name** — current model in brackets (`[Sonnet 4.6]`)
- **Progress bar** — visual context window fill (`▓▓▓▓▓░░░░░`)
- **Percentage** — quick glance at usage (`45%`)
- **Token counter** — input, output and window size (`▼:90K ▲:5K ▣:200K`)
- **Rate limit indicators** — 5-hour and weekly usage tiers from API (`5h: 12%`, `7d: 13%`)
- **Session time** — wall-clock duration of the session (`⧗ 00h:42m`)
- **Color thresholds** — green → yellow → red as you approach the limit
- **Interactive config** — toggle elements, set thresholds, auto-update settings
- **Cache fallback** — smooths over brief zero-bursts (e.g. during `/compact`) without flickering; **scoped per project**, so `/clear` never shows stale tokens and two Claude Code projects running side-by-side never clobber each other's cache

## Quick Start

```bash
# Install globally
npm install -g @paulrevival/ai-wincon-bar

# Run interactive setup (picks elements, thresholds, updates settings.json)
ai-wincon-bar config
```

That's it — restart Claude Code and the bar appears in your status line.

## Install from source (no GitHub / npm registry)

If you've cloned the repo (or just want to install a local build globally instead of pulling from npm):

```bash
# from the repository root
npm install          # install dependencies
npm run build        # compile src/ → dist/index.js
npm install -g .     # install the built package globally (ships dist/ + SKILL.md)
```

`ai-wincon-bar` now points at your local build. If you already had it configured, run `ai-wincon-bar config` once afterwards — this also auto-updates the installed `SKILL.md` to match the bundled one. Restart Claude Code.

**To pick up edits without reinstalling** (rebuild → live):

```bash
npm run build && npm link      # or run `npm run dev` (watch) in another terminal
```

> `npm install -g .` uses the already-built `dist/` — it does **not** run `npm run build` for you. Always build first, then install.

## Commands

| Command | Description |
|---|---|
| `ai-wincon-bar` | Show current config + preview, or run setup wizard |
| `ai-wincon-bar config` | Interactive setup wizard |
| `ai-wincon-bar uninstall` | Remove config, skill, statusLine entry, and npm package |
| `ai-wincon-bar help` | Show available commands |

## How It Works

Claude Code supports a [custom status line](https://docs.anthropic.com/en/docs/claude-code/settings#status-line) that receives JSON context via stdin and displays the output string. `ai-wincon-bar` acts as that command:

1. Claude Code pipes context window data to stdin on every turn
2. The tool parses the JSON, applies your config, and renders a formatted bar
3. The output appears in the bottom status bar of your terminal

### Config File

Stored at `~/.claude/ai-wincon-bar/ai-wincon-bar.json`:

```json
{
  "elements": {
    "modelName": true,
    "progressBar": true,
    "percent": true,
    "tokens": true,
    "tariff": true,
    "tariffWeekly": true,
    "sessionName": true,
    "sessionTime": true
  },
  "thresholds": {
    "yellow": 50,
    "red": 80
  }
}
```

### Settings Integration

During `config`, the tool offers to update `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "ai-wincon-bar"
  }
}
```

You can also set this manually if preferred.

## Claude Code Skill

The package bundles a `SKILL.md` that lets you configure the bar directly from a Claude Code chat. `ai-wincon-bar config` offers to install it to `~/.claude/skills/ai-wincon-bar/SKILL.md`.

Once installed, invoke it via the `/ai-wincon-bar` slash command, or just describe what you want — it also triggers on phrases like "context bar", "status line config", or "wincon":

> Enable the token counter and set the red threshold to 75.

Through the skill you can:

- Show the current config with a live preview
- Toggle elements and adjust color thresholds
- Reset to defaults
- Check whether the status line is active in `settings.json`
- Fully uninstall the tool (config, cache, skill, statusLine entry, npm package)

## Configuration Options

### Elements

Toggle which parts of the bar are visible:

| Element | Example | Default |
|---|---|---|
| `sessionName` | `/my-project` | ✅ on (hidden when no cwd) |
| `modelName` | `[Sonnet 4.6]` | ✅ on (hidden when model data unavailable) |
| `progressBar` | `▓▓▓▓▓░░░░░` | ✅ on |
| `percent` | `45%` | ✅ on |
| `tokens` | `▼:90K ▲:5K ▣:200K` | ✅ on |
| `tariff` | `5h: 12%` | ✅ on (hidden when no 5h rate limit data) |
| `tariffWeekly` | `7d: 13%` | ✅ on (hidden when no 7d rate limit data) |
| `sessionTime` | `⧗ 00h:42m` | ✅ on (hidden when no duration data) |

### Thresholds

Control when colors change:

| Threshold | Default | Effect |
|---|---|---|
| `yellow` | `50` | Bar turns yellow at 50% usage |
| `red` | `80` | Bar turns red at 80% usage |

## Custom Config Directory

By default, config and cache live in `~/.claude/ai-wincon-bar/`. Set `AI_WINCON_BAR_DIR` to use a different directory:

```bash
export AI_WINCON_BAR_DIR=/path/to/custom/dir
```

## Development

```bash
git clone https://github.com/paulrevival/ai-wincon-bar.git
cd ai-wincon-bar
npm install
npm run build   # compile to dist/
npm test        # run test suite (vitest)
npm run dev     # watch mode
```

## Requirements

- Node.js ≥ 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

## License

[MIT](./LICENSE)
