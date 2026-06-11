import { readFileSync } from "node:fs";
import { createProgram } from "./cli.js";
import { loadConfig, isConfigured, readCache, writeCache } from "./config.js";
import { renderStatusLine } from "./render.js";
import type { ClaudeStatusInput } from "./types.js";

async function main(): Promise<void> {
  const program = createProgram();

  // Subcommands: ai-wincon-bar config | ai-wincon-bar clear
  if (process.argv.length > 2) {
    program.parse();
    return;
  }

  // No arguments — determine mode by stdin
  if (!process.stdin.isTTY) {
    // Claude Code pipes JSON to stdin → render status line
    handleStatusLineRender();
  } else {
    // User ran `ai-wincon-bar` with no args
    await handleInteractiveDefault();
  }
}

function handleStatusLineRender(): void {
  try {
    const input = readFileSync(process.stdin.fd, "utf-8");
    const data: ClaudeStatusInput = JSON.parse(input);

    let dataToRender = data;

    if (data.context_window.used_percentage > 0) {
      // Real data — cache it
      writeCache(data);
    } else {
      // Zero burst — use cached data if available and fresh
      const cached = readCache();
      if (cached) dataToRender = cached;
    }

    const config = loadConfig();
    const output = renderStatusLine(dataToRender, config);
    process.stdout.write(output);
  } catch {
    // Silent failure — don't break Claude Code's status line
    process.exit(0);
  }
}

async function handleInteractiveDefault(): Promise<void> {
  console.log("\n🪟 ai-wincon-bar — Context Window Usage Bar\n");

  if (isConfigured()) {
    const config = loadConfig();
    console.log("Current settings:");
    console.log(JSON.stringify(config, null, 2));

    // Show preview with sample data
    const sampleInput: ClaudeStatusInput = {
      context_window: {
        total_input_tokens: 90_000,
        total_output_tokens: 5_000,
        context_window_size: 200_000,
        used_percentage: 45,
        remaining_percentage: 55,
      },
    };
    console.log("\nPreview:");
    console.log(renderStatusLine(sampleInput, config));

    const { default: askConfirm } = await import("@inquirer/confirm");
    const shouldReconfigure = await askConfirm({
      message: "Would you like to reconfigure?",
      default: false,
    });

    if (shouldReconfigure) {
      const { runSetup } = await import("./setup.js");
      await runSetup(config);
    }
  } else {
    console.log("No configuration found. Let's set things up!\n");
    const { runSetup } = await import("./setup.js");
    await runSetup();
  }
}

main().catch(() => process.exit(1));
