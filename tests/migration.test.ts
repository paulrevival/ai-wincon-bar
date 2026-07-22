import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getCachePath, getConfigPath, getSessionsPath, migrateLegacyData } from "../src/config.js";

const ROOT = join(tmpdir(), `ai-wincon-bar-migration-${process.pid}`);
const XDG_HOME = join(ROOT, "xdg");
const LEGACY = join(ROOT, "legacy");

beforeEach(() => {
  mkdirSync(LEGACY, { recursive: true });
  delete process.env.AI_WINCON_BAR_DIR;
  process.env.XDG_CONFIG_HOME = XDG_HOME;
  process.env.AI_WINCON_BAR_LEGACY_DIR = LEGACY;
});

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.AI_WINCON_BAR_LEGACY_DIR;
});

describe("legacy data migration", () => {
  it("copies config, cache, and sessions while retaining the originals", () => {
    writeFileSync(join(LEGACY, "ai-wincon-bar.json"), "{}", "utf8");
    writeFileSync(join(LEGACY, "cache.json"), "cache", "utf8");
    writeFileSync(join(LEGACY, "sessions.json"), "sessions", "utf8");

    expect(migrateLegacyData()).toBe(true);
    expect(readFileSync(getConfigPath(), "utf8")).toBe("{}");
    expect(readFileSync(getCachePath(), "utf8")).toBe("cache");
    expect(readFileSync(getSessionsPath(), "utf8")).toBe("sessions");
    expect(existsSync(join(LEGACY, "ai-wincon-bar.json"))).toBe(true);
  });

  it("does not overwrite an existing shared config", () => {
    mkdirSync(join(XDG_HOME, "ai-wincon-bar"), { recursive: true });
    writeFileSync(getConfigPath(), "new", "utf8");
    writeFileSync(join(LEGACY, "ai-wincon-bar.json"), "old", "utf8");
    expect(migrateLegacyData()).toBe(false);
    expect(readFileSync(getConfigPath(), "utf8")).toBe("new");
  });
});
