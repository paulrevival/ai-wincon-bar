import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyCodexConfig,
  codexItemsForConfig,
  readCodexTuiSettings,
  restoreCodexConfig,
  versionAtLeast,
  writeCodexTuiSettings,
} from "../src/codex.js";
import { DEFAULT_CONFIG } from "../src/constants.js";

const TMP_DIR = join(tmpdir(), `ai-wincon-bar-codex-${process.pid}`);
const CONFIG_PATH = join(TMP_DIR, "config.toml");

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.AI_WINCON_BAR_CODEX_CONFIG_PATH = CONFIG_PATH;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_CODEX_CONFIG_PATH;
});

describe("Codex version support", () => {
  it("accepts the minimum and newer versions", () => {
    expect(versionAtLeast("0.129.0")).toBe(true);
    expect(versionAtLeast("0.145.0")).toBe(true);
    expect(versionAtLeast("0.128.9")).toBe(false);
  });
});

describe("Codex TOML editing", () => {
  it("reads multiline status_line and colors", () => {
    const raw = `[tui]\nstatus_line = [\n  "model-name",\n  "future-item",\n]\nstatus_line_use_colors = false\n`;
    expect(readCodexTuiSettings(raw)).toEqual({
      hadStatusLine: true,
      statusLine: ["model-name", "future-item"],
      hadUseColors: true,
      useColors: false,
    });
  });

  it("changes only managed TUI keys and keeps other content", () => {
    const raw = `model = "gpt"\n\n[tui]\n# keep me\nnotifications = true\n\n[mcp_servers.demo]\ncommand = "demo"\n`;
    const next = writeCodexTuiSettings(raw, {
      hadStatusLine: true,
      statusLine: ["model-name"],
      hadUseColors: true,
      useColors: true,
    });
    expect(next).toContain("# keep me");
    expect(next).toContain("notifications = true");
    expect(next).toContain("[mcp_servers.demo]");
    expect(readCodexTuiSettings(next).statusLine).toEqual(["model-name"]);
  });
});

describe("Codex mapping and restore", () => {
  it("maps common/default fields and preserves unknown native items", () => {
    const items = codexItemsForConfig(DEFAULT_CONFIG, ["model-name", "future-item"]);
    expect(items).toEqual([
      "current-dir", "model-with-reasoning", "git-branch", "fast-mode",
      "context-used", "used-tokens", "context-window-size", "five-hour-limit",
      "weekly-limit", "future-item",
    ]);
  });

  it("restores the original values after an unchanged managed write", () => {
    writeFileSync(CONFIG_PATH, `[tui]\nstatus_line = ["model-name", "future-item"]\nstatus_line_use_colors = false\n`, "utf8");
    const backup = applyCodexConfig(DEFAULT_CONFIG);
    expect(restoreCodexConfig(backup)).toBe("restored");
    expect(readCodexTuiSettings(readFileSync(CONFIG_PATH, "utf8"))).toEqual({
      hadStatusLine: true,
      statusLine: ["model-name", "future-item"],
      hadUseColors: true,
      useColors: false,
    });
  });

  it("does not overwrite a later manual change", () => {
    writeFileSync(CONFIG_PATH, `[tui]\nstatus_line = ["model-name"]\n`, "utf8");
    const backup = applyCodexConfig(DEFAULT_CONFIG);
    writeFileSync(CONFIG_PATH, `[tui]\nstatus_line = ["thread-title"]\nstatus_line_use_colors = true\n`, "utf8");
    expect(restoreCodexConfig(backup)).toBe("changed");
    expect(readFileSync(CONFIG_PATH, "utf8")).toContain("thread-title");
  });
});
