import checkbox from "@inquirer/checkbox";
import confirm from "@inquirer/confirm";
import input from "@inquirer/number";
import type { WinconBarConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./constants.js";
import { saveConfig, updateSettingsStatusLine, loadConfig } from "./config.js";

const ELEMENT_CHOICES = [
  { name: "Progress bar (▓▓▓░░░)", value: "progressBar" },
  { name: "Percentage (45%)", value: "percent" },
  { name: "Tokens (90K/200K)", value: "tokens" },
  { name: "Tariff / Rate limits (5h: 12%)", value: "tariff" },
] as const;

export async function runSetup(
  existingConfig?: WinconBarConfig,
): Promise<void> {
  const config = existingConfig ?? loadConfig();

  console.log("\n🪟 ai-wincon-bar setup\n");

  // 1. Select elements
  const selectedElements = await checkbox({
    message: "Select which elements to display:",
    choices: ELEMENT_CHOICES.map((c) => ({
      name: c.name,
      value: c.value,
      checked: config.elements[c.value as keyof typeof config.elements],
    })),
  });

  // 2. Yellow threshold
  const yellow = await input({
    message: "Yellow threshold (percentage):",
    default: config.thresholds.yellow,
    min: 0,
    max: 100,
  });

  // 3. Red threshold
  const red = await input({
    message: "Red threshold (percentage):",
    default: config.thresholds.red,
    min: 0,
    max: 100,
  });

  // 4. Validate
  if (yellow! >= red!) {
    console.error(
      "\n❌ Yellow threshold must be less than red threshold. Please try again.",
    );
    return runSetup(config);
  }

  // 5. Build and save config
  const newConfig: WinconBarConfig = {
    elements: {
      progressBar: selectedElements.includes("progressBar"),
      percent: selectedElements.includes("percent"),
      tokens: selectedElements.includes("tokens"),
      tariff: selectedElements.includes("tariff"),
    },
    thresholds: { yellow: yellow!, red: red! },
  };

  saveConfig(newConfig);
  console.log(`\n✅ Config saved to ~/.claude/ai-wincon-bar.json`);

  // 6. Update settings.json
  const shouldUpdateSettings = await confirm({
    message: "Update ~/.claude/settings.json to enable the status line?",
    default: true,
  });

  if (shouldUpdateSettings) {
    updateSettingsStatusLine();
    console.log("✅ statusLine updated in ~/.claude/settings.json");
  }

  console.log("\n🎉 Done! Restart Claude Code to see the status bar.\n");
}
