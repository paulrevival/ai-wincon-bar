import { createRequire } from "node:module";
import { Command } from "commander";
import { runUninstall } from "./uninstall.js";
import { handleInteractive } from "./interactive.js";
import {
  readSessionLog,
  recordsInRange,
  formatSessionsTable,
  localDateKey,
} from "./sessions.js";

const pkg = createRequire(import.meta.url)("../package.json");

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ai-wincon-bar")
    .description("Context window usage bar for Claude Code status line")
    .version(pkg.version);

  program
    .command("config")
    .description("Show current config or run the setup wizard")
    .action(() => handleInteractive());

  program
    .command("sessions")
    .description("Show recorded session times grouped by day")
    .option("--today", "only sessions started today")
    .option("--since <date>", "from date YYYY-MM-DD (inclusive)")
    .option("--until <date>", "to date YYYY-MM-DD (inclusive)")
    .action((opts) => showSessions(opts));

  program
    .command("uninstall")
    .description("Remove config, skill, statusLine entry, and uninstall the npm package")
    .action(() => runUninstall());

  program
    .command("help")
    .description("Show available commands and usage examples")
    .action(() => showHelp());

  return program;
}

interface SessionsOptions {
  today?: boolean;
  since?: string;
  until?: string;
}

function showSessions(opts: SessionsOptions): void {
  const records = Object.values(readSessionLog());
  const range = opts.today
    ? { since: localDateKey(Date.now()), until: localDateKey(Date.now()) }
    : { since: opts.since, until: opts.until };
  console.log(formatSessionsTable(recordsInRange(records, range)));
}

function showHelp(): void {
  console.log(`
🪟 ai-wincon-bar — Context Window Usage Bar for Claude Code

Usage:
  ai-wincon-bar          Run the setup wizard (same as 'config')
  ai-wincon-bar config   Interactively configure elements and thresholds

Commands:
  config                 Setup wizard — choose elements, set thresholds,
                         update settings.json, install skill
  sessions               Show recorded session times grouped by day
                         (--today | --since <date> | --until <date>)
  uninstall              Remove all config files, skill, statusLine entry,
                         and uninstall the npm package
  help                   Show this help message

Status line mode:
  When Claude Code pipes JSON to stdin (non-TTY), the tool renders
  the status bar and outputs it to stdout. This happens automatically.

Examples:
  ai-wincon-bar config       # first-time setup or reconfigure
  ai-wincon-bar uninstall    # remove everything and uninstall

Config:  ~/.claude/ai-wincon-bar/ai-wincon-bar.json
Skill:   ~/.claude/skills/ai-wincon-bar/SKILL.md
`);
}
