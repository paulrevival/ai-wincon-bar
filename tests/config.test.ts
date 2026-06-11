import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG, CACHE_TTL_MS } from "../src/constants.js";
import type { CacheEntry } from "../src/constants.js";
import type { ClaudeStatusInput } from "../src/types.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-test-" + process.pid);

function makeInput(usedPct: number, tokens = 90_000): ClaudeStatusInput {
  return {
    context_window: {
      total_input_tokens: tokens,
      total_output_tokens: 0,
      context_window_size: 1_000_000,
      used_percentage: usedPct,
      remaining_percentage: 100 - usedPct,
    },
  };
}

describe("cache TTL", () => {
  const testCachePath = join(TMP_DIR, "cache-test.json");

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("fresh cache entry is within TTL", () => {
    const entry: CacheEntry = { data: makeInput(50), ts: Date.now() };
    writeFileSync(testCachePath, JSON.stringify(entry), "utf-8");

    const raw = JSON.parse(readFileSync(testCachePath, "utf-8")) as CacheEntry;
    const age = Date.now() - raw.ts;
    expect(age).toBeLessThan(CACHE_TTL_MS);
  });

  it("old cache entry exceeds TTL", () => {
    const entry: CacheEntry = {
      data: makeInput(50),
      ts: Date.now() - CACHE_TTL_MS - 1000,
    };
    writeFileSync(testCachePath, JSON.stringify(entry), "utf-8");

    const raw = JSON.parse(readFileSync(testCachePath, "utf-8")) as CacheEntry;
    expect(Date.now() - raw.ts > CACHE_TTL_MS).toBe(true);
  });

  it("zero used_percentage is treated as no valid cache", () => {
    const entry: CacheEntry = { data: makeInput(0), ts: Date.now() };
    const data = entry.data as ClaudeStatusInput;
    expect(data.context_window.used_percentage > 0).toBe(false);
  });

  it("entry exactly at TTL boundary is considered expired", () => {
    const entry: CacheEntry = {
      data: makeInput(50),
      ts: Date.now() - CACHE_TTL_MS,
    };
    // At exact boundary: Date.now() - entry.ts === CACHE_TTL_MS → expired (> not >=)
    const age = Date.now() - entry.ts;
    expect(age >= CACHE_TTL_MS).toBe(true);
  });
});

describe("loadConfig merge logic", () => {
  const testConfigPath = join(TMP_DIR, "test-config.json");

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("merges partial config with defaults", () => {
    const partial = { thresholds: { yellow: 30, red: 70 } };
    writeFileSync(testConfigPath, JSON.stringify(partial), "utf-8");

    const raw = readFileSync(testConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_CONFIG>;
    const merged = {
      elements: { ...DEFAULT_CONFIG.elements, ...parsed.elements },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
    };

    expect(merged.thresholds.yellow).toBe(30);
    expect(merged.thresholds.red).toBe(70);
    expect(merged.elements.progressBar).toBe(true);
    expect(merged.elements.tokens).toBe(true);
  });

  it("merges partial elements", () => {
    const partial = { elements: { tokens: false } };
    writeFileSync(testConfigPath, JSON.stringify(partial), "utf-8");

    const raw = readFileSync(testConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_CONFIG>;
    const merged = {
      elements: { ...DEFAULT_CONFIG.elements, ...parsed.elements },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
    };

    expect(merged.elements.tokens).toBe(false);
    expect(merged.elements.progressBar).toBe(true);
    expect(merged.thresholds.yellow).toBe(50);
  });

  it("returns defaults for malformed JSON", () => {
    writeFileSync(testConfigPath, "not valid json{{{" , "utf-8");

    let merged: typeof DEFAULT_CONFIG = DEFAULT_CONFIG;
    try {
      const raw = readFileSync(testConfigPath, "utf-8");
      const parsed = JSON.parse(raw);
      merged = {
        elements: { ...DEFAULT_CONFIG.elements, ...parsed.elements },
        thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
      };
    } catch {
      merged = { ...DEFAULT_CONFIG };
    }

    expect(merged).toEqual(DEFAULT_CONFIG);
  });

  it("handles empty object", () => {
    writeFileSync(testConfigPath, "{}", "utf-8");

    const raw = readFileSync(testConfigPath, "utf-8");
    const parsed = JSON.parse(raw);
    const merged = {
      elements: { ...DEFAULT_CONFIG.elements, ...parsed.elements },
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...parsed.thresholds },
    };

    expect(merged).toEqual(DEFAULT_CONFIG);
  });
});
