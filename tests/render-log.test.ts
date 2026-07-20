import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  classifyRender,
  buildRenderLogEntry,
  appendRenderLog,
  localIsoTimestamp,
} from "../src/render-log.js";
import { getRenderLogPath } from "../src/config.js";
import type { ClaudeStatusInput } from "../src/types.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-render-log-test-" + process.pid);

interface InputOpts {
  sid?: string;
  dur?: number;
  api?: number;
  project?: string;
  withCost?: boolean;
}

function makeInput(opts: InputOpts = {}): ClaudeStatusInput {
  const { sid, dur = 0, api = 0, project = "/test/project", withCost = true } = opts;
  return {
    ...(sid === undefined ? {} : { session_id: sid }),
    workspace: { project_dir: project },
    cwd: project,
    context_window: {
      total_input_tokens: 1,
      total_output_tokens: 1,
      context_window_size: 100,
      used_percentage: 10,
      remaining_percentage: 90,
    },
    ...(withCost ? { cost: { total_duration_ms: dur, total_api_duration_ms: api } } : {}),
  } as ClaudeStatusInput;
}

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.AI_WINCON_BAR_DIR = TMP_DIR;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_DIR;
});

function readLines(): string[] {
  return readFileSync(getRenderLogPath(), "utf-8").split("\n").filter(Boolean);
}

// ─── localIsoTimestamp ───────────────────────────────────

describe("localIsoTimestamp", () => {
  it("produces a local ISO-8601 string with an offset", () => {
    expect(localIsoTimestamp(new Date(2026, 6, 20, 12, 23, 51))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
  });

  it("keeps the local wall-clock components of the given instant", () => {
    // Constructed in local time, so the timestamp must echo those components
    // regardless of the machine's timezone.
    expect(localIsoTimestamp(new Date(2026, 6, 20, 12, 23, 51))).toContain("2026-07-20T12:23:51");
  });
});

// ─── classifyRender ──────────────────────────────────────

describe("classifyRender", () => {
  it("is ok with a session_id and positive duration", () => {
    expect(classifyRender(makeInput({ sid: "S", dur: 1000 }))).toBe("ok");
  });

  it("is no_session_id when session_id is absent", () => {
    expect(classifyRender(makeInput({ sid: undefined, dur: 1000 }))).toBe("no_session_id");
  });

  it("is no_cost when cost is absent entirely", () => {
    expect(classifyRender(makeInput({ sid: "S", withCost: false }))).toBe("no_cost");
  });

  it("is duration_le_zero when duration is 0", () => {
    expect(classifyRender(makeInput({ sid: "S", dur: 0 }))).toBe("duration_le_zero");
  });

  it("is duration_le_zero when duration is negative", () => {
    expect(classifyRender(makeInput({ sid: "S", dur: -5 }))).toBe("duration_le_zero");
  });
});

// ─── buildRenderLogEntry ─────────────────────────────────

describe("buildRenderLogEntry", () => {
  it("includes project/dur/api for an ok render", () => {
    const entry = buildRenderLogEntry(makeInput({ sid: "S", dur: 59449, api: 13082 }), new Date(2026, 6, 20));
    expect(entry.result).toBe("ok");
    expect(entry.sid).toBe("S");
    expect(entry.project).toBe("/test/project");
    expect(entry.dur).toBe(59449);
    expect(entry.api).toBe(13082);
  });

  it("carries sid: null and omits payload fields for a skipped render", () => {
    const entry = buildRenderLogEntry(makeInput({ sid: undefined }), new Date(2026, 6, 20));
    expect(entry.result).toBe("no_session_id");
    expect(entry.sid).toBeNull();
    expect(entry.project).toBeUndefined();
    expect(entry.dur).toBeUndefined();
    expect(entry.api).toBeUndefined();
  });
});

// ─── appendRenderLog ─────────────────────────────────────

describe("appendRenderLog", () => {
  it("creates the file and appends one JSONL line per render", () => {
    expect(existsSync(getRenderLogPath())).toBe(false);
    appendRenderLog(makeInput({ sid: "S", dur: 1000 }), new Date(2026, 6, 20, 9, 0, 0));
    appendRenderLog(makeInput({ sid: undefined }), new Date(2026, 6, 20, 9, 0, 5));

    const lines = readLines();
    expect(lines.length).toBe(2);
    const [first, second] = lines.map((l) => JSON.parse(l));
    expect(first.result).toBe("ok");
    expect(first.sid).toBe("S");
    expect(second.result).toBe("no_session_id");
    expect(second.sid).toBeNull();
  });

  it("does not throw on a normal write", () => {
    expect(() => appendRenderLog(makeInput({ sid: "S", dur: 1000 }))).not.toThrow();
  });
});
