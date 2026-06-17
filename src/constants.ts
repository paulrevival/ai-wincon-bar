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

/**
 * How long a cached context reading can still back up a zero-payload.
 *
 * Claude Code emits zero-payloads (used_percentage == 0) continuously between
 * context updates; real readings (used_percentage > 0) arrive only while the
 * agent is actively working. The "thinking pause" between two real readings is
 * measured in minutes, so a short TTL blanks the bar to zero on every request.
 *
 * This is therefore a generous stale-safety-net (bounds how long an abandoned
 * or post-/compact reading can linger), NOT brief-burst coverage. Cross-session
 * invalidation after /clear is handled separately via session_id.
 */
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Cache entry with timestamp for TTL-based expiration */
export interface CacheEntry {
  data: unknown;
  ts: number;
  session_id?: string;
}

/** Per-project cache map: { [projectId]: CacheEntry } */
export type CacheMap = Record<string, CacheEntry>;
