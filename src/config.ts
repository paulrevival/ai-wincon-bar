import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { WinconBarConfig } from "./types.js";
import type { ClaudeStatusInput } from "./types.js";
import { DEFAULT_CONFIG, CONFIG_FILENAME, CACHE_TTL_MS } from "./constants.js";
import type { CacheMap } from "./constants.js";

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

export function getSessionsPath(): string {
  return join(getDataDir(), "sessions.json");
}

export function getSettingsPath(): string {
  return process.env.AI_WINCON_BAR_SETTINGS_PATH ?? join(homedir(), ".claude", "settings.json");
}

/** Идентификатор проекта — ключ в per-project кэше. */
export function getProjectId(input: ClaudeStatusInput): string {
  return input.workspace?.project_dir ?? input.cwd ?? "__default__";
}

/** Прочитать cache.json как CacheMap. Legacy-формат { data, ts } → пустой map. */
function readCacheMap(): CacheMap {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      parsed.data &&
      typeof parsed.data === "object" &&
      "context_window" in parsed.data
    ) {
      return {}; // legacy single-entry format
    }
    return parsed as CacheMap;
  } catch {
    return {};
  }
}

/** Удалить из map записи старше CACHE_TTL_MS (на месте). */
function evictExpired(map: CacheMap): CacheMap {
  const now = Date.now();
  for (const key of Object.keys(map)) {
    if (now - map[key].ts > CACHE_TTL_MS) {
      delete map[key];
    }
  }
  return map;
}

/**
 * Read cached status data for a project/session if it exists and is fresh.
 * Read-only — не перезаписывает файл (вызывается на каждом рендере).
 *
 * TTL: запись старше CACHE_TTL_MS игнорируется.
 * Session: если currentSessionId и сохранённый session_id не совпадают — игнорируется
 * (сброс после /clear; теперь per-project).
 * Legacy-формат { data, ts } трактуется как отсутствие кэша.
 */
export function readCache(
  currentSessionId?: string,
  projectId?: string,
): ClaudeStatusInput | null {
  const map = readCacheMap();
  const key = projectId ?? "__default__";
  const entry = map[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  const data = entry.data as ClaudeStatusInput;
  if (!data.context_window || data.context_window.used_percentage <= 0) return null;
  if (currentSessionId && entry.session_id && entry.session_id !== currentSessionId) {
    return null;
  }
  return data;
}

/**
 * Write current status data to the per-project cache map with timestamp + session_id.
 * Evicts expired entries before writing. Failure is non-critical (silent).
 */
export function writeCache(input: ClaudeStatusInput): void {
  try {
    ensureDataDir();
    const map = evictExpired(readCacheMap());
    map[getProjectId(input)] = { data: input, ts: Date.now(), session_id: input.session_id };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
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
 * Real data (used_percentage > 0) is cached (per project) and rendered directly.
 * A zero burst falls back to a fresh same-project, same-session cache entry so
 * brief gaps (e.g. during /compact) don't blank the bar. After /clear the session
 * changes, so a stale entry from the previous session is ignored. Different
 * projects keep independent cache slots.
 */
export function pickRenderData(input: ClaudeStatusInput): ClaudeStatusInput {
  if (input.context_window.used_percentage > 0) {
    writeCache(input);
    return input;
  }
  const cached = readCache(input.session_id, getProjectId(input));
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
 *
 * `refreshIntervalSec` (seconds, Claude Code minimum 1) re-runs the command on a
 * fixed timer in addition to event-driven updates — needed so time-based segments
 * (session clock) keep advancing while the session is idle. Omit it to leave the
 * bar event-driven only; the statusLine object is fully rewritten each call, so
 * passing nothing also drops any previously-set refreshInterval.
 */
export function updateSettingsStatusLine(refreshIntervalSec?: number): void {
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
    ...(refreshIntervalSec ? { refreshInterval: refreshIntervalSec } : {}),
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

/**
 * Check if the tool has been set up (config file exists).
 */
export function isConfigured(): boolean {
  return existsSync(getConfigPath());
}
