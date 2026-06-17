import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getSkillDestPath, updateSkillFile } from "../src/setup.js";

const TMP_DIR = join(tmpdir(), "ai-wincon-bar-skill-test-" + process.pid);

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  process.env.AI_WINCON_BAR_SKILLS_DIR = TMP_DIR;
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.AI_WINCON_BAR_SKILLS_DIR;
});

describe("getSkillDestPath", () => {
  it("respects AI_WINCON_BAR_SKILLS_DIR env override", () => {
    expect(getSkillDestPath()).toBe(join(TMP_DIR, "SKILL.md"));
  });
});

describe("updateSkillFile", () => {
  it("returns false and does nothing when dest does not exist", () => {
    const dest = join(TMP_DIR, "SKILL.md");
    expect(updateSkillFile(dest, "new content")).toBe(false);
    expect(existsSync(dest)).toBe(false);
  });

  it("returns false when dest content is already identical", () => {
    const dest = join(TMP_DIR, "SKILL.md");
    writeFileSync(dest, "same", "utf-8");
    expect(updateSkillFile(dest, "same")).toBe(false);
    expect(readFileSync(dest, "utf-8")).toBe("same");
  });

  it("overwrites and returns true when content differs", () => {
    const dest = join(TMP_DIR, "SKILL.md");
    writeFileSync(dest, "old", "utf-8");
    expect(updateSkillFile(dest, "new")).toBe(true);
    expect(readFileSync(dest, "utf-8")).toBe("new");
  });
});
