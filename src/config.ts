import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { WinconBarConfig } from "./types.js";
import type { ClaudeStatusInput } from "./types.js";
import { DEFAULT_CONFIG, CONFIG_FILENAME, CACHE_TTL_MS } from "./constants.js";
import type { CacheEntry, CacheMap } from "./constants.js";

/** Base directory for all ai-wincon-bar data (config, cache). */
function getDataDir(): string {
  return process.env.AI_WINCON_BAR_DIR ?? join(homedir(), ".claude", "ai-wincon-bar");
}

/** Ensure the data directory exists. */
function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getConfigPath(): string {
  return join(getDataDir(), CONFIG_FILENAME);
}

export function getCachePath(): string {
  return join(getDataDir(), "cache.json");
}

export function getSettingsPath(): string {
  return process.env.AI_WINCON_BAR_SETTINGS_PATH ?? join(homedir(), ".claude", "settings.json");
}

/** Идентификатор проекта — ключ в per-project кэше. */
export function getProjectId(input: ClaudeStatusInput): string {
  return input.workspace?.project_dir ?? input.cwd ?? "__default__";
}

/**
 * Read cached status data if it exists and is not expired.
 * Returns null if no cache or cache is stale.
 *
 * If `currentSessionId` is provided, a cache entry from a different session
 * (e.g. left over after /clear started a new session) is treated as stale and
 * ignored — the cached context no longer applies to this session.
 */
export function readCache(currentSessionId?: string): ClaudeStatusInput | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
    const data = entry.data as ClaudeStatusInput;
    if (data.context_window?.used_percentage > 0) {
      if (currentSessionId && data.session_id && data.session_id !== currentSessionId) {
        return null;
      }
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Write current status data to cache with timestamp.
 */
export function writeCache(data: ClaudeStatusInput): void {
  try {
    ensureDataDir();
    const entry: CacheEntry = { data, ts: Date.now() };
    writeFileSync(getCachePath(), JSON.stringify(entry), "utf-8");
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Remove the cache file.
 */
export function clearCache(): void {
  try {
    const cachePath = getCachePath();
    if (existsSync(cachePath)) unlinkSync(cachePath);
  } catch {
    // Non-critical
  }
}

/**
 * Decide which status data to render for a given Claude Code status update.
 *
 * Real data (used_percentage > 0) is cached and rendered directly. A zero
 * burst (used_percentage === 0) falls back to a fresh cache entry so brief
 * gaps don't blank the bar — but only when the cache belongs to the SAME
 * session. After /clear the session changes, so a stale cache from the
 * previous session is ignored and the fresh (zero) input is rendered instead.
 */
export function pickRenderData(input: ClaudeStatusInput): ClaudeStatusInput {
  if (input.context_window.used_percentage > 0) {
    writeCache(input);
    return input;
  }
  const cached = readCache(input.session_id);
  return cached ?? input;
}

/**
 * Load config from ~/.claude/ai-wincon-bar/config.json, merging with defaults.
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
 * Save config to ~/.claude/ai-wincon-bar/config.json.
 */
export function saveConfig(config: WinconBarConfig): void {
  ensureDataDir();
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
