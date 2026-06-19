import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readSessionLog,
  recordSession,
  localDateKey,
  recordsInRange,
  aggregateSessions,
  formatSessionsTable,
} from "../src/sessions.js";
import { getSessionsPath } from "../src/config.js";
import type { SessionRecord } from "../src/sessions.js";
import type { ClaudeStatusInput } from "../src/types.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-sessions-test-" + process.pid);

function makeInput(
  session_id: string | undefined,
  durMs: number | undefined,
  apiMs = 0,
  project = "/test/project",
): ClaudeStatusInput {
  return {
    session_id,
    workspace: { project_dir: project },
    cwd: project,
    context_window: {
      total_input_tokens: 1,
      total_output_tokens: 1,
      context_window_size: 100,
      used_percentage: 10,
      remaining_percentage: 90,
    },
    cost: { total_duration_ms: durMs, total_api_duration_ms: apiMs },
  };
}

function rec(partial: Partial<SessionRecord> & { session_id: string }): SessionRecord {
  return {
    project: "/test/project",
    started_at: 0,
    last_seen: 0,
    duration_ms: 0,
    api_duration_ms: 0,
    ...partial,
  };
}

/** Local midnight epoch for a Y/M/D (month 1-based here for readability). */
function day(y: number, m: number, d: number, h = 10): number {
  return new Date(y, m - 1, d, h, 0, 0).getTime();
}

function readRaw(): Record<string, SessionRecord> {
  return JSON.parse(readFileSync(getSessionsPath(), "utf-8"));
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.AI_WINCON_BAR_DIR = TMP_DIR;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_DIR;
});

// ─── localDateKey ────────────────────────────────────────

describe("localDateKey", () => {
  it("formats local epoch as YYYY-MM-DD", () => {
    expect(localDateKey(day(2026, 6, 19))).toBe("2026-06-19");
  });

  it("zero-pads single-digit month and day", () => {
    expect(localDateKey(day(2026, 1, 5))).toBe("2026-01-05");
  });
});

// ─── readSessionLog ──────────────────────────────────────

describe("readSessionLog", () => {
  it("returns empty map when no file exists", () => {
    expect(readSessionLog()).toEqual({});
  });

  it("returns empty map for malformed JSON", () => {
    writeFileSync(getSessionsPath(), "garbage{{{", "utf-8");
    expect(readSessionLog()).toEqual({});
  });

  it("returns the parsed map", () => {
    const map = { S: rec({ session_id: "S", duration_ms: 5 }) };
    writeFileSync(getSessionsPath(), JSON.stringify(map), "utf-8");
    expect(readSessionLog().S.duration_ms).toBe(5);
  });
});

// ─── recordSession ───────────────────────────────────────

describe("recordSession", () => {
  it("baselines a new record to zero at started_at = now", () => {
    recordSession(makeInput("S", 600_000, 120_000), 1_000_000);
    const r = readRaw().S;
    expect(r.started_at).toBe(1_000_000);
    expect(r.last_seen).toBe(1_000_000);
    expect(r.duration_ms).toBe(0);
    expect(r.api_duration_ms).toBe(0);
    expect(r.project).toBe("/test/project");
  });

  it("accumulates the delta from the first-sighting baseline", () => {
    recordSession(makeInput("S", 600_000, 120_000), 1_000_000);
    recordSession(makeInput("S", 900_000, 200_000), 2_000_000);
    const r = readRaw().S;
    expect(r.duration_ms).toBe(300_000); // 900_000 - 600_000
    expect(r.api_duration_ms).toBe(80_000); // 200_000 - 120_000
    expect(r.last_seen).toBe(2_000_000);
    expect(r.started_at).toBe(1_000_000); // preserved from first sighting
  });

  it("never shrinks duration on a smaller reading", () => {
    recordSession(makeInput("S", 600_000, 120_000), 1_000_000);
    recordSession(makeInput("S", 900_000, 200_000), 2_000_000);
    recordSession(makeInput("S", 100_000, 10_000), 3_000_000);
    const r = readRaw().S;
    expect(r.duration_ms).toBe(300_000);
    expect(r.api_duration_ms).toBe(80_000);
  });

  it("does not double-count when /clear rotates session_id mid-process", () => {
    // Claude Code's total_duration_ms is per-process and keeps climbing across
    // /clear; only the session_id rotates. Each record must own just its own slice.
    recordSession(makeInput("A", 600_000, 120_000), 1_000_000);
    recordSession(makeInput("A", 900_000, 200_000), 1_300_000); // A → 900s
    // /clear: new session B, process clock continues from ~900s.
    recordSession(makeInput("B", 900_000, 200_000), 1_400_000);
    recordSession(makeInput("B", 1_100_000, 260_000), 1_600_000); // B → 1100s
    const raw = readRaw();
    expect(raw.A.duration_ms).toBe(300_000); // 900 - 600 (own observed slice)
    expect(raw.B.duration_ms).toBe(200_000); // 1100 - 900, NOT 1100
    expect(raw.B.api_duration_ms).toBe(60_000); // 260 - 200
    // Sum is the real elapsed time, with no overlap between A and B.
    expect(raw.A.duration_ms + raw.B.duration_ms).toBe(500_000);
  });

  it("keeps independent records per session_id", () => {
    recordSession(makeInput("A", 100_000), 1_000_000);
    recordSession(makeInput("B", 200_000), 1_000_000);
    const raw = readRaw();
    expect(Object.keys(raw).sort()).toEqual(["A", "B"]);
  });

  it("skips when session_id is absent", () => {
    recordSession(makeInput(undefined, 600_000), 1_000_000);
    expect(existsSync(getSessionsPath())).toBe(false);
  });

  it("skips when duration is zero or absent", () => {
    recordSession(makeInput("S", 0), 1_000_000);
    recordSession(makeInput("S", undefined), 1_000_000);
    expect(existsSync(getSessionsPath())).toBe(false);
  });

  it("prunes records older than a week on write", () => {
    const now = day(2026, 6, 19);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const seed = {
      stale: rec({ session_id: "stale", last_seen: now - weekMs - 60_000, duration_ms: 1 }),
      fresh: rec({ session_id: "fresh", last_seen: now - 60_000, duration_ms: 1 }),
    };
    writeFileSync(getSessionsPath(), JSON.stringify(seed), "utf-8");
    recordSession(makeInput("new", 600_000), now);
    expect(Object.keys(readRaw()).sort()).toEqual(["fresh", "new"]);
  });

  it("does not throw on a malformed existing file", () => {
    writeFileSync(getSessionsPath(), "not json{{{", "utf-8");
    expect(() => recordSession(makeInput("S", 600_000), 1_000_000)).not.toThrow();
    expect(readRaw().S.duration_ms).toBe(0);
  });
});

// ─── recordsInRange ──────────────────────────────────────

describe("recordsInRange", () => {
  const records: SessionRecord[] = [
    rec({ session_id: "a", started_at: day(2026, 6, 17) }),
    rec({ session_id: "b", started_at: day(2026, 6, 18) }),
    rec({ session_id: "c", started_at: day(2026, 6, 19) }),
  ];

  it("returns all records when range is unbounded", () => {
    expect(recordsInRange(records, {}).map((r) => r.session_id)).toEqual(["a", "b", "c"]);
  });

  it("filters by inclusive since", () => {
    expect(
      recordsInRange(records, { since: "2026-06-18" }).map((r) => r.session_id),
    ).toEqual(["b", "c"]);
  });

  it("filters by inclusive until", () => {
    expect(
      recordsInRange(records, { until: "2026-06-18" }).map((r) => r.session_id),
    ).toEqual(["a", "b"]);
  });

  it("filters to a single day with since == until", () => {
    expect(
      recordsInRange(records, { since: "2026-06-18", until: "2026-06-18" }).map(
        (r) => r.session_id,
      ),
    ).toEqual(["b"]);
  });
});

// ─── aggregateSessions ───────────────────────────────────

describe("aggregateSessions", () => {
  const records: SessionRecord[] = [
    rec({ session_id: "s1", project: "/p/alpha", started_at: day(2026, 6, 18), duration_ms: 1000, api_duration_ms: 100 }),
    rec({ session_id: "s2", project: "/p/alpha", started_at: day(2026, 6, 18), duration_ms: 2000, api_duration_ms: 200 }),
    rec({ session_id: "s3", project: "/p/beta", started_at: day(2026, 6, 18), duration_ms: 500, api_duration_ms: 50 }),
    rec({ session_id: "s4", project: "/p/alpha", started_at: day(2026, 6, 19), duration_ms: 9999, api_duration_ms: 999 }),
  ];

  it("groups by day, most recent first", () => {
    const groups = aggregateSessions(records);
    expect(groups.map((g) => g.day)).toEqual(["2026-06-19", "2026-06-18"]);
  });

  it("splits a day into per-project rows sorted by duration desc", () => {
    const day18 = aggregateSessions(records).find((g) => g.day === "2026-06-18")!;
    expect(day18.projects.map((p) => p.name)).toEqual(["alpha", "beta"]);
    const alpha = day18.projects[0];
    expect(alpha.count).toBe(2);
    expect(alpha.durationMs).toBe(3000);
    expect(alpha.apiMs).toBe(300);
  });

  it("computes per-day totals across projects", () => {
    const day18 = aggregateSessions(records).find((g) => g.day === "2026-06-18")!;
    expect(day18.count).toBe(3);
    expect(day18.durationMs).toBe(3500);
    expect(day18.apiMs).toBe(350);
  });
});

// ─── formatSessionsTable ─────────────────────────────────

describe("formatSessionsTable", () => {
  it("reports when there are no sessions", () => {
    expect(formatSessionsTable([])).toMatch(/no sessions/i);
  });

  it("draws a rectangular bordered table with a header row", () => {
    const records: SessionRecord[] = [
      rec({ session_id: "s1", project: "/p/alpha", started_at: day(2026, 6, 19), duration_ms: 3_600_000, api_duration_ms: 1_800_000 }),
    ];
    const lines = formatSessionsTable(records).split("\n");
    // Corner borders top and bottom.
    expect(lines[0].startsWith("┌")).toBe(true);
    expect(lines[0].endsWith("┐")).toBe(true);
    expect(lines[lines.length - 1].startsWith("└")).toBe(true);
    // Every line is the same display width (table is a rectangle).
    const width = lines[0].length;
    expect(lines.every((l) => l.length === width)).toBe(true);
    // Header row carries every column header, framed by verticals.
    const header = lines.find((l) => l.includes("Day / Project"))!;
    expect(header.startsWith("│")).toBe(true);
    expect(header).toContain("wall");
    expect(header).toContain("api");
    expect(header).toContain("sessions");
  });

  it("gives the date a full-width row and rules between data rows", () => {
    const records: SessionRecord[] = [
      rec({ session_id: "s1", project: "/p/alpha", started_at: day(2026, 6, 19), duration_ms: 3_600_000, api_duration_ms: 1_800_000 }),
      rec({ session_id: "s2", project: "/p/beta", started_at: day(2026, 6, 19), duration_ms: 600_000, api_duration_ms: 60_000 }),
    ];
    const lines = formatSessionsTable(records).split("\n");
    // Date spans the whole table — only the two outer verticals, no column splits.
    const dateLine = lines.find((l) => l.includes("2026-06-19"))!;
    expect((dateLine.match(/│/g) || []).length).toBe(2);
    // 3 data rows (alpha, beta, Day total) → 2 inter-row separators (┼).
    expect(lines.filter((l) => l.includes("┼")).length).toBe(2);
  });

  it("renders day header, project row, durations and a day-total line", () => {
    const records: SessionRecord[] = [
      rec({ session_id: "s1", project: "/p/alpha", started_at: day(2026, 6, 19), duration_ms: 3_600_000, api_duration_ms: 1_800_000 }),
      rec({ session_id: "s2", project: "/p/beta", started_at: day(2026, 6, 19), duration_ms: 600_000, api_duration_ms: 60_000 }),
    ];
    const out = formatSessionsTable(records);
    expect(out).toContain("2026-06-19");
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
    expect(out).toContain("01h:00m"); // alpha wall-clock
    expect(out).toContain("Day total");
    expect(out).toContain("01h:10m"); // day wall-clock total (3.6M + 0.6M = 4.2M = 70m)
  });
});
