import { describe, it, expect } from "vitest";
import { formatTokens, getColorForPercentage, renderBar } from "../src/format.js";
import { ANSI } from "../src/constants.js";

describe("formatTokens", () => {
  it("returns number as-is for values < 1000", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands as XK", () => {
    expect(formatTokens(1_000)).toBe("1K");
    expect(formatTokens(90_000)).toBe("90K");
    expect(formatTokens(999_999)).toBe("1000K");
  });

  it("formats millions as X.XM", () => {
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(2_300_000)).toBe("2.3M");
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
});
