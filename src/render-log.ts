import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ClaudeStatusInput } from "./types.js";
import { getRenderLogPath } from "./config.js";

/**
 * Temporary diagnostic (see TODO.md): record one line per status-line render to
 * find out why some calendar days end up with zero recorded sessions. Remove
 * this whole module once the cause is confirmed.
 */

export type RenderResult = "ok" | "no_session_id" | "no_cost" | "duration_le_zero";

export interface RenderLogEntry {
  ts: string;
  sid: string | null;
  result: RenderResult;
  /** Present only when result === "ok". */
  project?: string;
  dur?: number;
  api?: number;
}

/**
 * Local ISO-8601 timestamp with timezone offset, e.g. `2026-07-20T12:23:51+03:00`.
 * Built by hand because there is no built-in locale-independent local ISO helper.
 */
export function localIsoTimestamp(now = new Date()): string {
  const off = now.getTimezoneOffset(); // minutes; positive = west of UTC
  const shifted = new Date(now.getTime() - off * 60000);
  const iso = shifted.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
  const sign = off <= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${iso}${sign}${hh}:${mm}`;
}

/** Classify why a render did or didn't get recorded — mirrors recordSession's guard. */
export function classifyRender(input: ClaudeStatusInput): RenderResult {
  const sid = input.session_id;
  const cost = input.cost;
  const dur = cost?.total_duration_ms;
  if (!sid) return "no_session_id";
  if (cost == null) return "no_cost";
  if (!dur || dur <= 0) return "duration_le_zero";
  return "ok";
}

/** Build a single log entry from a status-line input. */
export function buildRenderLogEntry(input: ClaudeStatusInput, now = new Date()): RenderLogEntry {
  const result = classifyRender(input);
  const entry: RenderLogEntry = {
    ts: localIsoTimestamp(now),
    sid: input.session_id ?? null,
    result,
  };
  if (result === "ok") {
    const cost = input.cost!;
    entry.project = input.workspace?.project_dir ?? input.cwd;
    entry.dur = cost.total_duration_ms;
    entry.api = cost.total_api_duration_ms ?? 0;
  }
  return entry;
}

/**
 * Append one status-line render event to render.log as JSONL. Self-silencing —
 * a diagnostic write must never break the status line.
 */
export function appendRenderLog(input: ClaudeStatusInput, now = new Date()): void {
  try {
    const entry = buildRenderLogEntry(input, now);
    const path = getRenderLogPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Non-critical — never break the status line over a diagnostic log.
  }
}
