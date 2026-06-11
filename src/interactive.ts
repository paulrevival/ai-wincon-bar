import { loadConfig, isConfigured } from "./config.js";
import { renderStatusLine } from "./render.js";
import { runSetup } from "./setup.js";
import type { ClaudeStatusInput } from "./types.js";

/**
 * Handle `ai-wincon-bar` and `ai-wincon-bar config` when run interactively.
 * - No config → run setup wizard
 * - Config exists → show current settings + preview, offer to reconfigure
 */
export async function handleInteractive(): Promise<void> {
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
      model: { id: "claude-sonnet-4-6", display_name: "Sonnet 4.6" },
    };
    console.log("\nPreview:");
    console.log(renderStatusLine(sampleInput, config));

    const { default: askConfirm } = await import("@inquirer/confirm");
    const shouldReconfigure = await askConfirm({
      message: "Would you like to reconfigure?",
      default: false,
    });

    if (shouldReconfigure) {
      await runSetup(config);
    }
  } else {
    await runSetup();
  }
}
