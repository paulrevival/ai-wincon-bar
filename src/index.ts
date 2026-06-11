import { readFileSync } from "node:fs";
import { createProgram } from "./cli.js";
import { loadConfig, readCache, writeCache } from "./config.js";
import { renderStatusLine } from "./render.js";
import { handleInteractive } from "./interactive.js";
import type { ClaudeStatusInput } from "./types.js";

async function main(): Promise<void> {
  const program = createProgram();

  // Subcommands: ai-wincon-bar config | uninstall | help
  if (process.argv.length > 2) {
    program.parse();
    return;
  }

  // No arguments — determine mode by stdin
  if (!process.stdin.isTTY) {
    // Claude Code pipes JSON to stdin → render status line
    handleStatusLineRender();
  } else {
    // User ran `ai-wincon-bar` with no args → show config / setup wizard
    await handleInteractive();
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

main().catch(() => process.exit(1));
