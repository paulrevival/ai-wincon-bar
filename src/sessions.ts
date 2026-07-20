import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { ClaudeStatusInput } from "./types.js";
import { getSessionsPath, getProjectId } from "./config.js";
import { formatDuration } from "./format.js";
import { DEFAULT_SESSION_RETENTION_DAYS, MS_PER_DAY } from "./constants.js";

/**
 * One persisted session, keyed by session_id in sessions.json.
 *
 * Claude Code's `cost.total_duration_ms` / `total_api_duration_ms` are
 * per-*process*, not per-session: they keep climbing across `/clear`, which only
 * rotates the session_id. Storing those absolutes verbatim makes the new
 * post-`/clear` record overlap the previous one, and `aggregateSessions` (which
 * sums per project/day) then double-counts the shared time.
 *
 * To avoid that, each record stores only its own slice: `baseline_ms` /
 * `baseline_api_ms` capture the process readings at the session's first sighting,
 * and `duration_ms` / `api_duration_ms` are the (monotonic, max-tracked) delta
 * above that baseline. `started_at` is set once to first-sighting time, so the
 * session buckets onto the day we actually began observing it.
 */
export interface SessionRecord {
  session_id: string;
  project: string;
  started_at: number;
  last_seen: number;
  duration_ms: number;
  api_duration_ms: number;
  /** Process `total_duration_ms` at first sighting; subtracted to get the slice. */
  baseline_ms?: number;
  /** Process `total_api_duration_ms` at first sighting. */
  baseline_api_ms?: number;
}

export type SessionLog = Record<string, SessionRecord>;

/**
 * Default retention cutoff (ms) — records whose last_seen is older are pruned.
 * Bounds file growth; overridable per-call via `recordSession`'s `retentionMs`.
 */
const DEFAULT_RETENTION_MS = DEFAULT_SESSION_RETENTION_DAYS * MS_PER_DAY;

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
 * cost.total_duration_ms. The stored duration is the delta above the session's
 * first-sighting baseline (see SessionRecord) so `/clear`-rotated sessions in the
 * same process don't overlap. Deltas are kept at their max so a stray smaller
 * reading (or a zero-burst) can't shrink a session. Records older than
 * `retentionMs` (default from config; ~14 days) are pruned on write.
 */
export function recordSession(
  input: ClaudeStatusInput,
  now = Date.now(),
  retentionMs: number = DEFAULT_RETENTION_MS,
): void {
  try {
    const sessionId = input.session_id;
    const duration = input.cost?.total_duration_ms;
    if (!sessionId || !duration || duration <= 0) return;
    const api = input.cost?.total_api_duration_ms ?? 0;

    const log = readSessionLog();
    const existing = log[sessionId];
    if (existing) {
      existing.last_seen = now;
      const base = existing.baseline_ms ?? 0;
      const baseApi = existing.baseline_api_ms ?? 0;
      existing.duration_ms = Math.max(existing.duration_ms, duration - base);
      existing.api_duration_ms = Math.max(existing.api_duration_ms, api - baseApi);
    } else {
      log[sessionId] = {
        session_id: sessionId,
        project: getProjectId(input),
        started_at: now,
        last_seen: now,
        duration_ms: 0,
        api_duration_ms: 0,
        baseline_ms: duration,
        baseline_api_ms: api,
      };
    }

    for (const key of Object.keys(log)) {
      if (now - log[key].last_seen > retentionMs) delete log[key];
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
 * Render the grouped table inside box-drawing borders. Each day is a full-width
 * section header row; below it a per-project breakdown plus a "Day total" line,
 * with a horizontal rule between every data row. Two duration columns
 * (wall-clock and active API time). Column widths are computed from the content
 * so the table is a clean rectangle.
 *
 * Plain text (printed straight to the terminal), not Markdown.
 */
export function formatSessionsTable(records: SessionRecord[]): string {
  if (records.length === 0) return "No sessions recorded for this range.";

  const groups = aggregateSessions(records);
  const DAY_TOTAL = "Day total";
  const HEAD = ["Day / Project", "wall", "api", "sessions"];

  // Size each column from its cells (the day spans all columns, so it is sized
  // by the full inner width, not the label column).
  const cols: string[][] = [[HEAD[0]], [HEAD[1]], [HEAD[2]], [HEAD[3]]];
  for (const g of groups) {
    for (const p of g.projects) {
      cols[0].push(p.name);
      cols[1].push(formatDuration(p.durationMs));
      cols[2].push(formatDuration(p.apiMs));
      cols[3].push(String(p.count));
    }
    cols[0].push(DAY_TOTAL);
    cols[1].push(formatDuration(g.durationMs));
    cols[2].push(formatDuration(g.apiMs));
    cols[3].push(String(g.count));
  }
  const w = cols.map((col) => Math.max(...col.map((s) => s.length)));
  // Inner width of a full-width (merged) row: all cells + the verticals between.
  const fullW = w.reduce((sum, width) => sum + width + 2, 0) + (w.length - 1);

  const rule = (l: string, m: string, r: string): string =>
    l + w.map((width) => "─".repeat(width + 2)).join(m) + r;
  const row = (cells: string[]): string =>
    "│" + cells.map((c, i) => " " + pad(c, w[i]) + " ").join("│") + "│";
  const fullRow = (text: string): string => "│" + pad(" " + text, fullW) + "│";

  const lines: string[] = [rule("┌", "┬", "┐"), row(HEAD)];
  for (const g of groups) {
    lines.push(rule("├", "┴", "┤")); // close columns into a full-width band
    lines.push(fullRow(g.day));
    lines.push(rule("├", "┬", "┤")); // reopen the columns
    const rows = [
      ...g.projects.map((p) => [p.name, formatDuration(p.durationMs), formatDuration(p.apiMs), String(p.count)]),
      [DAY_TOTAL, formatDuration(g.durationMs), formatDuration(g.apiMs), String(g.count)],
    ];
    rows.forEach((r, ri) => {
      if (ri > 0) lines.push(rule("├", "┼", "┤"));
      lines.push(row(r));
    });
  }
  lines.push(rule("└", "┴", "┘"));
  return lines.join("\n");
}
