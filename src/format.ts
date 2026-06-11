import { ANSI, BAR_FILLED, BAR_EMPTY, BAR_WIDTH } from "./constants.js";

/**
 * Format token count as human-readable string.
 * 90000 → "90K", 1500000 → "1.5M", 500 → "500"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = (n / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${m}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  return String(n);
}

/**
 * Return ANSI color code based on percentage and thresholds.
 */
export function getColorForPercentage(
  pct: number,
  thresholds: { yellow: number; red: number },
): string {
  if (pct >= thresholds.red) return ANSI.red;
  if (pct >= thresholds.yellow) return ANSI.yellow;
  return ANSI.green;
}

/**
 * Render a progress bar string like "▓▓▓▓▓░░░░░".
 */
export function renderBar(
  pct: number,
  width: number = BAR_WIDTH,
): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(empty);
}
