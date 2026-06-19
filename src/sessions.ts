import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { ClaudeStatusInput } from "./types.js";
import { getSessionsPath, getProjectId } from "./config.js";
import { formatDuration } from "./format.js";

/**
 * One persisted session, keyed by session_id in sessions.json.
 *
 * `duration_ms` / `api_duration_ms` mirror Claude Code's cumulative
 * `cost.total_duration_ms` (wall-clock since session start, incl. idle) and
 * `cost.total_api_duration_ms` (active time waiting on the model). Both are
 * monotonic, so the largest reading seen for a session is its final total.
 * `started_at` is estimated once as `now - duration_ms` at first sighting so the
 * session lands on the day it actually began, even if logging started mid-session.
 */
export interface SessionRecord {
  session_id: string;
  project: string;
  started_at: number;
  last_seen: number;
  duration_ms: number;
  api_duration_ms: number;
}

export type SessionLog = Record<string, SessionRecord>;

/** Drop records whose last_seen is older than this (bounds file growth). */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

/** Local calendar day of an epoch timestamp, as `YYYY-MM-DD`. */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Read sessions.json as a SessionLog. Missing/malformed → empty map. */
export function readSessionLog(): SessionLog {
  const path = getSessionsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (parsed && typeof parsed === "object") return parsed as SessionLog;
    return {};
  } catch {
    return {};
  }
}

/**
 * Upsert the current session's wall-clock / API time into sessions.json.
 *
 * Called from the silent status-line render path, so it must never throw.
 * No-op unless the payload carries a session_id and a positive
 * cost.total_duration_ms. Durations are kept at their max so a stray smaller
 * reading (or a zero-burst) can't shrink a session. Expired records are pruned
 * on write.
 */
export function recordSession(input: ClaudeStatusInput, now = Date.now()): void {
  try {
    const sessionId = input.session_id;
    const duration = input.cost?.total_duration_ms;
    if (!sessionId || !duration || duration <= 0) return;
    const api = input.cost?.total_api_duration_ms ?? 0;

    const log = readSessionLog();
    const existing = log[sessionId];
    if (existing) {
      existing.last_seen = now;
      existing.duration_ms = Math.max(existing.duration_ms, duration);
      existing.api_duration_ms = Math.max(existing.api_duration_ms, api);
    } else {
      log[sessionId] = {
        session_id: sessionId,
        project: getProjectId(input),
        started_at: now - duration,
        last_seen: now,
        duration_ms: duration,
        api_duration_ms: api,
      };
    }

    for (const key of Object.keys(log)) {
      if (now - log[key].last_seen > RETENTION_MS) delete log[key];
    }

    const path = getSessionsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(log), "utf-8");
  } catch {
    // Non-critical — never break the status line over a stats write.
  }
}

/** Inclusive date-key bounds; either side may be omitted for an open range. */
export interface DateRange {
  since?: string;
  until?: string;
}

/** Keep records whose started_at day falls within [since, until] (inclusive). */
export function recordsInRange(
  records: SessionRecord[],
  range: DateRange,
): SessionRecord[] {
  return records.filter((r) => {
    const key = localDateKey(r.started_at);
    if (range.since && key < range.since) return false;
    if (range.until && key > range.until) return false;
    return true;
  });
}

export interface ProjectAgg {
  project: string;
  name: string;
  count: number;
  durationMs: number;
  apiMs: number;
}

export interface DayGroup {
  day: string;
  projects: ProjectAgg[];
  count: number;
  durationMs: number;
  apiMs: number;
}

/**
 * Group records by local day (most recent first), then by project within each
 * day (longest wall-clock first), with per-day totals.
 */
export function aggregateSessions(records: SessionRecord[]): DayGroup[] {
  const byDay = new Map<string, Map<string, ProjectAgg>>();

  for (const r of records) {
    const day = localDateKey(r.started_at);
    let projects = byDay.get(day);
    if (!projects) {
      projects = new Map();
      byDay.set(day, projects);
    }
    let agg = projects.get(r.project);
    if (!agg) {
      agg = { project: r.project, name: basename(r.project) || r.project, count: 0, durationMs: 0, apiMs: 0 };
      projects.set(r.project, agg);
    }
    agg.count += 1;
    agg.durationMs += r.duration_ms;
    agg.apiMs += r.api_duration_ms;
  }

  const groups: DayGroup[] = [];
  for (const [day, projects] of byDay) {
    const rows = [...projects.values()].sort(
      (a, b) => b.durationMs - a.durationMs || a.name.localeCompare(b.name),
    );
    groups.push({
      day,
      projects: rows,
      count: rows.reduce((n, p) => n + p.count, 0),
      durationMs: rows.reduce((n, p) => n + p.durationMs, 0),
      apiMs: rows.reduce((n, p) => n + p.apiMs, 0),
    });
  }
  return groups.sort((a, b) => b.day.localeCompare(a.day));
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Render the grouped table: per day, a per-project breakdown plus a
 * "Day total" line, with two duration columns (wall-clock and active API time).
 */
export function formatSessionsTable(records: SessionRecord[]): string {
  if (records.length === 0) return "No sessions recorded for this range.";

  const groups = aggregateSessions(records);
  const DAY_TOTAL = "Day total";
  const nameWidth = Math.max(
    DAY_TOTAL.length,
    ...groups.flatMap((g) => g.projects.map((p) => p.name.length)),
  );

  const lines: string[] = [];
  lines.push(`${pad("", nameWidth)}    wall      api      sessions`);
  for (const g of groups) {
    lines.push("");
    lines.push(g.day);
    for (const p of g.projects) {
      lines.push(
        `  ${pad(p.name, nameWidth)}  ${pad(formatDuration(p.durationMs), 8)} ${pad(formatDuration(p.apiMs), 8)}  ${p.count}`,
      );
    }
    lines.push(
      `  ${pad(DAY_TOTAL, nameWidth)}  ${pad(formatDuration(g.durationMs), 8)} ${pad(formatDuration(g.apiMs), 8)}  ${g.count}`,
    );
  }
  return lines.join("\n");
}
