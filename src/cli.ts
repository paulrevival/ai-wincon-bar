import { createRequire } from "node:module";
import { Command } from "commander";
import { runSetup } from "./setup.js";
import { runUninstall } from "./uninstall.js";
import { loadConfig } from "./config.js";

const pkg = createRequire(import.meta.url)("../package.json");

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ai-wincon-bar")
    .description("Context window usage bar for Claude Code status line")
    .version(pkg.version);

  program
    .command("config")
    .description("Interactively configure elements, thresholds, and status line integration")
    .action(() => {
      const config = loadConfig();
      return runSetup(config);
    });

  program
    .command("uninstall")
    .description("Remove config, skill, and uninstall the npm package")
    .action(() => runUninstall());

  program
    .command("help")
    .description("Show available commands and usage examples")
    .action(() => showHelp());

  return program;
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
