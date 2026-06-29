/** The JSON object Claude Code sends to statusLine command via stdin */
export interface ClaudeStatusInput {
  session_id?: string;
  /** Path to the session's transcript JSONL — used to detect a recent /compact. */
  transcript_path?: string;
  cwd?: string;
  workspace?: {
    project_dir?: string;
    current_dir?: string;
    [key: string]: unknown;
  };
  context_window: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
    current_usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  model?: {
    id: string;
    display_name?: string;
  };
  /** Session cost/activity counters. */
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  exceeds_200k_tokens?: boolean;
  rate_limits?: {
    five_hour?: {
      used_percentage: number;
      /** Unix epoch seconds (number) or ISO-8601 string, depending on CC version. */
      resets_at: string | number;
    };
    seven_day?: {
      used_percentage: number;
      /** Unix epoch seconds (number) or ISO-8601 string, depending on CC version. */
      resets_at: string | number;
    };
  };
  [key: string]: unknown;
}

/** The config file stored at ~/.claude/ai-wincon-bar/ai-wincon-bar.json */
export interface WinconBarConfig {
  elements: {
    modelName: boolean;
    progressBar: boolean;
    percent: boolean;
    tokens: boolean;
    tariff: boolean;
    /** Weekly (7-day) rate-limit percentage, rendered after the 5h tariff. */
    tariffWeekly: boolean;
    /** Directory-basename session label, rendered first as `/{name}`. */
    sessionName: boolean;
    /** Session wall-clock duration as `⧗ 00h:42m`, rendered last. */
    sessionTime: boolean;
  };
  thresholds: {
    yellow: number;
    red: number;
  };
}
