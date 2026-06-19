import { describe, it, expect } from "vitest";
import { formatTokens, getColorForPercentage, renderBar, formatDuration } from "../src/format.js";
import { ANSI } from "../src/constants.js";

describe("formatTokens", () => {
  it("returns number as-is for values < 1000", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands as XK (rounded)", () => {
    expect(formatTokens(1_000)).toBe("1K");
    expect(formatTokens(90_000)).toBe("90K");
    expect(formatTokens(999_999)).toBe("1000K");
  });

  it("rounds fractional thousands", () => {
    expect(formatTokens(1_500)).toBe("2K");    // 1.5 → rounds to 2
    expect(formatTokens(1_400)).toBe("1K");    // 1.4 → rounds to 1
  });

  it("formats millions as XM or X.XM", () => {
    expect(formatTokens(1_000_000)).toBe("1M");     // .0 stripped
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_300_000)).toBe("2.3M");
    expect(formatTokens(10_000_000)).toBe("10M");   // .0 stripped
  });

  it("does not format negative values as K/M (not expected in practice)", () => {
    expect(formatTokens(-1000)).toBe("-1000");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as 00:mm", () => {
    expect(formatDuration(42 * 60_000)).toBe("00:42");
    expect(formatDuration(5 * 60_000)).toBe("00:05");
  });

  it("formats zero as 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("floors trailing seconds", () => {
    // 42 min 44.5 s → 00:42
    expect(formatDuration(2_564_546)).toBe("00:42");
    // 59 s → 00:00
    expect(formatDuration(59_000)).toBe("00:00");
  });

  it("formats exactly one hour as 01:00", () => {
    expect(formatDuration(60 * 60_000)).toBe("01:00");
  });

  it("zero-pads hours and minutes to two digits", () => {
    expect(formatDuration((2 * 60 + 5) * 60_000)).toBe("02:05");
  });

  it("does not roll over into days past 24h", () => {
    expect(formatDuration((26 * 60 + 5) * 60_000)).toBe("26:05");
  });

  it("does not cap hours at two digits", () => {
    expect(formatDuration((100 * 60 + 42) * 60_000)).toBe("100:42");
  });
});

describe("getColorForPercentage", () => {
  const thresholds = { yellow: 50, red: 80 };

  it("returns green below yellow threshold", () => {
    expect(getColorForPercentage(0, thresholds)).toBe(ANSI.green);
    expect(getColorForPercentage(49, thresholds)).toBe(ANSI.green);
  });

  it("returns yellow at and above yellow threshold", () => {
    expect(getColorForPercentage(50, thresholds)).toBe(ANSI.yellow);
    expect(getColorForPercentage(79, thresholds)).toBe(ANSI.yellow);
  });

  it("returns red at and above red threshold", () => {
    expect(getColorForPercentage(80, thresholds)).toBe(ANSI.red);
    expect(getColorForPercentage(100, thresholds)).toBe(ANSI.red);
  });

  it("works with custom thresholds", () => {
    const tight = { yellow: 10, red: 20 };
    expect(getColorForPercentage(5, tight)).toBe(ANSI.green);
    expect(getColorForPercentage(10, tight)).toBe(ANSI.yellow);
    expect(getColorForPercentage(20, tight)).toBe(ANSI.red);
  });
});

describe("renderBar", () => {
  it("renders empty bar at 0%", () => {
    expect(renderBar(0)).toBe("░░░░░░░░░░");
  });

  it("renders full bar at 100%", () => {
    expect(renderBar(100)).toBe("▓▓▓▓▓▓▓▓▓▓");
  });

  it("renders half-filled bar at 50%", () => {
    expect(renderBar(50)).toBe("▓▓▓▓▓░░░░░");
  });

  it("clamps values below 0 and above 100", () => {
    expect(renderBar(-10)).toBe("░░░░░░░░░░");
    expect(renderBar(150)).toBe("▓▓▓▓▓▓▓▓▓▓");
  });

  it("respects custom width", () => {
    expect(renderBar(50, 4)).toBe("▓▓░░");
    expect(renderBar(25, 4)).toBe("▓░░░");
  });

  it("rounds to nearest filled unit", () => {
    // 9% of 10 = 0.9 → rounds to 1
    expect(renderBar(9)).toBe("▓░░░░░░░░░");
    // 14% of 10 = 1.4 → rounds to 1
    expect(renderBar(14)).toBe("▓░░░░░░░░░");
    // 15% of 10 = 1.5 → rounds to 2
    expect(renderBar(15)).toBe("▓▓░░░░░░░░");
  });

  it("renders single-character bar", () => {
    expect(renderBar(0, 1)).toBe("░");
    expect(renderBar(100, 1)).toBe("▓");
    expect(renderBar(49, 1)).toBe("░");
    expect(renderBar(50, 1)).toBe("▓");
  });
});
