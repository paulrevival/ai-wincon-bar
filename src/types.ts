/** The JSON object Claude Code sends to statusLine command via stdin */
export interface ClaudeStatusInput {
  context_window: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
  };
  model?: {
    id: string;
    display_name?: string;
  };
  rate_limits?: {
    five_hour?: {
      used_percentage: number;
      resets_at: string;
    };
    seven_day?: {
      used_percentage: number;
      resets_at: string;
    };
  };
  [key: string]: unknown;
}

/** The config file stored at ~/.claude/ai-wincon-bar.json */
export interface WinconBarConfig {
  elements: {
    modelName: boolean;
    progressBar: boolean;
    percent: boolean;
    tokens: boolean;
    tariff: boolean;
  };
  thresholds: {
    yellow: number;
    red: number;
  };
}
