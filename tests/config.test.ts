import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConfig,
  saveConfig,
  readCache,
  writeCache,
  clearCache,
  isConfigured,
  getCachePath,
  getConfigPath,
  getSettingsPath,
  updateSettingsStatusLine,
} from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/constants.js";
import type { ClaudeStatusInput, WinconBarConfig } from "../src/types.js";

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

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.AI_WINCON_BAR_DIR = TMP_DIR;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_DIR;
});

// ─── Path helpers ────────────────────────────────────────

describe("path helpers", () => {
  it("getConfigPath points to claude dir", () => {
    expect(getConfigPath()).toBe(join(TMP_DIR, "ai-wincon-bar.json"));
  });

  it("getCachePath points to claude dir", () => {
    expect(getCachePath()).toBe(join(TMP_DIR, "ai-wincon-bar-cache.json"));
  });

  it("getSettingsPath points to settings.json", () => {
    expect(getSettingsPath()).toBe(join(TMP_DIR, "settings.json"));
  });
});

// ─── loadConfig / saveConfig ─────────────────────────────

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("returns defaults for malformed JSON", () => {
    writeFileSync(getConfigPath(), "not valid json{{{", "utf-8");
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("returns defaults for empty file", () => {
    writeFileSync(getConfigPath(), "", "utf-8");
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial thresholds with defaults", () => {
    writeFileSync(
      getConfigPath(),
      JSON.stringify({ thresholds: { yellow: 30, red: 70 } }),
      "utf-8",
    );
    const config = loadConfig();
    expect(config.thresholds).toEqual({ yellow: 30, red: 70 });
    expect(config.elements).toEqual(DEFAULT_CONFIG.elements);
  });

  it("merges partial elements with defaults", () => {
    writeFileSync(
      getConfigPath(),
      JSON.stringify({ elements: { tokens: false } }),
      "utf-8",
    );
    const config = loadConfig();
    expect(config.elements.tokens).toBe(false);
    expect(config.elements.progressBar).toBe(true);
    expect(config.thresholds).toEqual(DEFAULT_CONFIG.thresholds);
  });

  it("handles empty object", () => {
    writeFileSync(getConfigPath(), "{}", "utf-8");
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });
});

describe("saveConfig + loadConfig round-trip", () => {
  it("saves and loads config correctly", () => {
    const config: WinconBarConfig = {
      elements: { progressBar: false, percent: true, tokens: true, tariff: false },
      thresholds: { yellow: 25, red: 60 },
    };
    saveConfig(config);
    expect(loadConfig()).toEqual(config);
  });

  it("writes valid JSON with 2-space indent", () => {
    saveConfig(DEFAULT_CONFIG);
    const raw = readFileSync(getConfigPath(), "utf-8");
    expect(raw).toBe(JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  });
});

// ─── isConfigured ────────────────────────────────────────

describe("isConfigured", () => {
  it("returns false when no config file", () => {
    expect(isConfigured()).toBe(false);
  });

  it("returns true when config file exists", () => {
    saveConfig(DEFAULT_CONFIG);
    expect(isConfigured()).toBe(true);
  });
});

// ─── Cache: writeCache / readCache / clearCache ──────────

describe("writeCache + readCache", () => {
  it("returns null when no cache file exists", () => {
    expect(readCache()).toBeNull();
  });

  it("returns null for malformed cache", () => {
    writeFileSync(getCachePath(), "garbage", "utf-8");
    expect(readCache()).toBeNull();
  });

  it("returns data for fresh cache", () => {
    const input = makeInput(42);
    writeCache(input);
    const cached = readCache();
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
    expect(cached!.context_window.total_input_tokens).toBe(90_000);
  });

  it("returns null for expired cache", () => {
    // Write a cache entry with old timestamp
    const entry = { data: makeInput(50), ts: Date.now() - 11_000 };
    writeFileSync(getCachePath(), JSON.stringify(entry), "utf-8");
    expect(readCache()).toBeNull();
  });

  it("returns null for cache with used_percentage = 0", () => {
    const input = makeInput(0, 0);
    writeCache(input);
    // Even though cache is fresh, zero percentage → null
    expect(readCache()).toBeNull();
  });

  it("preserves full context_window data", () => {
    const input = makeInput(75, 200_000);
    writeCache(input);
    const cached = readCache()!;
    expect(cached.context_window.total_input_tokens).toBe(200_000);
    expect(cached.context_window.context_window_size).toBe(1_000_000);
  });
});

describe("clearCache", () => {
  it("removes cache file", () => {
    writeCache(makeInput(50));
    expect(existsSync(getCachePath())).toBe(true);
    clearCache();
    expect(existsSync(getCachePath())).toBe(false);
  });

  it("does not throw when no cache file", () => {
    expect(() => clearCache()).not.toThrow();
  });
});

// ─── updateSettingsStatusLine ────────────────────────────

describe("updateSettingsStatusLine", () => {
  it("creates settings.json with statusLine when no file exists", () => {
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine).toEqual({
      type: "command",
      command: "ai-wincon-bar",
    });
  });

  it("preserves existing settings when updating", () => {
    const existing = { someOtherKey: "value", nested: { a: 1 } };
    writeFileSync(getSettingsPath(), JSON.stringify(existing), "utf-8");
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.someOtherKey).toBe("value");
    expect(settings.nested).toEqual({ a: 1 });
    expect(settings.statusLine).toEqual({
      type: "command",
      command: "ai-wincon-bar",
    });
  });

  it("overwrites existing statusLine", () => {
    const existing = { statusLine: { type: "command", command: "old-command" } };
    writeFileSync(getSettingsPath(), JSON.stringify(existing), "utf-8");
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine.command).toBe("ai-wincon-bar");
  });

  it("replaces malformed settings.json", () => {
    writeFileSync(getSettingsPath(), "not json{{{", "utf-8");
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine).toEqual({
      type: "command",
      command: "ai-wincon-bar",
    });
  });
});
