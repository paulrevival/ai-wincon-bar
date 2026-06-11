import type { WinconBarConfig } from "./types.js";

export const DEFAULT_CONFIG: WinconBarConfig = {
  elements: {
    modelName: true,
    progressBar: true,
    percent: true,
    tokens: true,
    tariff: true,
  },
  thresholds: {
    yellow: 50,
    red: 80,
  },
};

export const CONFIG_FILENAME = "ai-wincon-bar.json";

export const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

export const BAR_FILLED = "▓";
export const BAR_EMPTY = "░";
export const BAR_WIDTH = 10;

/** Cache TTL in ms — prevents stale data after /compact while covering brief zero bursts */
export const CACHE_TTL_MS = 10_000;

/** Cache entry with timestamp for TTL-based expiration */
export interface CacheEntry {
  data: unknown;
  ts: number;
}
