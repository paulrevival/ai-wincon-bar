import type { ClaudeStatusInput, WinconBarConfig } from "./types.js";
import { ANSI } from "./constants.js";
import { formatTokens, getColorForPercentage, renderBar } from "./format.js";

/**
 * Render the status line output string.
 * Format: [model] | ▓▓▓▓▓░░░░░ 45% | 90K/200K | 5h: 12%
 * Each element is toggleable via config. Tariff hidden when rate_limits absent.
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
  const totalTokens = total_input_tokens + total_output_tokens;
  const color = getColorForPercentage(used_percentage, config.thresholds);

  if (config.elements.modelName && input.model) {
    const name = input.model.display_name ?? input.model.id;
    if (name) {
      parts.push(`[${name}]`);
    }
  }

  if (config.elements.progressBar) {
    parts.push(`${color}${renderBar(used_percentage)}${ANSI.reset}`);
  }

  if (config.elements.percent) {
    parts.push(`${color}${Math.round(used_percentage)}%${ANSI.reset}`);
  }

  if (config.elements.tokens) {
    parts.push(
      `${formatTokens(totalTokens)}/${formatTokens(context_window_size)}`,
    );
  }

  if (config.elements.tariff && input.rate_limits?.five_hour) {
    const tariffPct = Math.round(input.rate_limits.five_hour.used_percentage);
    const tariffColor = getColorForPercentage(tariffPct, config.thresholds);
    parts.push(`${tariffColor}5h: ${tariffPct}%${ANSI.reset}`);
  }

  return parts.join(" | ");
}
