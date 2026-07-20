---
name: ai-wincon-bar
description: Use when user wants to configure, check, or modify the ai-wincon-bar status line tool — change displayed elements (progress bar, percent, tokens, 5h/weekly tariff, session time), adjust color thresholds, toggle idle refresh, report session times per day, show current config, reset to defaults, or uninstall. Triggers on "ai-wincon-bar", "wincon", "context bar", "status line config", "/ai-wincon-bar".
---

# ai-wincon-bar

Context window usage bar for Claude Code's status line.

## Paths

| What | Path |
|---|---|
| Config | `~/.claude/ai-wincon-bar/ai-wincon-bar.json` |
| Cache | `~/.claude/ai-wincon-bar/cache.json` |
| Sessions log | `~/.claude/ai-wincon-bar/sessions.json` |
| Skill | `~/.claude/skills/ai-wincon-bar/SKILL.md` |
| Settings | `~/.claude/settings.json` (field: `statusLine`) |

## Config file

`~/.claude/ai-wincon-bar/ai-wincon-bar.json`:

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
  },
  "sessionRetentionDays": 14
}
```

## What each setting does

**Elements** — toggle which parts of the status line appear:
- `sessionName` — directory-basename label like `/my-project` (hidden automatically when no cwd)
- `modelName` — model name like `[Sonnet 4.6]` (hidden automatically when not available)
- `progressBar` — visual bar `▓▓▓░░░`
- `percent` — number like `45%`
- `tokens` — input, output and window size like `▼:90K ▲:5K ▣:200K`
- `tariff` — 5-hour rate limit `5h: 12%` (hidden automatically when not available)
- `tariffWeekly` — weekly rate limit `7d: 13%` (hidden automatically when not available)
- `sessionTime` — session wall-clock duration like `⧗ 00h:42m` (hidden automatically when no duration)

**Thresholds** — percentage at which colors change:
- `yellow` — default 50 (green → yellow)
- `red` — default 80 (yellow → red)
- Must satisfy: `yellow < red`

**Session retention** — `sessionRetentionDays` (default 14) is how many days a
`sessions.json` record survives before being pruned on the next write. Set higher
to keep more history in `ai-wincon-bar sessions`; a non-positive or invalid value
falls back to the default.

**Idle refresh** (`settings.json`, not the config file) — the optional `refreshInterval`
field inside `statusLine` (seconds, min 1) re-runs the command on a timer in addition
to event-driven updates. Without it the bar (and the `sessionTime` clock) freezes while
the session is idle and only updates on the next turn. It's a local re-render — no API or
token cost. The setup wizard offers 60 (once a minute, matching the hh:mm display).

## Actions

When the user invokes this skill, determine what they want and perform the action:

### Show current config

1. Read `~/.claude/ai-wincon-bar/ai-wincon-bar.json` (use Read tool)
2. Display current settings in a readable format
3. Show a preview by constructing sample output:
   ```
   /my-project | [Sonnet 4.6] | ▓▓▓▓▓░░░░░ 45% | ▼:90K ▲:5K ▣:200K | 5h: 12% | 7d: 13% | ⧗ 00h:42m
   ```

### Modify config

Use AskUserQuestion to ask the user what they want to change. Options:

1. **Toggle elements** — ask which elements to enable/disable (multiSelect)
2. **Adjust thresholds** — ask for new yellow and red values (ensure yellow < red)
3. **Session retention** — set `sessionRetentionDays` (whole days, ≥1)
4. **Reset to defaults** — yellow=50, red=80, retention=14, all elements enabled

After confirmation, write the updated config to `~/.claude/ai-wincon-bar/ai-wincon-bar.json` using the Write tool.

### Initial setup

If `~/.claude/ai-wincon-bar/ai-wincon-bar.json` doesn't exist, offer to run the full setup:
1. Ask which elements to show (multiSelect, all checked by default)
2. Ask yellow threshold (default 50)
3. Ask red threshold (default 80)
4. Ask session retention in days (default 14)
5. Save config to `~/.claude/ai-wincon-bar/ai-wincon-bar.json`
5. Ask if they want to update `~/.claude/settings.json` to add:
   ```json
   "statusLine": {
     "type": "command",
     "command": "ai-wincon-bar",
     "refreshInterval": 60
   }
   ```
6. If yes, read `~/.claude/settings.json`, add/update the `statusLine` field, write back.
   Ask whether to include `refreshInterval` (default 60 seconds) so the session clock
   keeps ticking while idle; omit the field if they decline.

### Show session times

If the user asks about session times, time spent, or a per-day report, read
`~/.claude/ai-wincon-bar/sessions.json` (a map keyed by `session_id`; each record
has `project`, `started_at`, `last_seen`, `duration_ms` wall-clock, and
`api_duration_ms` active time — all in ms). Group by the local day of
`started_at`, break each day down by project, and show a per-day total. Render two
duration columns: **wall** (`duration_ms`) and **api** (`api_duration_ms`),
formatted as `hh:mm`. Filter to the requested range (e.g. today) when asked.

Alternatively, run `ai-wincon-bar sessions [--today | --since YYYY-MM-DD | --until
YYYY-MM-DD]` via Bash and show its output verbatim.

### Show status line in settings

If the user asks about whether the status line is active, check `~/.claude/settings.json` for the `statusLine` field and report its current state.

### Uninstall

If the user asks to uninstall or remove ai-wincon-bar:

1. Confirm with the user using AskUserQuestion
2. Remove `~/.claude/ai-wincon-bar/` directory (config + cache)
3. Remove `~/.claude/skills/ai-wincon-bar/` directory (skill)
4. Read `~/.claude/settings.json`, remove the `statusLine` field if it points to `ai-wincon-bar`, write back
5. Run `npm uninstall -g @paulrevival/ai-wincon-bar` via Bash tool

### Help

If the user asks for help or available commands, show:

```
ai-wincon-bar           Show config or run setup wizard
ai-wincon-bar config    Same as above
ai-wincon-bar sessions  Session times per day (--today|--since|--until)
ai-wincon-bar help      Show available commands
ai-wincon-bar uninstall Remove everything and uninstall
```
