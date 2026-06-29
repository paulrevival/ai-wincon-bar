# 🪟 ai-wincon-bar

**Context window usage bar for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) status line.**

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
- **Session time report** — `ai-wincon-bar sessions` tabulates wall-clock & API time per day and project
- **Cache fallback** — smooths brief zero-bursts (e.g. `/compact`) without flicker; per-project, so `/clear` and side-by-side projects never show stale tokens

## Quick Start

```bash
# Install globally
npm install -g @paulrevival/ai-wincon-bar

# Run interactive setup (picks elements, thresholds, updates settings.json)
ai-wincon-bar config
```

Restart Claude Code and the bar appears in your status line.

## Install from source

Install a local build globally instead of pulling from npm:

```bash
# from the repository root
npm install          # install dependencies
npm run build        # compile src/ → dist/index.js
npm install -g .     # install the built package globally (ships dist/ + SKILL.md)
```

`ai-wincon-bar` now points at your local build. Run `ai-wincon-bar config` once to refresh settings (it also syncs the installed `SKILL.md`), then restart Claude Code.

**To pick up edits without reinstalling** (rebuild → live):

```bash
npm run build && npm link      # or run `npm run dev` (watch) in another terminal
```

## Commands

| Command | Description |
|---|---|
| `ai-wincon-bar` | Show current config + preview, or run setup wizard |
| `ai-wincon-bar config` | Interactive setup wizard |
| `ai-wincon-bar sessions` | Show recorded session times grouped by day (`--today`, `--since`, `--until`) |
| `ai-wincon-bar uninstall` | Remove config, skill, statusLine entry, and npm package |
| `ai-wincon-bar help` | Show available commands |

### Session time report

While the status line renders, the tool records each session's elapsed time to
`~/.claude/ai-wincon-bar/sessions.json` (keyed by `session_id`). `ai-wincon-bar
sessions` reads that log and prints a per-day table, broken down by project, with
a **wall-clock** column (total session duration, including idle) and an
**api** column (active time spent waiting on the model):

```
┌───────────────┬─────────┬─────────┬──────────┐
│ Day / Project │ wall    │ api     │ sessions │
├───────────────┴─────────┴─────────┴──────────┤
│ 2026-06-19                                    │
├───────────────┬─────────┬─────────┬──────────┤
│ my-project    │ 02h:15m │ 00h:48m │ 3        │
├───────────────┼─────────┼─────────┼──────────┤
│ other         │ 00h:40m │ 00h:12m │ 1        │
├───────────────┼─────────┼─────────┼──────────┤
│ Day total     │ 02h:55m │ 01h:00m │ 4        │
└───────────────┴─────────┴─────────┴──────────┘
```

```bash
ai-wincon-bar sessions                    # all recorded days
ai-wincon-bar sessions --today            # only today
ai-wincon-bar sessions --since 2026-06-01 # from a date (inclusive)
ai-wincon-bar sessions --until 2026-06-15 # to a date (inclusive)
```

Recording keys off `cost.total_duration_ms`, so it's most accurate with idle
refresh enabled (see [`refreshInterval`](#idle-refresh-refreshinterval)). Records
older than a week are pruned automatically.

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
    "command": "ai-wincon-bar",
    "refreshInterval": 60
  }
}
```

### Idle refresh (`refreshInterval`)

By default Claude Code only re-renders the status line on activity (a new message, `/compact`, etc.), so the **session time** segment freezes while you're idle. The wizard offers to add `refreshInterval` (seconds) to the `statusLine` block, which re-runs the command on a fixed timer — once a minute by default — keeping the clock current even when idle.

This is a **local** re-render (Claude Code pipes the already-known session state to the command): it consumes **no API tokens and no money**, only a negligible process spawn each tick. Omit `refreshInterval` (or decline the wizard prompt) to keep the bar event-driven only.

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
| `yellow` | `50` | Bar, percent and tariffs turn yellow at 50% |
| `red` | `80` | Bar, percent and tariffs turn red at 80% |

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
