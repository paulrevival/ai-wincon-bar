---
name: ai-wincon-bar
description: Configure, inspect, or remove ai-wincon-bar for Claude Code and Codex status lines. Use for context bar, status line, token/rate-limit display, session reports, thresholds, or wincon requests.
---

# ai-wincon-bar

Configure context-window status lines for Claude Code and Codex through the
installed CLI. Claude Code uses the package renderer; Codex uses its native TUI
status line.

## Paths

| What | Path |
|---|---|
| Shared config | `~/.config/ai-wincon-bar/ai-wincon-bar.json` |
| Claude settings | `~/.claude/settings.json` |
| Codex settings | `~/.codex/config.toml` (`[tui].status_line`) |
| Claude sessions | `~/.config/ai-wincon-bar/sessions.json` |

`AI_WINCON_BAR_DIR` overrides the shared data directory. `CODEX_HOME` overrides
the Codex home. Existing data under `~/.claude/ai-wincon-bar` is copied to the
shared directory on first use and retained as a rollback copy.

## Actions

Prefer the CLI over editing JSON, JSONL, or TOML directly:

- Configure or show the current setup: `ai-wincon-bar config`
- Claude-only session report: `ai-wincon-bar sessions`
- Today: `ai-wincon-bar sessions --today`
- Date range: `ai-wincon-bar sessions --since YYYY-MM-DD --until YYYY-MM-DD`
- Uninstall: `ai-wincon-bar uninstall` (confirm with the user first)
- Help: `ai-wincon-bar help`

The setup wizard detects both platforms and exposes common switches once.
Platform-specific choices are labeled in the wizard. Progress bar, session
clock, thresholds, retention, and session reports are Claude-only. Reasoning
effort, Git branch, fast mode, permission profile, cumulative session tokens,
and theme colors are Codex-only.

Codex requires CLI 0.129.0 or newer. Its renderer controls exact labels,
separators, and colors, so report the configured native fields rather than
inventing an exact preview.

## Safety

The configurator preserves unknown Codex status-line items. Uninstall restores
the pre-install Codex status line only when it still matches the last value
written by ai-wincon-bar. Claude `statusLine` is removed only when its command
still points to `ai-wincon-bar`.
