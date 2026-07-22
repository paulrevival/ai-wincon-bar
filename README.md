# 🪟 ai-wincon-bar

**Context-window status lines for Claude Code and Codex.**

Claude Code uses the package's colored renderer:

```text
/my-project | [Sonnet 4.6] | ▓▓▓▓▓░░░░░ 45% | ▼:90K ▲:5K ▣:200K | 5h: 12% | 7d: 13% | ⧗ 00h:42m
```

Codex uses its native TUI status line. The setup wizard maps the same common
switches to native Codex fields and preserves fields it does not recognize.

## Features

- One setup wizard and shared config for Claude Code and Codex
- Project/session name, model, context percentage, token counters, and limits
- Claude-only progress bar, threshold colors, session clock, and session report
- Codex-only reasoning effort, Git branch, fast mode, permission profile,
  cumulative token counters, and theme colors
- Safe migration from the legacy Claude-scoped data directory
- Safe Codex uninstall that restores the previous status line unless it was
  manually changed after setup
- Installable chat skill for both platforms

## Quick start

```bash
npm install -g @paulrevival/ai-wincon-bar
ai-wincon-bar config
```

The wizard detects installed platforms, lets you choose the targets, and labels
platform-specific settings. Restart the selected tools afterward. In Codex you
can also run `/statusline` to inspect the native result.

Codex CLI 0.129.0 or newer is required for Codex integration.

## Install from source

```bash
npm install
npm run build
npm install -g .
ai-wincon-bar config
```

For live local development:

```bash
npm run build && npm link
```

## Commands

| Command | Description |
|---|---|
| `ai-wincon-bar` | Show the current config and previews, or start setup |
| `ai-wincon-bar config` | Run the interactive setup wizard |
| `ai-wincon-bar sessions` | Claude-only session report (`--today`, `--since`, `--until`) |
| `ai-wincon-bar uninstall` | Restore integrations, remove data/skills, uninstall package |
| `ai-wincon-bar help` | Show command help |

## Platform integration

### Claude Code

Claude Code invokes `ai-wincon-bar` as a status-line command and sends session
JSON through stdin. Setup writes this block to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "ai-wincon-bar",
    "refreshInterval": 60
  }
}
```

The optional refresh interval keeps the session clock moving while idle. It is
a local render and consumes no API tokens.

### Codex

Codex owns the rendering. Setup updates only these keys in the global `[tui]`
section of `~/.codex/config.toml`:

```toml
[tui]
status_line = ["current-dir", "model-with-reasoning", "git-branch", "context-used", "used-tokens", "context-window-size", "five-hour-limit", "weekly-limit"]
status_line_use_colors = true
```

Comments, other TOML settings, and unknown/future status-line fields are
preserved. Codex profiles are not modified. Exact labels, separators, and
colors are controlled by Codex itself.

## Settings

| Setting | Claude Code | Codex |
|---|---:|---:|
| Session name | ✅ | ✅ |
| Model name | ✅ | ✅ |
| Context percentage | ✅ | ✅ |
| Token counters | input/output/window | used/window |
| 5-hour and weekly limits | ✅ | ✅ |
| Progress bar | ✅ | — |
| Session time | ✅ | — |
| Yellow/red thresholds | ✅ | — |
| Session retention/report | ✅ | — |
| Reasoning effort | — | ✅ |
| Git branch | — | ✅ |
| Fast mode | — | ✅ |
| Permission profile | — | optional |
| Cumulative input/output | — | optional |
| Theme colors | — | ✅ |

Common settings use one switch for all selected platforms. Unsupported fields
are skipped for that platform.

## Shared config and migration

The shared config, cache, and Claude session history live in:

```text
~/.config/ai-wincon-bar/
```

`XDG_CONFIG_HOME` is respected. `AI_WINCON_BAR_DIR` overrides the complete data
directory.

On first use, an existing `~/.claude/ai-wincon-bar` config, cache, and sessions
file are copied into the shared directory. The originals are retained so an
older package version can still be used after rollback. No migration occurs
when `AI_WINCON_BAR_DIR` is set.

## Claude session report

Claude's status-line payload includes wall-clock and API duration counters. The
renderer records their per-session deltas, and the report groups them by local
day and project:

```bash
ai-wincon-bar sessions
ai-wincon-bar sessions --today
ai-wincon-bar sessions --since 2026-06-01 --until 2026-06-15
```

Codex does not invoke this package while rendering its native line, so Codex
sessions are intentionally excluded. The tool does not depend on Codex's
internal JSONL format.

## Chat skill

Setup can install the bundled skill into either or both locations:

```text
~/.claude/skills/ai-wincon-bar/SKILL.md
~/.codex/skills/ai-wincon-bar/SKILL.md
```

The skill delegates configuration to the CLI so JSON and TOML safety rules stay
consistent.

## Uninstall behavior

The installer records the pre-existing Codex status-line values. During
uninstall it restores them only when the current values still match the last
values written by ai-wincon-bar. Later manual edits are left untouched.

Claude's `statusLine` is removed only if its command still points to
`ai-wincon-bar`.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

Requirements: Node.js 18+, Claude Code and/or Codex CLI 0.129.0+.

## License

[MIT](./LICENSE)
