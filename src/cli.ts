import { createRequire } from "node:module";
import { Command } from "commander";
import { runSetup } from "./setup.js";
import { loadConfig, clearCache } from "./config.js";

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
    .command("clear")
    .description("Clear the status data cache")
    .action(() => {
      clearCache();
      console.log("✅ Cache cleared.");
    });

  return program;
}
