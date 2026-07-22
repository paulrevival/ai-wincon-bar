import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import type { CodexStatusLineBackup, WinconBarConfig } from "./types.js";

export const MIN_CODEX_VERSION = "0.129.0";

const MANAGED_ITEMS = new Set([
  "current-dir", "model-name", "model-with-reasoning", "context-used",
  "used-tokens", "context-window-size", "five-hour-limit", "weekly-limit",
  "git-branch", "fast-mode", "permissions", "total-input-tokens", "total-output-tokens",
]);

export interface CodexTuiSettings {
  hadStatusLine: boolean;
  statusLine?: string[];
  hadUseColors: boolean;
  useColors?: boolean;
}

export function getCodexConfigPath(): string {
  if (process.env.AI_WINCON_BAR_CODEX_CONFIG_PATH) return process.env.AI_WINCON_BAR_CODEX_CONFIG_PATH;
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  return join(codexHome, "config.toml");
}

export function getCodexSkillPath(): string {
  const root = process.env.AI_WINCON_BAR_CODEX_SKILLS_DIR
    ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills", "ai-wincon-bar");
  return join(root, "SKILL.md");
}

export function getCodexVersion(): string | null {
  const result = spawnSync("codex", ["--version"], { encoding: "utf8" });
  const match = result.status === 0 ? result.stdout.match(/(\d+\.\d+\.\d+)/) : null;
  return match?.[1] ?? null;
}

export function versionAtLeast(actual: string, minimum = MIN_CODEX_VERSION): boolean {
  const a = actual.split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

function tuiBounds(raw: string): { start: number; end: number } | null {
  const match = /^[ \t]*\[tui\][ \t]*(?:#.*)?$/m.exec(raw);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = raw.slice(start);
  const next = /^[ \t]*\[[^\n]+\][ \t]*(?:#.*)?$/m.exec(rest);
  return { start, end: next ? start + next.index : raw.length };
}

function readArray(section: string, key: string): string[] | undefined {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:#.*)?$`, "m").exec(section);
  if (!match) return undefined;
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

function readBoolean(section: string, key: string): boolean | undefined {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*(?:#.*)?$`, "m").exec(section);
  return match ? match[1] === "true" : undefined;
}

export function readCodexTuiSettings(raw: string): CodexTuiSettings {
  const bounds = tuiBounds(raw);
  if (!bounds) return { hadStatusLine: false, hadUseColors: false };
  const section = raw.slice(bounds.start, bounds.end);
  const statusLine = readArray(section, "status_line");
  const useColors = readBoolean(section, "status_line_use_colors");
  return {
    hadStatusLine: statusLine !== undefined,
    statusLine,
    hadUseColors: useColors !== undefined,
    useColors,
  };
}

function setTuiValue(raw: string, key: string, rendered: string | null): string {
  let bounds = tuiBounds(raw);
  if (!bounds) {
    raw = `${raw.trimEnd()}${raw.trim() ? "\n\n" : ""}[tui]\n`;
    bounds = tuiBounds(raw)!;
  }
  let section = raw.slice(bounds.start, bounds.end);
  const pattern = key === "status_line"
    ? new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*\\[[\\s\\S]*?\\][ \\t]*(?:#.*)?\\n?`, "m")
    : new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(?:true|false)[ \\t]*(?:#.*)?\\n?`, "m");
  if (pattern.test(section)) {
    section = rendered === null ? section.replace(pattern, "") : section.replace(pattern, `${key} = ${rendered}\n`);
  } else if (rendered !== null) {
    section = `\n${key} = ${rendered}${section}`;
  }
  return raw.slice(0, bounds.start) + section + raw.slice(bounds.end);
}

function renderArray(items: string[]): string {
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

export function writeCodexTuiSettings(raw: string, settings: CodexTuiSettings): string {
  let next = setTuiValue(raw, "status_line", settings.hadStatusLine ? renderArray(settings.statusLine ?? []) : null);
  next = setTuiValue(next, "status_line_use_colors", settings.hadUseColors ? String(settings.useColors ?? true) : null);
  return next.endsWith("\n") ? next : next + "\n";
}

export function codexItemsForConfig(config: WinconBarConfig, existing: string[] = []): string[] {
  const e = config.elements;
  const desired = [
    e.sessionName && "current-dir",
    e.modelName && (e.reasoningEffort ? "model-with-reasoning" : "model-name"),
    e.gitBranch && "git-branch",
    e.fastMode && "fast-mode",
    e.permissionProfile && "permissions",
    e.percent && "context-used",
    e.tokens && "used-tokens",
    e.tokens && "context-window-size",
    e.cumulativeTokens && "total-input-tokens",
    e.cumulativeTokens && "total-output-tokens",
    e.tariff && "five-hour-limit",
    e.tariffWeekly && "weekly-limit",
  ].filter((item): item is string => Boolean(item));
  const unknown = existing.filter((item) => !MANAGED_ITEMS.has(item) && !desired.includes(item));
  return [...desired, ...unknown];
}

export function applyCodexConfig(config: WinconBarConfig): CodexStatusLineBackup {
  const path = getCodexConfigPath();
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const current = readCodexTuiSettings(raw);
  const items = codexItemsForConfig(config, current.statusLine);
  const useColors = config.elements.codexThemeColors;
  const original = config.codexBackup ?? {
    ...current,
    appliedStatusLine: items,
    appliedUseColors: useColors,
  };
  const backup: CodexStatusLineBackup = {
    ...original,
    appliedStatusLine: items,
    appliedUseColors: useColors,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, writeCodexTuiSettings(raw, {
    hadStatusLine: true,
    statusLine: items,
    hadUseColors: true,
    useColors,
  }), "utf8");
  return backup;
}

export function restoreCodexConfig(backup: CodexStatusLineBackup): "restored" | "changed" | "missing" {
  const path = getCodexConfigPath();
  if (!existsSync(path)) return "missing";
  const raw = readFileSync(path, "utf8");
  const current = readCodexTuiSettings(raw);
  if (JSON.stringify(current.statusLine) !== JSON.stringify(backup.appliedStatusLine)
    || current.useColors !== backup.appliedUseColors) return "changed";
  writeFileSync(path, writeCodexTuiSettings(raw, backup), "utf8");
  return "restored";
}
