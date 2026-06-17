import { describe, it, expect } from "vitest";
import { renderStatusLine } from "../src/render.js";
import type { ClaudeStatusInput, WinconBarConfig } from "../src/types.js";
import { DEFAULT_CONFIG, ANSI } from "../src/constants.js";

/** Strip all ANSI escape codes for plain-text assertions */
function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function makeInput(overrides: Partial<ClaudeStatusInput["context_window"]> = {}): ClaudeStatusInput {
  return {
    context_window: {
      total_input_tokens: 90_000,
      total_output_tokens: 5_000,
      context_window_size: 1_000_000,
      used_percentage: 9,
      remaining_percentage: 91,
      ...overrides,
    },
    model: { id: "glm-5.1", display_name: "glm-5.1" },
  };
}

describe("renderStatusLine", () => {
  // ─── Full render ─────────────────────────────────

  it("renders all elements with default config", () => {
    const output = renderStatusLine(makeInput(), DEFAULT_CONFIG);
    // input 90K, output 5K
    expect(strip(output)).toBe("[glm-5.1] | ▓░░░░░░░░░ | 9% | ▼:90K ▲:5K ▣:1M");
  });

  // ─── Model name ──────────────────────────────────

  it("renders model name from display_name", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      model: { id: "claude-opus-4-8", display_name: "Opus 4.8" },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("[Opus 4.8]");
  });

  it("falls back to model id when display_name is absent", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      model: { id: "claude-sonnet-4-6" },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("[claude-sonnet-4-6]");
  });

  it("hides model name when element disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: true, percent: true, tokens: true, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("▓░░░░░░░░░ | 9% | ▼:90K ▲:5K ▣:1M");
  });

  it("hides model name when model field is missing", () => {
    const input: ClaudeStatusInput = {
      context_window: makeInput().context_window,
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toBe("▓░░░░░░░░░ | 9% | ▼:90K ▲:5K ▣:1M");
  });

  it("hides model name when display_name and id are empty", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      model: { id: "", display_name: "" },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).not.toContain("[]");
    expect(strip(output)).toBe("▓░░░░░░░░░ | 9% | ▼:90K ▲:5K ▣:1M");
  });

  it("renders only model name when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: true, progressBar: false, percent: false, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("[glm-5.1]");
  });

  // ─── Edge percentages ────────────────────────────

  it("renders at 0% used", () => {
    const output = renderStatusLine(
      makeInput({ used_percentage: 0, total_input_tokens: 0, total_output_tokens: 0, remaining_percentage: 100 }),
      DEFAULT_CONFIG,
    );
    expect(strip(output)).toBe("[glm-5.1] | ░░░░░░░░░░ | 0% | ▼:0 ▲:0 ▣:1M");
  });

  it("renders at 100% used", () => {
    const output = renderStatusLine(
      makeInput({ used_percentage: 100, total_input_tokens: 999_000, total_output_tokens: 1_000, remaining_percentage: 0 }),
      DEFAULT_CONFIG,
    );
    expect(strip(output)).toBe("[glm-5.1] | ▓▓▓▓▓▓▓▓▓▓ | 100% | ▼:999K ▲:1K ▣:1M");
  });

  it("rounds percentage to nearest integer", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 9.6 }), DEFAULT_CONFIG);
    expect(strip(output)).toContain("10%");
  });

  // ─── Tariff / rate_limits ────────────────────────

  it("renders tariff when five_hour is present", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        five_hour: { used_percentage: 12, resets_at: "2026-01-01T00:00:00Z" },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    // input 90K, output 5K
    expect(strip(output)).toBe("[glm-5.1] | ▓░░░░░░░░░ | 9% | ▼:90K ▲:5K ▣:1M | 5h: 12%");
  });

  it("hides tariff when rate_limits absent", () => {
    const output = renderStatusLine(makeInput(), DEFAULT_CONFIG);
    expect(strip(output)).not.toContain("5h");
  });

  it("hides tariff when five_hour is missing but seven_day exists", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        seven_day: { used_percentage: 30, resets_at: "2026-01-01T00:00:00Z" },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).not.toContain("5h");
  });

  it("renders tariff with 0% when five_hour.used_percentage is 0", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        five_hour: { used_percentage: 0, resets_at: "..." },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("5h: 0%");
  });

  it("rounds tariff percentage", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        five_hour: { used_percentage: 12.7, resets_at: "..." },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("5h: 13%");
  });

  // ─── Colors ──────────────────────────────────────

  it("uses green below yellow threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 9 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.green);
    expect(output).not.toContain(ANSI.yellow);
    expect(output).not.toContain(ANSI.red);
  });

  it("uses yellow at yellow threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 50 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.yellow);
  });

  it("uses red at red threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 80 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.red);
  });

  it("uses tariff color based on tariff percentage, not context percentage", () => {
    const input: ClaudeStatusInput = {
      ...makeInput({ used_percentage: 10 }), // green context
      rate_limits: {
        five_hour: { used_percentage: 85, resets_at: "..." }, // red tariff
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(output).toContain(ANSI.green);
    expect(output).toContain(ANSI.red);
  });

  it("uses yellow for tariff at yellow threshold", () => {
    const input: ClaudeStatusInput = {
      ...makeInput({ used_percentage: 10 }),
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: "..." }, // yellow tariff
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(output).toContain(ANSI.green);  // context
    expect(output).toContain(ANSI.yellow); // tariff
  });

  it("tokens section has no ANSI color codes", () => {
    const output = renderStatusLine(makeInput(), DEFAULT_CONFIG);
    // Extract just the tokens part — [model] | bar | percent | tokens
    const plain = strip(output);
    const tokensPart = plain.split(" | ")[3]; // "▼:90K ▲:5K ▣:1M"
    // Find the corresponding section in the colored output
    const tokensStart = output.indexOf(tokensPart);
    const tokensSection = output.substring(tokensStart, tokensStart + tokensPart.length);
    expect(tokensSection).toBe(tokensPart); // no ANSI codes
  });

  // ─── Element toggling ────────────────────────────

  it("renders only tokens when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: false, percent: false, tokens: true, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    // input 90K, output 5K
    expect(strip(output)).toBe("▼:90K ▲:5K ▣:1M");
  });

  it("renders only percent when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: false, percent: true, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("9%");
  });

  it("renders only progressBar when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: true, percent: false, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("▓░░░░░░░░░");
  });

  it("renders only tariff when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: false, percent: false, tokens: false, tariff: true },
      thresholds: { yellow: 50, red: 80 },
    };
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: { five_hour: { used_percentage: 12, resets_at: "..." } },
    };
    const output = renderStatusLine(input, config);
    expect(strip(output)).toBe("5h: 12%");
  });

  it("renders empty string when all elements disabled", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: false, percent: false, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(output).toBe("");
  });

  // ─── Large values ────────────────────────────────

  it("formats large token counts correctly", () => {
    const input = makeInput({
      total_input_tokens: 1_500_000,
      total_output_tokens: 0,
      context_window_size: 2_000_000,
      used_percentage: 75,
    });
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("▼:1.5M ▲:0 ▣:2M");
  });
});
