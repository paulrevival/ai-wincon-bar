import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { WinconBarConfig } from "./types.js";
import { DEFAULT_CONFIG, CONFIG_FILENAME } from "./constants.js";

function getClaudeDir(): string {
  return join(homedir(), ".claude");
}

export function getConfigPath(): string {
  return join(getClaudeDir(), CONFIG_FILENAME);
}

export function getSettingsPath(): string {
  return join(getClaudeDir(), "settings.json");
}

/**
 * Load config from ~/.claude/ai-wincon-bar.json, merging with defaults.
 * Returns DEFAULT_CONFIG if file doesn't exist or is malformed.
 */
export function loadConfig(): WinconBarConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<WinconBarConfig>;
    return {
      elements: {
        ...DEFAULT_CONFIG.elements,
        ...parsed.elements,
      },
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...parsed.thresholds,
      },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to ~/.claude/ai-wincon-bar.json.
 */
export function saveConfig(config: WinconBarConfig): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Update the statusLine field in ~/.claude/settings.json to point to ai-wincon-bar.
 */
export function updateSettingsStatusLine(): void {
  const settingsPath = getSettingsPath();
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  settings.statusLine = {
    type: "command",
    command: "ai-wincon-bar",
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/**
 * Check if the tool has been set up (config file exists).
 */
export function isConfigured(): boolean {
  return existsSync(getConfigPath());
}
