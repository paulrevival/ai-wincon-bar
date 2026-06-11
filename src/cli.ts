import { Command } from "commander";
import { runSetup } from "./setup.js";
import { loadConfig } from "./config.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("ai-wincon-bar")
    .description("Context window usage bar for Claude Code status line")
    .version("0.1.0");

  program
    .command("setup")
    .description("Interactive setup: configure elements, thresholds, install to Claude Code")
    .action(() => runSetup());

  program
    .command("config")
    .description("Modify existing settings interactively")
    .action(() => {
      const config = loadConfig();
      return runSetup(config);
    });

  return program;
}
