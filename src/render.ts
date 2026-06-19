import { basename } from "node:path";
import type { ClaudeStatusInput, WinconBarConfig } from "./types.js";
import { ANSI, TIME_GLYPH } from "./constants.js";
import {
  formatTokens,
  getColorForPercentage,
  renderBar,
  formatDuration,
} from "./format.js";

/**
 * Render the status line output string.
 * Format: /name | [model] | ▓▓▓▓▓░░░░░ 45% | ▼:90K ▲:5K ▣:200K | 5h: 12% | 7d: 13% | ⧗ 00h:42m
 * Each element is toggleable via config. Bar and percent share one space-joined
 * segment. Tariffs hidden when their rate_limits entry is absent; session time
 * hidden when cost.total_duration_ms is absent or zero.
 */
export function renderStatusLine(
  input: ClaudeStatusInput,
  config: WinconBarConfig,
): string {
  const parts: string[] = [];
  const {
    used_percentage,
    total_input_tokens,
    total_output_tokens,
    context_window_size,
  } = input.context_window;
  const color = getColorForPercentage(used_percentage, config.thresholds);

  // Session name — basename of the launch directory, rendered first as `/{name}`.
  // Falls back through project_dir → current_dir; hidden when no name resolves
  // (sources absent or path is root). Uncolored — it's a label, not a metric.
  if (config.elements.sessionName) {
    const dir =
      input.cwd ?? input.workspace?.project_dir ?? input.workspace?.current_dir;
    const name = dir ? basename(dir) : "";
    if (name) {
      parts.push(`/${name}`);
    }
  }

  if (config.elements.modelName && input.model) {
    const name = input.model.display_name ?? input.model.id;
    if (name) {
      parts.push(`[${name}]`);
    }
  }

  // Bar + percent share one segment joined by a single space (no " | " between
  // them); the meter reads as one unit. Either can be toggled independently.
  const meter: string[] = [];
  if (config.elements.progressBar) {
    meter.push(`${color}${renderBar(used_percentage)}${ANSI.reset}`);
  }
  if (config.elements.percent) {
    meter.push(`${color}${Math.round(used_percentage)}%${ANSI.reset}`);
  }
  if (meter.length) {
    parts.push(meter.join(" "));
  }

  if (config.elements.tokens) {
    parts.push(
      `▼:${formatTokens(total_input_tokens)} ▲:${formatTokens(total_output_tokens)} ▣:${formatTokens(context_window_size)}`,
    );
  }

  if (config.elements.tariff && input.rate_limits?.five_hour) {
    const tariffPct = Math.round(input.rate_limits.five_hour.used_percentage);
    const tariffColor = getColorForPercentage(tariffPct, config.thresholds);
    parts.push(`${tariffColor}5h: ${tariffPct}%${ANSI.reset}`);
  }

  if (config.elements.tariffWeekly && input.rate_limits?.seven_day) {
    const weeklyPct = Math.round(input.rate_limits.seven_day.used_percentage);
    const weeklyColor = getColorForPercentage(weeklyPct, config.thresholds);
    parts.push(`${weeklyColor}7d: ${weeklyPct}%${ANSI.reset}`);
  }

  // Session wall-clock time — last element, uncolored reference stat.
  // Hidden when the duration is absent or zero.
  if (config.elements.sessionTime && input.cost?.total_duration_ms) {
    parts.push(`${TIME_GLYPH} ${formatDuration(input.cost.total_duration_ms)}`);
  }

  return parts.join(" | ");
}
