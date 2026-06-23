import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readRecentCompactPostTokens } from "../src/compact.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-compact-test-" + process.pid);

/** ISO-8601 timestamp from an epoch-ms value. */
function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** A `system / compact_boundary` transcript line as Claude Code writes it. */
function boundaryLine(tsMs: number, postTokens: number): string {
  return JSON.stringify({
    type: "system",
    subtype: "compact_boundary",
    timestamp: iso(tsMs),
    compactMetadata: { trigger: "manual", preTokens: 192491, postTokens },
  });
}

/** An ordinary assistant line (no boundary). */
function msgLine(tsMs: number): string {
  return JSON.stringify({
    type: "assistant",
    timestamp: iso(tsMs),
    message: { usage: { input_tokens: 1, output_tokens: 2 } },
  });
}

function writeTranscript(name: string, lines: string[]): string {
  const path = join(TMP_DIR, name);
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
  return path;
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("readRecentCompactPostTokens", () => {
  it("returns postTokens for a compact_boundary newer than afterTs", () => {
    const after = Date.now() - 60_000;
    const path = writeTranscript("t.jsonl", [
      msgLine(after - 10_000),
      boundaryLine(after + 30_000, 14837),
    ]);
    expect(readRecentCompactPostTokens(path, after)).toBe(14837);
  });

  it("returns null when the latest boundary is not newer than afterTs", () => {
    // Cache reading already postdates the compaction → nothing to correct.
    const after = Date.now();
    const path = writeTranscript("t.jsonl", [boundaryLine(after - 30_000, 14837)]);
    expect(readRecentCompactPostTokens(path, after)).toBeNull();
  });

  it("returns null when no compact_boundary is present", () => {
    const after = Date.now() - 60_000;
    const path = writeTranscript("t.jsonl", [
      msgLine(after + 1_000),
      msgLine(after + 2_000),
    ]);
    expect(readRecentCompactPostTokens(path, after)).toBeNull();
  });

  it("returns null for a nonexistent transcript file", () => {
    expect(
      readRecentCompactPostTokens(join(TMP_DIR, "nope.jsonl"), Date.now() - 1000),
    ).toBeNull();
  });

  it("returns the most recent boundary's postTokens when several exist", () => {
    const after = Date.now() - 120_000;
    const path = writeTranscript("t.jsonl", [
      boundaryLine(after + 10_000, 11111),
      msgLine(after + 20_000),
      boundaryLine(after + 30_000, 22222),
    ]);
    expect(readRecentCompactPostTokens(path, after)).toBe(22222);
  });

  it("tolerates an unparseable line and still finds the boundary", () => {
    const after = Date.now() - 60_000;
    const path = writeTranscript("t.jsonl", [
      '{"partial": "broken json line',
      boundaryLine(after + 30_000, 14837),
    ]);
    expect(readRecentCompactPostTokens(path, after)).toBe(14837);
  });

  it("ignores a boundary whose postTokens is missing or non-positive", () => {
    const after = Date.now() - 60_000;
    const path = writeTranscript("t.jsonl", [
      JSON.stringify({
        type: "system",
        subtype: "compact_boundary",
        timestamp: iso(after + 30_000),
        compactMetadata: { trigger: "manual", preTokens: 100 },
      }),
    ]);
    expect(readRecentCompactPostTokens(path, after)).toBeNull();
  });

  it("short-circuits via mtime: skips reading when mtime is not newer than afterTs", () => {
    const after = Date.now();
    // Content boundary is newer than afterTs, but the file's mtime predates it,
    // so the cheap mtime gate must return null without scanning.
    const path = writeTranscript("t.jsonl", [boundaryLine(after + 30_000, 14837)]);
    const past = new Date(after - 30_000);
    utimesSync(path, past, past);
    expect(readRecentCompactPostTokens(path, after)).toBeNull();
  });
});
