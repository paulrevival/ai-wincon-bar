import { describe, it, expect } from "vitest";
import { renderStatusLine } from "../src/render.js";
import type { ClaudeStatusInput, WinconBarConfig } from "../src/types.js";
import { DEFAULT_CONFIG } from "../src/constants.js";
import { ANSI } from "../src/constants.js";

/** Strip all ANSI escape codes from a string for assertion convenience */
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
  };
}

describe("renderStatusLine", () => {
  it("renders all elements with default config", () => {
    const output = renderStatusLine(makeInput(), DEFAULT_CONFIG);
    expect(strip(output)).toBe("▓░░░░░░░░░ | 9% | 90K/1M");
  });

  it("renders tariff when five_hour rate limit is present", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        five_hour: { used_percentage: 12, resets_at: "2026-01-01T00:00:00Z" },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toBe("▓░░░░░░░░░ | 9% | 90K/1M | 5h: 12%");
  });

  it("hides tariff when rate_limits absent", () => {
    const output = renderStatusLine(makeInput(), DEFAULT_CONFIG);
    expect(strip(output)).not.toContain("5h");
  });

  it("hides tariff when rate_limits exists but five_hour is missing", () => {
    const input: ClaudeStatusInput = {
      ...makeInput(),
      rate_limits: {
        seven_day: { used_percentage: 30, resets_at: "2026-01-01T00:00:00Z" },
      },
    };
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).not.toContain("5h");
  });

  it("uses green color below yellow threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 9 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.green);
    expect(output).not.toContain(ANSI.yellow);
    expect(output).not.toContain(ANSI.red);
  });

  it("uses yellow color at yellow threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 50 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.yellow);
  });

  it("uses red color at red threshold", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 80 }), DEFAULT_CONFIG);
    expect(output).toContain(ANSI.red);
  });

  it("respects disabled elements", () => {
    const config: WinconBarConfig = {
      elements: { progressBar: false, percent: false, tokens: true, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("90K/1M");
  });

  it("renders only percent when others disabled", () => {
    const config: WinconBarConfig = {
      elements: { progressBar: false, percent: true, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(strip(output)).toBe("9%");
  });

  it("renders empty string when all elements disabled", () => {
    const config: WinconBarConfig = {
      elements: { progressBar: false, percent: false, tokens: false, tariff: false },
      thresholds: { yellow: 50, red: 80 },
    };
    const output = renderStatusLine(makeInput(), config);
    expect(output).toBe("");
  });

  it("formats large token counts correctly", () => {
    const input = makeInput({
      total_input_tokens: 1_500_000,
      context_window_size: 2_000_000,
      used_percentage: 75,
    });
    const output = renderStatusLine(input, DEFAULT_CONFIG);
    expect(strip(output)).toContain("1.5M/2M");
  });

  it("rounds percentage to nearest integer", () => {
    const output = renderStatusLine(makeInput({ used_percentage: 9.6 }), DEFAULT_CONFIG);
    expect(strip(output)).toContain("10%");
  });

  it("uses tariff color based on tariff percentage, not context percentage", () => {
    const config = DEFAULT_CONFIG; // yellow=50, red=80
    const input: ClaudeStatusInput = {
      ...makeInput({ used_percentage: 10 }), // green context
      rate_limits: {
        five_hour: { used_percentage: 85, resets_at: "..." }, // red tariff
      },
    };
    const output = renderStatusLine(input, config);
    // Should have both green (for context) and red (for tariff)
    expect(output).toContain(ANSI.green);
    expect(output).toContain(ANSI.red);
  });
});
