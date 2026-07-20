import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
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
  pickRenderData,
  getProjectId,
} from "../src/config.js";
import { DEFAULT_CONFIG, CACHE_TTL_MS } from "../src/constants.js";
import type { ClaudeStatusInput, WinconBarConfig } from "../src/types.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-test-" + process.pid);
const TMP_SETTINGS = join(TMP_DIR, "settings.json");

function makeInput(usedPct: number, tokens = 90_000): ClaudeStatusInput {
  return {
    session_id: "S",
    workspace: { project_dir: "/test/project" },
    cwd: "/test/project",
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
  process.env.AI_WINCON_BAR_SETTINGS_PATH = TMP_SETTINGS;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_DIR;
  delete process.env.AI_WINCON_BAR_SETTINGS_PATH;
});

// ─── Path helpers ────────────────────────────────────────

describe("path helpers", () => {
  it("getConfigPath points to data dir", () => {
    expect(getConfigPath()).toBe(join(TMP_DIR, "ai-wincon-bar.json"));
  });

  it("getCachePath points to data dir", () => {
    expect(getCachePath()).toBe(join(TMP_DIR, "cache.json"));
  });

  it("getSettingsPath respects env override", () => {
    expect(getSettingsPath()).toBe(TMP_SETTINGS);
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
    expect(config.sessionRetentionDays).toBe(DEFAULT_CONFIG.sessionRetentionDays);
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

// ─── sessionRetentionDays ────────────────────────────────

describe("loadConfig: sessionRetentionDays", () => {
  it("merges a custom value", () => {
    writeFileSync(getConfigPath(), JSON.stringify({ sessionRetentionDays: 30 }), "utf-8");
    expect(loadConfig().sessionRetentionDays).toBe(30);
  });

  it("falls back to default for missing or invalid values", () => {
    const cases = [
      {},
      { sessionRetentionDays: 0 },
      { sessionRetentionDays: -3 },
      { sessionRetentionDays: "7" },
      { sessionRetentionDays: null },
    ];
    for (const cfg of cases) {
      writeFileSync(getConfigPath(), JSON.stringify(cfg), "utf-8");
      expect(loadConfig().sessionRetentionDays).toBe(DEFAULT_CONFIG.sessionRetentionDays);
    }
  });

  it("floors a fractional retention to whole days", () => {
    writeFileSync(getConfigPath(), JSON.stringify({ sessionRetentionDays: 9.9 }), "utf-8");
    expect(loadConfig().sessionRetentionDays).toBe(9);
  });
});

describe("saveConfig + loadConfig round-trip", () => {
  it("saves and loads config correctly", () => {
    const config: WinconBarConfig = {
      elements: { modelName: false, progressBar: false, percent: true, tokens: true, tariff: false, tariffWeekly: false, sessionName: false, sessionTime: false },
      thresholds: { yellow: 25, red: 60 },
      sessionRetentionDays: 21,
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

// ─── Cache: readCache / writeCache / clearCache ──────────

describe("readCache (map format)", () => {
  it("returns null when no cache file exists", () => {
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns null for malformed cache", () => {
    writeFileSync(getCachePath(), "garbage", "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns data for a fresh same-project, same-session entry", () => {
    writeCache(makeInput(42));
    const cached = readCache("S", "/test/project");
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
  });

  it("returns null for expired entry (TTL)", () => {
    const entry = { data: makeInput(50), ts: Date.now() - (CACHE_TTL_MS + 5_000), session_id: "S" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("serves a same-session entry on a zero burst even after a 60s gap", () => {
    // Claude Code emits zero-payloads continuously between context updates;
    // a 60s gap (a normal thinking pause) must still fall back to the last real
    // reading instead of blanking the bar to zero. Regression for the
    // "status resets to zero when sending a request" bug.
    const entry = { data: makeInput(42), ts: Date.now() - 60_000, session_id: "S" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    const cached = readCache("S", "/test/project");
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
  });

  it("returns null when used_percentage is 0", () => {
    const entry = { data: makeInput(0, 0), ts: Date.now(), session_id: "S" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns null when session_id differs (stale after /clear)", () => {
    const entry = { data: makeInput(50), ts: Date.now(), session_id: "OLD" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("NEW", "/test/project")).toBeNull();
  });

  it("returns null for a different project (isolation)", () => {
    writeCache(makeInput(50));
    expect(readCache("S", "/other/project")).toBeNull();
  });

  it("treats legacy { data, ts } format as absent (returns null)", () => {
    const legacy = { data: makeInput(50), ts: Date.now() };
    writeFileSync(getCachePath(), JSON.stringify(legacy), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });
});

describe("writeCache (map format)", () => {
  it("writes a per-project entry readable by readCache", () => {
    writeCache(makeInput(42));
    const cached = readCache("S", "/test/project");
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
  });

  it("stores session_id alongside data", () => {
    writeCache(makeInput(50));
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/test/project"].session_id).toBe("S");
  });

  it("preserves other projects' entries", () => {
    const map = {
      "/other/project": { data: makeInput(99), ts: Date.now(), session_id: "X" },
    };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
    writeCache(makeInput(42)); // project /test/project
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/other/project"]).toBeDefined();
    expect(raw["/test/project"]).toBeDefined();
  });

  it("evicts expired entries on write", () => {
    const map = {
      "/stale/project": { data: makeInput(10), ts: Date.now() - (CACHE_TTL_MS + 5_000), session_id: "Y" },
    };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
    writeCache(makeInput(42)); // снесёт /stale/project, запишет /test/project
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/stale/project"]).toBeUndefined();
    expect(raw["/test/project"]).toBeDefined();
  });

  it("does not throw on a normal write (non-critical)", () => {
    expect(() => writeCache(makeInput(42))).not.toThrow();
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

// ─── pickRenderData: per-project cache reset after /clear ──────────

describe("pickRenderData", () => {
  function withSession(
    input: ClaudeStatusInput,
    session_id: string,
    project = "/test/project",
  ): ClaudeStatusInput {
    return { ...input, session_id, workspace: { project_dir: project }, cwd: project };
  }

  it("caches and renders real data (used_percentage > 0)", () => {
    const result = pickRenderData(withSession(makeInput(42, 90_000), "S"));
    expect(result.context_window.used_percentage).toBe(42);
    expect(readCache("S", "/test/project")?.context_window.used_percentage).toBe(42);
  });

  it("falls back to fresh same-project, same-session cache on a zero burst", () => {
    pickRenderData(withSession(makeInput(42, 90_000), "S"));
    const burst = withSession(makeInput(0, 0), "S");
    expect(pickRenderData(burst).context_window.used_percentage).toBe(42);
  });

  it("ignores stale same-project cache after /clear (new session, zero burst)", () => {
    pickRenderData(withSession(makeInput(45, 90_000), "OLD"));
    const afterClear = withSession(makeInput(0, 0), "NEW");
    const result = pickRenderData(afterClear);
    expect(result.context_window.used_percentage).toBe(0);
    expect(result.session_id).toBe("NEW");
  });

  it("does NOT leak another project's cache during a zero burst", () => {
    pickRenderData(withSession(makeInput(77, 90_000), "SA", "/proj-a"));
    const burstB = withSession(makeInput(0, 0), "SB", "/proj-b");
    expect(pickRenderData(burstB).context_window.used_percentage).toBe(0);
  });

  it("independent zero-burst fallback per project (both valid)", () => {
    pickRenderData(withSession(makeInput(30, 90_000), "SA", "/proj-a"));
    pickRenderData(withSession(makeInput(60, 90_000), "SB", "/proj-b"));
    expect(pickRenderData(withSession(makeInput(0, 0), "SA", "/proj-a")).context_window.used_percentage).toBe(30);
    expect(pickRenderData(withSession(makeInput(0, 0), "SB", "/proj-b")).context_window.used_percentage).toBe(60);
  });
});

// ─── pickRenderData: post-/compact correction via transcript ──────

describe("pickRenderData + /compact", () => {
  function withSession(
    input: ClaudeStatusInput,
    session_id: string,
    project = "/test/project",
  ): ClaudeStatusInput {
    return { ...input, session_id, workspace: { project_dir: project }, cwd: project };
  }

  /** Manually seed a cache entry with an explicit timestamp. */
  function seedCache(data: ClaudeStatusInput, ts: number, session_id: string, project = "/test/project") {
    writeFileSync(getCachePath(), JSON.stringify({ [project]: { data, ts, session_id } }), "utf-8");
  }

  /** Write a transcript with one compact_boundary at the given epoch-ms. */
  function writeTranscript(boundaryMs: number, postTokens: number): string {
    const path = join(TMP_DIR, "transcript.jsonl");
    const line = JSON.stringify({
      type: "system",
      subtype: "compact_boundary",
      timestamp: new Date(boundaryMs).toISOString(),
      compactMetadata: { trigger: "manual", preTokens: 500_000, postTokens },
    });
    writeFileSync(path, line + "\n", "utf-8");
    return path;
  }

  it("shows post-compact postTokens on a zero burst after /compact", () => {
    const cacheTs = Date.now() - 60_000;
    seedCache(withSession(makeInput(50, 500_000), "S"), cacheTs, "S");
    const transcript = writeTranscript(cacheTs + 30_000, 20_000);
    const burst = { ...withSession(makeInput(0, 0), "S"), transcript_path: transcript };

    const result = pickRenderData(burst);

    expect(result.context_window.total_input_tokens).toBe(20_000);
    expect(result.context_window.used_percentage).toBe(2); // 20K / 1M
  });

  it("persists the corrected reading back to cache", () => {
    const cacheTs = Date.now() - 60_000;
    seedCache(withSession(makeInput(50, 500_000), "S"), cacheTs, "S");
    const transcript = writeTranscript(cacheTs + 30_000, 20_000);
    const burst = { ...withSession(makeInput(0, 0), "S"), transcript_path: transcript };

    pickRenderData(burst);

    expect(readCache("S", "/test/project")?.context_window.total_input_tokens).toBe(20_000);
  });

  it("does NOT correct when the boundary predates the cached reading", () => {
    const cacheTs = Date.now();
    seedCache(withSession(makeInput(50, 500_000), "S"), cacheTs, "S");
    const transcript = writeTranscript(cacheTs - 60_000, 20_000);
    const burst = { ...withSession(makeInput(0, 0), "S"), transcript_path: transcript };

    expect(pickRenderData(burst).context_window.used_percentage).toBe(50);
  });

  it("falls back to plain cache when no transcript_path is given", () => {
    const cacheTs = Date.now() - 60_000;
    seedCache(withSession(makeInput(50, 500_000), "S"), cacheTs, "S");

    expect(pickRenderData(withSession(makeInput(0, 0), "S")).context_window.used_percentage).toBe(50);
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

  it("nests refreshInterval (seconds) inside statusLine when given", () => {
    updateSettingsStatusLine(60);
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine).toEqual({
      type: "command",
      command: "ai-wincon-bar",
      refreshInterval: 60,
    });
  });

  it("omits refreshInterval when not given", () => {
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine.refreshInterval).toBeUndefined();
  });

  it("drops a previously-set refreshInterval when called without one", () => {
    const existing = {
      statusLine: { type: "command", command: "ai-wincon-bar", refreshInterval: 60 },
    };
    writeFileSync(getSettingsPath(), JSON.stringify(existing), "utf-8");
    updateSettingsStatusLine();
    const settings = JSON.parse(readFileSync(getSettingsPath(), "utf-8"));
    expect(settings.statusLine.refreshInterval).toBeUndefined();
  });
});

// ─── getProjectId ────────────────────────────────────────

describe("getProjectId", () => {
  it("prefers workspace.project_dir", () => {
    const input = {
      cwd: "/cwd",
      workspace: { project_dir: "/project" },
      context_window: { used_percentage: 1 },
    } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("/project");
  });

  it("falls back to cwd when workspace.project_dir absent", () => {
    const input = { cwd: "/cwd", context_window: { used_percentage: 1 } } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("/cwd");
  });

  it("returns __default__ when neither is present", () => {
    const input = { context_window: { used_percentage: 1 } } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("__default__");
  });
});
