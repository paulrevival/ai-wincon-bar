---
name: ai-wincon-bar
description: Use when user wants to configure, check, or modify the ai-wincon-bar status line tool — change displayed elements (progress bar, percent, tokens, tariff), adjust color thresholds, show current config, reset to defaults, or uninstall. Triggers on "ai-wincon-bar", "wincon", "context bar", "status line config", "/ai-wincon-bar".
---

# ai-wincon-bar

Context window usage bar for Claude Code's status line.

## Paths

| What | Path |
|---|---|
| Config | `~/.claude/ai-wincon-bar/ai-wincon-bar.json` |
| Cache | `~/.claude/ai-wincon-bar/cache.json` |
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
    "sessionName": true
  },
  "thresholds": {
    "yellow": 50,
    "red": 80
  }
}
```

## What each setting does

**Elements** — toggle which parts of the status line appear:
- `modelName` — model name like `[Sonnet 4.6]` (hidden automatically when not available)
- `progressBar` — visual bar `▓▓▓░░░`
- `percent` — number like `45%`
- `tokens` — input, output and window size like `▼:90K ▲:5K ▣:200K`
- `tariff` — rate limit `5h: 12%` (hidden automatically when not available)
- `sessionName` — directory-basename label like `/my-project` (hidden automatically when no cwd)

**Thresholds** — percentage at which colors change:
- `yellow` — default 50 (green → yellow)
- `red` — default 80 (yellow → red)
- Must satisfy: `yellow < red`

## Actions

When the user invokes this skill, determine what they want and perform the action:

### Show current config

1. Read `~/.claude/ai-wincon-bar/ai-wincon-bar.json` (use Read tool)
2. Display current settings in a readable format
3. Show a preview by constructing sample output:
   ```
   /my-project | [Sonnet 4.6] | ▓▓▓▓▓░░░░░ 45% | ▼:90K ▲:5K ▣:200K | 5h: 12%
   ```

### Modify config

Use AskUserQuestion to ask the user what they want to change. Options:

1. **Toggle elements** — ask which elements to enable/disable (multiSelect)
2. **Adjust thresholds** — ask for new yellow and red values (ensure yellow < red)
3. **Reset to defaults** — yellow=50, red=80, all elements enabled

After confirmation, write the updated config to `~/.claude/ai-wincon-bar/ai-wincon-bar.json` using the Write tool.

### Initial setup

If `~/.claude/ai-wincon-bar/ai-wincon-bar.json` doesn't exist, offer to run the full setup:
1. Ask which elements to show (multiSelect, all checked by default)
2. Ask yellow threshold (default 50)
3. Ask red threshold (default 80)
4. Save config to `~/.claude/ai-wincon-bar/ai-wincon-bar.json`
5. Ask if they want to update `~/.claude/settings.json` to add:
   ```json
   "statusLine": {
     "type": "command",
     "command": "ai-wincon-bar"
   }
   ```
6. If yes, read `~/.claude/settings.json`, add/update the `statusLine` field, write back.

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
ai-wincon-bar          Show config or run setup wizard
ai-wincon-bar config   Same as above
ai-wincon-bar help     Show available commands
ai-wincon-bar uninstall  Remove everything and uninstall
```
