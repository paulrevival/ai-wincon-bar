# SKILL.md Autoupdate + Project-Scoped Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автообновлять установленный SKILL.md до bundled-версии по содержимому и перевести кэш статус-бара на формат с привязкой к проекту, чтобы одновременная работа в нескольких проектах не конфликтовала.

**Architecture:** (A) В `setup.ts` добавляется тестируемое ядро `updateSkillFile()` + тонкая обёртка `upgradeSkill()`, вызываемая в начале `handleInteractive()`. (B) `cache.json` становится map'ом `{ [projectId]: { data, ts, session_id } }`; `projectId = workspace.project_dir ?? cwd ?? "__default__"`; TTL-eviction в `writeCache`, `readCache` остаётся read-only; `pickRenderData` передаёт `session_id` + `projectId` в `readCache`.

**Tech Stack:** TypeScript (strict, ESM с `.js`-импортами), Node ≥18, tsup (сборка), vitest (тесты), commander, @inquirer/*.

## Global Constraints

- Node.js ≥ 18; исходники — ESM, все intra-импорты используют расширение `.js` (например `./config.js`).
- TypeScript strict (`tsconfig.json`), `"type": "module"`.
- Тесты — vitest. Изоляция через env-переменные: `AI_WINCON_BAR_DIR` (data dir), `AI_WINCON_BAR_SETTINGS_PATH` (settings.json), и новый `AI_WINCON_BAR_SKILLS_DIR` (skills dir) — все по единому паттерну env-overridable хелперов в `src/config.ts`/`src/setup.ts`.
- Проверка типов: `npm run lint` (`tsc --noEmit`). Тесты: `npm test`. Сборка: `npm run build`.
- Конвенция коммитов: conventional commits (`feat:`, `fix:`, `refactor:`, `test:`).

**Спека:** `docs/superpowers/specs/2026-06-17-skill-autoupdate-and-project-cache.md`

---

## Task 1: Тестируемое ядро обновления SKILL.md (`updateSkillFile` + `getSkillDestPath`)

**Files:**
- Modify: `src/setup.ts`
- Create: `tests/setup.test.ts`

**Interfaces:**
- Consumes: ничего (первая задача).
- Produces:
  - `getSkillDestPath(): string` — путь назначения SKILL.md (`<AI_WINCON_BAR_SKILLS_DIR ?? ~/.claude/skills/ai-wincon-bar>/SKILL.md`).
  - `updateSkillFile(destPath: string, srcContent: string): boolean` — перезаписывает `destPath` содержимым `srcContent`, если оно различается. `true` если перезаписал, `false` если dest не существует или уже актуален.

- [ ] **Step 1: Write the failing test**

Создать `tests/setup.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL — `getSkillDestPath` / `updateSkillFile` не экспортируются из `setup.js`.

- [ ] **Step 3: Write minimal implementation**

Добавить в начало `src/setup.ts` (после существующих импортов, до `ELEMENT_CHOICES`). Импорты `homedir`, `join`, `existsSync`, `readFileSync`, `writeFileSync` уже присутствуют — проверить и при необходимости дополнить import-строки `node:fs`/`node:path`/`node:os`.

```ts
/** Путь назначения SKILL.md. Env-overridable (AI_WINCON_BAR_SKILLS_DIR) для тестов. */
export function getSkillDestPath(): string {
  const dir = process.env.AI_WINCON_BAR_SKILLS_DIR
    ?? join(homedir(), ".claude", "skills", "ai-wincon-bar");
  return join(dir, "SKILL.md");
}

/**
 * Перезаписать dest содержимым src, если оно различается.
 * true — файл обновлён; false — dest не существует или уже актуален.
 */
export function updateSkillFile(destPath: string, srcContent: string): boolean {
  if (!existsSync(destPath)) return false;
  if (readFileSync(destPath, "utf-8") === srcContent) return false;
  writeFileSync(destPath, srcContent, "utf-8");
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/setup.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add src/setup.ts tests/setup.test.ts
git commit -m "feat(setup): add testable skill-update core (getSkillDestPath, updateSkillFile)"
```

---

## Task 2: Обёртка `upgradeSkill()` + рефакторинг `installSkill()` + вызов в `handleInteractive()`

**Files:**
- Modify: `src/setup.ts` (текущая `installSkill`)
- Modify: `src/interactive.ts`
- Modify: `tests/setup.test.ts`

**Interfaces:**
- Consumes: `getSkillDestPath`, `updateSkillFile` (из Task 1).
- Produces:
  - `resolveBundledSkillPath(): string | null` (private).
  - `upgradeSkill(): void` — тихо обновляет уже установленный SKILL.md; no-op если не установлен / уже актуален / dev-режим.
  - `installSkill(): void` — рефакторится использовать `getSkillDestPath()` + `resolveBundledSkillPath()` (поведение без изменений).

- [ ] **Step 1: Write the failing test**

В `tests/setup.test.ts` обновить импорт и добавить `describe("upgradeSkill", ...)`. Логика собственно перезаписи уже покрыта в Task 1 (`updateSkillFile`); здесь проверяются no-op-ветки `upgradeSkill`:

```ts
import { getSkillDestPath, updateSkillFile, upgradeSkill } from "../src/setup.js";
```

```ts
describe("upgradeSkill", () => {
  it("is a no-op when bundled source is absent (dev mode) — does not throw", () => {
    const dest = join(TMP_DIR, "SKILL.md");
    writeFileSync(dest, "old", "utf-8");
    // В тестах bundled SKILL.md рядом с dist не существует → resolveBundledSkillPath() = null.
    expect(() => upgradeSkill()).not.toThrow();
    expect(readFileSync(dest, "utf-8")).toBe("old");
  });

  it("does not create the file when not installed", () => {
    const dest = join(TMP_DIR, "SKILL.md");
    expect(existsSync(dest)).toBe(false);
    expect(() => upgradeSkill()).not.toThrow();
    expect(existsSync(dest)).toBe(false);
  });
});
```

> Хэппи-путь (обновление при расхождении) проверяется вручную после сборки (Step 6), т.к. требует bundled `SKILL.md` рядом со скомпилированным `dist/index.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setup.test.ts`
Expected: FAIL — `upgradeSkill` не экспортируется.

- [ ] **Step 3: Write minimal implementation**

В `src/setup.ts` добавить `resolveBundledSkillPath` и `upgradeSkill`, заменить существующую `installSkill`. `dirname`, `fileURLToPath`, `mkdirSync` уже импортируются.

```ts
/** Путь к bundled SKILL.md либо null, если запущены из исходников (файла рядом нет). */
function resolveBundledSkillPath(): string | null {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const skillSource = join(thisDir, "..", "SKILL.md");
  return existsSync(skillSource) ? skillSource : null;
}

/**
 * Установить SKILL.md при первом запуске (вызывается из runSetup после confirm).
 * No-op, если уже установлен или запущены из исходников.
 */
export function installSkill(): void {
  const skillDest = getSkillDestPath();
  if (existsSync(skillDest)) return;
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  mkdirSync(dirname(skillDest), { recursive: true });
  writeFileSync(skillDest, readFileSync(skillSource, "utf-8"), "utf-8");
  console.log("✅ Skill installed to ~/.claude/skills/ai-wincon-bar/SKILL.md");
}

/**
 * Тихо обновить уже установленный SKILL.md до bundled-версии, если содержимое разошлось.
 * No-op, если файл не установлен (установка — через setup), уже актуален, или запущены из исходников.
 */
export function upgradeSkill(): void {
  const skillDest = getSkillDestPath();
  if (!existsSync(skillDest)) return;
  const skillSource = resolveBundledSkillPath();
  if (!skillSource) return;
  if (updateSkillFile(skillDest, readFileSync(skillSource, "utf-8"))) {
    console.log("✅ SKILL.md обновлён до актуальной версии");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/setup.test.ts`
Expected: PASS (все тесты setup).

- [ ] **Step 5: Wire upgradeSkill into handleInteractive**

В `src/interactive.ts` обновить импорт `setup.js` и вызвать `upgradeSkill()` первой строкой тела `handleInteractive`:

```ts
import { runSetup, upgradeSkill } from "./setup.js";

export async function handleInteractive(): Promise<void> {
  console.log("\n🪟 ai-wincon-bar — Context Window Usage Bar\n");
  upgradeSkill();

  if (isConfigured()) {
    // ... остальное без изменений
```

- [ ] **Step 6: Type-check + build + ручная проверка хэппи-пути**

Run: `npm run lint && npm run build`
Expected: оба без ошибок.

Ручная проверка: подменить локальный `~/.claude/skills/ai-wincon-bar/SKILL.md` устаревшим контентом (или задать `AI_WINCON_BAR_SKILLS_DIR` во временной папке с копией), запустить `node dist/index.js` без аргументов — файл должен обновиться, в выводе `✅ SKILL.md обновлён до актуальной версии`.

- [ ] **Step 7: Commit**

```bash
git add src/setup.ts src/interactive.ts tests/setup.test.ts
git commit -m "feat(setup): auto-update installed SKILL.md when content diverges"
```

---

## Task 3: Типы для project-scoped кэша + `getProjectId()`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/constants.ts`
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces:
  - `ClaudeStatusInput.cwd?: string`, `ClaudeStatusInput.workspace?: { project_dir?: string; current_dir?: string; [key: string]: unknown }`.
  - `CacheEntry.session_id?: string`, `CacheMap = Record<string, CacheEntry>` (в `constants.ts`).
  - `getProjectId(input: ClaudeStatusInput): string` — `workspace.project_dir ?? cwd ?? "__default__"`.

- [ ] **Step 1: Write the failing test**

В `tests/config.test.ts` добавить `getProjectId` в импорт из `../src/config.js` и новый `describe` в конце файла:

```ts
describe("getProjectId", () => {
  it("prefers workspace.project_dir", () => {
    const input = {
      cwd: "/cwd",
      workspace: { project_dir: "/project" },
      context_window: { used_percentage: 1 },
    } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("/project");
  });

  it("falls back to cwd when workspace.project_dir absent", () => {
    const input = { cwd: "/cwd", context_window: { used_percentage: 1 } } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("/cwd");
  });

  it("returns __default__ when neither is present", () => {
    const input = { context_window: { used_percentage: 1 } } as ClaudeStatusInput;
    expect(getProjectId(input)).toBe("__default__");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts -t "getProjectId"`
Expected: FAIL — `getProjectId` не экспортируется; поля `workspace` нет в типе.

- [ ] **Step 3: Extend types**

В `src/types.ts` добавить `cwd` и `workspace` в `ClaudeStatusInput` (после `session_id?: string;`):

```ts
export interface ClaudeStatusInput {
  session_id?: string;
  cwd?: string;
  workspace?: {
    project_dir?: string;
    current_dir?: string;
    [key: string]: unknown;
  };
  context_window: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
  };
  model?: {
    id: string;
    display_name?: string;
  };
  rate_limits?: {
    five_hour?: {
      used_percentage: number;
      resets_at: string;
    };
    seven_day?: {
      used_percentage: number;
      resets_at: string;
    };
  };
  [key: string]: unknown;
}
```

В `src/constants.ts` обновить `CacheEntry` и добавить `CacheMap`:

```ts
/** Cache entry with timestamp for TTL-based expiration */
export interface CacheEntry {
  data: unknown;
  ts: number;
  session_id?: string;
}

/** Per-project cache map: { [projectId]: CacheEntry } */
export type CacheMap = Record<string, CacheEntry>;
```

- [ ] **Step 4: Implement getProjectId**

В `src/config.ts` обновить импорт из `./constants.js` (добавить типы `CacheEntry`, `CacheMap`) и добавить функцию рядом с path-хелперами:

```ts
import { DEFAULT_CONFIG, CONFIG_FILENAME, CACHE_TTL_MS } from "./constants.js";
import type { CacheEntry, CacheMap } from "./constants.js";

/** Идентификатор проекта — ключ в per-project кэше. */
export function getProjectId(input: ClaudeStatusInput): string {
  return input.workspace?.project_dir ?? input.cwd ?? "__default__";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts -t "getProjectId"`
Expected: PASS (3 теста).

- [ ] **Step 6: Type-check + full test run**

Run: `npm run lint`
Expected: PASS — `CacheEntry.session_id` опционально, `CacheMap` добавлен, но пока не используется; старый формат `readCache`/`writeCache` всё ещё валиден.

Run: `npm test`
Expected: PASS — `getProjectId` (новый) + все существующие тесты кэша (старый формат ещё действует).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/constants.ts src/config.ts tests/config.test.ts
git commit -m "feat(cache): add project-id derivation + session_id to CacheEntry"
```

---

## Task 4: Кэш на per-project map (`readCache` + `writeCache` + `pickRenderData`)

> Формат `cache.json` меняется с одной записи `{ data, ts }` на map по проектам. `readCache`, `writeCache` и `pickRenderData` меняются вместе — это атомарный сдвиг формата данных; раздельное коммиты оставили бы красные/бессмысленные тестовые окна.

**Files:**
- Modify: `src/config.ts` (`readCache`, `writeCache`, `pickRenderData`, + private `readCacheMap`, `evictExpired`)
- Modify: `tests/config.test.ts` (`makeInput`, cache read/write/clear/pickRenderData describe-блоки)

**Interfaces:**
- Consumes: `CacheMap`, `getProjectId` (Task 3).
- Produces:
  - `readCache(currentSessionId?: string, projectId?: string): ClaudeStatusInput | null` — map-формат, TTL/session/legacy-проверки, read-only (не пишет файл).
  - `readCacheMap(): CacheMap` (private) — читать cache.json как map, legacy → `{}`.
  - `writeCache(input: ClaudeStatusInput): void` — обновляет одну запись проекта, сносит протухшие, пишет файл.
  - `evictExpired(map: CacheMap): CacheMap` (private).
  - `pickRenderData(input: ClaudeStatusInput): ClaudeStatusInput` — передаёт `input.session_id` + `getProjectId(input)` в `readCache`.

- [ ] **Step 1: Update `makeInput` and rewrite cache + pickRenderData tests for the map format**

В `tests/config.test.ts` обновить `makeInput` (поля проекта/сессии по умолчанию):

```ts
function makeInput(usedPct: number, tokens = 90_000): ClaudeStatusInput {
  return {
    session_id: "S",
    workspace: { project_dir: "/test/project" },
    cwd: "/test/project",
    context_window: {
      total_input_tokens: tokens,
      total_output_tokens: 0,
      context_window_size: 1_000_000,
      used_percentage: usedPct,
      remaining_percentage: 100 - usedPct,
    },
  };
}
```

Удалить старые `describe("writeCache + readCache", …)` и `describe("pickRenderData", …)` и заменить вместе с `clearCache` на три новых блока:

```ts
describe("readCache (map format)", () => {
  it("returns null when no cache file exists", () => {
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns null for malformed cache", () => {
    writeFileSync(getCachePath(), "garbage", "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns data for a fresh same-project, same-session entry", () => {
    writeCache(makeInput(42));
    const cached = readCache("S", "/test/project");
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
  });

  it("returns null for expired entry (TTL)", () => {
    const entry = { data: makeInput(50), ts: Date.now() - 11_000, session_id: "S" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns null when used_percentage is 0", () => {
    const entry = { data: makeInput(0, 0), ts: Date.now(), session_id: "S" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });

  it("returns null when session_id differs (stale after /clear)", () => {
    const entry = { data: makeInput(50), ts: Date.now(), session_id: "OLD" };
    writeFileSync(getCachePath(), JSON.stringify({ "/test/project": entry }), "utf-8");
    expect(readCache("NEW", "/test/project")).toBeNull();
  });

  it("returns null for a different project (isolation)", () => {
    writeCache(makeInput(50));
    expect(readCache("S", "/other/project")).toBeNull();
  });

  it("treats legacy { data, ts } format as absent (returns null)", () => {
    const legacy = { data: makeInput(50), ts: Date.now() };
    writeFileSync(getCachePath(), JSON.stringify(legacy), "utf-8");
    expect(readCache("S", "/test/project")).toBeNull();
  });
});

describe("writeCache (map format)", () => {
  it("writes a per-project entry readable by readCache", () => {
    writeCache(makeInput(42));
    const cached = readCache("S", "/test/project");
    expect(cached).not.toBeNull();
    expect(cached!.context_window.used_percentage).toBe(42);
  });

  it("stores session_id alongside data", () => {
    writeCache(makeInput(50));
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/test/project"].session_id).toBe("S");
  });

  it("preserves other projects' entries", () => {
    const map = {
      "/other/project": { data: makeInput(99), ts: Date.now(), session_id: "X" },
    };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
    writeCache(makeInput(42)); // project /test/project
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/other/project"]).toBeDefined();
    expect(raw["/test/project"]).toBeDefined();
  });

  it("evicts expired entries on write", () => {
    const map = {
      "/stale/project": { data: makeInput(10), ts: Date.now() - 11_000, session_id: "Y" },
    };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
    writeCache(makeInput(42)); // снесёт /stale/project, запишет /test/project
    const raw = JSON.parse(readFileSync(getCachePath(), "utf-8"));
    expect(raw["/stale/project"]).toBeUndefined();
    expect(raw["/test/project"]).toBeDefined();
  });

  it("does not throw on a normal write (non-critical)", () => {
    expect(() => writeCache(makeInput(42))).not.toThrow();
  });
});

describe("clearCache", () => {
  it("removes cache file", () => {
    writeCache(makeInput(50));
    expect(existsSync(getCachePath())).toBe(true);
    clearCache();
    expect(existsSync(getCachePath())).toBe(false);
  });

  it("does not throw when no cache file", () => {
    expect(() => clearCache()).not.toThrow();
  });
});

describe("pickRenderData", () => {
  function withSession(
    input: ClaudeStatusInput,
    session_id: string,
    project = "/test/project",
  ): ClaudeStatusInput {
    return { ...input, session_id, workspace: { project_dir: project }, cwd: project };
  }

  it("caches and renders real data (used_percentage > 0)", () => {
    const result = pickRenderData(withSession(makeInput(42, 90_000), "S"));
    expect(result.context_window.used_percentage).toBe(42);
    expect(readCache("S", "/test/project")?.context_window.used_percentage).toBe(42);
  });

  it("falls back to fresh same-project, same-session cache on a zero burst", () => {
    pickRenderData(withSession(makeInput(42, 90_000), "S"));
    const burst = withSession(makeInput(0, 0), "S");
    expect(pickRenderData(burst).context_window.used_percentage).toBe(42);
  });

  it("ignores stale same-project cache after /clear (new session, zero burst)", () => {
    pickRenderData(withSession(makeInput(45, 90_000), "OLD"));
    const afterClear = withSession(makeInput(0, 0), "NEW");
    const result = pickRenderData(afterClear);
    expect(result.context_window.used_percentage).toBe(0);
    expect(result.session_id).toBe("NEW");
  });

  it("does NOT leak another project's cache during a zero burst", () => {
    pickRenderData(withSession(makeInput(77, 90_000), "SA", "/proj-a"));
    const burstB = withSession(makeInput(0, 0), "SB", "/proj-b");
    expect(pickRenderData(burstB).context_window.used_percentage).toBe(0);
  });

  it("independent zero-burst fallback per project (both valid)", () => {
    pickRenderData(withSession(makeInput(30, 90_000), "SA", "/proj-a"));
    pickRenderData(withSession(makeInput(60, 90_000), "SB", "/proj-b"));
    expect(pickRenderData(withSession(makeInput(0, 0), "SA", "/proj-a")).context_window.used_percentage).toBe(30);
    expect(pickRenderData(withSession(makeInput(0, 0), "SB", "/proj-b")).context_window.used_percentage).toBe(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — текущие `readCache`/`writeCache`/`pickRenderData` используют старый формат и старые сигнатуры.

- [ ] **Step 3: Implement readCacheMap, evictExpired, readCache, writeCache, pickRenderData**

В `src/config.ts` заменить существующие `readCache`, `writeCache` и `pickRenderData`, добавить приватные `readCacheMap` и `evictExpired`:

```ts
/** Прочитать cache.json как CacheMap. Legacy-формат { data, ts } → пустой map. */
function readCacheMap(): CacheMap {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf-8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      parsed.data &&
      typeof parsed.data === "object" &&
      "context_window" in parsed.data
    ) {
      return {}; // legacy single-entry format
    }
    return parsed as CacheMap;
  } catch {
    return {};
  }
}

/** Удалить из map записи старше CACHE_TTL_MS (на месте). */
function evictExpired(map: CacheMap): CacheMap {
  const now = Date.now();
  for (const key of Object.keys(map)) {
    if (now - map[key].ts > CACHE_TTL_MS) {
      delete map[key];
    }
  }
  return map;
}

/**
 * Read cached status data for a project/session if it exists and is fresh.
 * Read-only — не перезаписывает файл (вызывается на каждом рендере).
 *
 * TTL: запись старше CACHE_TTL_MS игнорируется.
 * Session: если currentSessionId и сохранённый session_id не совпадают — игнорируется
 * (сброс после /clear; теперь per-project).
 * Legacy-формат { data, ts } трактуется как отсутствие кэша.
 */
export function readCache(
  currentSessionId?: string,
  projectId?: string,
): ClaudeStatusInput | null {
  const map = readCacheMap();
  const key = projectId ?? "__default__";
  const entry = map[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null;
  const data = entry.data as ClaudeStatusInput;
  if (!data.context_window || data.context_window.used_percentage <= 0) return null;
  if (currentSessionId && entry.session_id && entry.session_id !== currentSessionId) {
    return null;
  }
  return data;
}

/**
 * Write current status data to the per-project cache map with timestamp + session_id.
 * Evicts expired entries before writing. Failure is non-critical (silent).
 */
export function writeCache(input: ClaudeStatusInput): void {
  try {
    ensureDataDir();
    const map = evictExpired(readCacheMap());
    map[getProjectId(input)] = { data: input, ts: Date.now(), session_id: input.session_id };
    writeFileSync(getCachePath(), JSON.stringify(map), "utf-8");
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Decide which status data to render for a given Claude Code status update.
 *
 * Real data (used_percentage > 0) is cached (per project) and rendered directly.
 * A zero burst falls back to a fresh same-project, same-session cache entry so
 * brief gaps (e.g. during /compact) don't blank the bar. After /clear the session
 * changes, so a stale entry from the previous session is ignored. Different
 * projects keep independent cache slots.
 */
export function pickRenderData(input: ClaudeStatusInput): ClaudeStatusInput {
  if (input.context_window.used_percentage > 0) {
    writeCache(input);
    return input;
  }
  const cached = readCache(input.session_id, getProjectId(input));
  return cached ?? input;
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npm test`
Expected: PASS — весь набор (config + format + render + setup).

- [ ] **Step 5: Type-check + build**

Run: `npm run lint && npm run build`
Expected: оба без ошибок.

- [ ] **Step 6: Manual smoke test (optional but recommended)**

Запустить статус-бар с реальным инпутом:
```bash
echo '{"session_id":"s1","workspace":{"project_dir":"/proj-a"},"cwd":"/proj-a","context_window":{"total_input_tokens":90000,"total_output_tokens":5000,"context_window_size":200000,"used_percentage":45,"remaining_percentage":55"},"model":{"id":"x","display_name":"X"}}' | node dist/index.js
```
Expected: строка статус-бара `[X] | ▓▓▓▓▓░░░░░ | 45% | 95K/200K`.

Проверить формат кэша: `cat ~/.claude/ai-wincon-bar/cache.json` должен показать map с ключом `/proj-a`.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(cache): per-project map with TTL eviction + project-scoped pickRenderData"
```

---

## Definition of Done

- `npm test`, `npm run lint`, `npm run build` — зелёные.
- Решение A: при расхождении установленного SKILL.md с bundled запуск `ai-wincon-bar config` обновляет файл и пишет `✅ SKILL.md обновлён до актуальной версии`; при актуальности — тихо.
- Решение B: `cache.json` — map по `projectId`; два проекта не конфликтуют; `/clear` сбрасывает только текущий проект; TTL-eviction работает; legacy-формат не валит чтение.
- Подтверждено отсутствующим (вне scope): `/reload-skills`, top-N eviction, сравнение версий пакета.
