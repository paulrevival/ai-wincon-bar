# Дизайн: автообновление SKILL.md + кэш с привязкой к проекту

Дата: 2026-06-17
Ветка: `fix/cache-reset-on-clear`

## Контекст и проблемы

Две независимые задачи, обе затрагивают файлы, которые пакет устанавливает/ведёт в `~/.claude/`.

**Проблема 1 — установленный SKILL.md не обновляется.**
`src/setup.ts:installSkill()` делает ранний `return`, если файл назначения уже существует. Поэтому однажды установленный `~/.claude/skills/ai-wincon-bar/SKILL.md` отстаёт от bundled-версии в пакете (на момент дизайна: 3675 байт локально vs 3804 байта в репо). Обновить его можно только вручную.

**Проблема 2 — общий кэш конфликтует между проектами.**
`~/.claude/ai-wincon-bar/cache.json` — единственный файл. `statusLine` один на глобальный `~/.claude/settings.json`, поэтому при работе в двух проектах одновременно оба пишут в один кэш. Логика `pickRenderData` считает кэш `stale`, если сохранённый `session_id` не совпадает с текущим — а значит запись одного проекта делает кэш невалидным для другого, и бар мигает / показывает 0.

## Решение A — автообновление SKILL.md (по содержимому)

Стратегия: разделить первичную установку (осознанную, через confirm в `runSetup`) и тихое обновление уже установленного файла.

### Изменения в `src/setup.ts`

1. Вынести общий helper поиска bundled-файла (избежать дублирования с `installSkill`):
   ```ts
   /** Путь к bundled SKILL.md либо null, если запущены из исходников (файла рядом нет). */
   function resolveBundledSkillPath(): string | null
   ```
   Реализация — как текущая логика в `installSkill`: `join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md")`, вернуть `null` если не существует.

2. `installSkill()` оставить без изменений — первичная установка, вызывается из `runSetup` после confirm. Внутри неё использовать `resolveBundledSkillPath()` (рефакторинг без смены поведения).

3. Добавить новую функцию:
   ```ts
   /** Тихо обновить уже установленный SKILL.md, если содержимое разошлось с bundled.
    *  No-op, если файл не установлен (установка — через setup) или уже актуален,
    *  либо запущены из исходников. */
   export function upgradeSkill(): void
   ```
   Логика:
   - `dest` не существует → `return` (не установлен → установка через setup).
   - `resolveBundledSkillPath()` === null → `return` (dev-режим).
   - `readFileSync(dest) === readFileSync(src)` → `return` (актуален).
   - иначе: `writeFileSync(dest, src)`, `console.log("✅ SKILL.md обновлён до актуальной версии")`.

   Сравнение — посимвольное строковое (файл ~4 КБ, дёшево). Не используются ни версии пакета, ни хранение метаданных в конфиге.

### Точка вызова

- Первая строка `handleInteractive()` в `src/interactive.ts` (после баннера `🪟 ai-wincon-bar …`). Каждый запуск `ai-wincon-bar` / `config` держит скилл актуальным.
- В `runSetup()` ничего не меняется: там по-прежнему `installSkill()` с confirm для первого раза.

После перезаписи файла Claude Code (v2.1.3+) подхватывает изменения автоматически через hot-reload — отдельной команды перезагрузки не требуется.

### Почему эта стратегия

- Идемпотентно: ничего не делает, если уже актуально (нет лишних записей/шума).
- Не требует версий в конфиге и semver-сравнения.
- Не меняет поведение первичной установки (остаётся осознанной через confirm).
- Тихое обновление безопасно: SKILL.md — артефакт инструмента, не пользовательские данные.

## Решение B — кэш с привязкой к проекту (один map-файл)

Стратегия: хранить в одном `cache.json` map по идентификатору проекта, а не одну запись. Проверки TTL и `session_id` становятся per-project.

### Новый формат `cache.json`

```json
{
  "/Users/.../ai-wincon-bar": { "data": {…ClaudeStatusInput…}, "ts": 1781691841090, "session_id": "abc" },
  "/Users/.../skolca-sait":   { "data": {…}, "ts": 1781…, "session_id": "def" }
}
```

### Идентификация проекта

Реальный объект от Claude Code содержит поля, не описанные в текущем типе: `workspace.project_dir` (каноничный корень проекта), `cwd`, `transcript_path`. Ключ проекта:

```ts
function getProjectId(input: ClaudeStatusInput): string {
  return input.workspace?.project_dir ?? input.cwd ?? "__default__";
}
```

`project_dir` — предпочтителен (каноничный, не зависит от `cd` внутри проекта). `cwd` — fallback. `"__default__"` — для вырожденных инпутов без полей (сохраняет прежнее поведение: один общий слот).

### Типы

`src/types.ts`:
- Расширить `ClaudeStatusInput` опциональными полями, которые реально приходят:
  ```ts
  cwd?: string;
  workspace?: { project_dir?: string; current_dir?: string; [key: string]: unknown };
  ```
  (у `ClaudeStatusInput` уже есть `[key: string]: unknown`, но явные поля дают типобезопасность в `getProjectId`.)

`src/constants.ts`:
- `CacheEntry` получает `session_id?: string` (хранится рядом с `data`/`ts` для проверки stale после `/clear`).
- Новый тип-обёртка:
  ```ts
  export type CacheMap = Record<string, CacheEntry>;
  ```

### Функции в `src/config.ts`

- `readCache(currentSessionId?: string, projectId?: string): ClaudeStatusInput | null`
  - Прочитать `cache.json` как `CacheMap`.
  - Взять `entry = map[projectId]`. Если нет → `null`.
  - TTL: `Date.now() - entry.ts > CACHE_TTL_MS` → `null`.
  - Session: если `currentSessionId` и `entry.session_id` заданы и не равны → `null` (stale после `/clear`, теперь per-project).
  - `used_percentage > 0`, иначе `null`.
  - Файл НЕ перезаписывается (read-only): `readCache` вызывается на каждом статус-рендере, запись здесь — лишняя нагрузка. Eviction живёт в `writeCache`.
- `writeCache(input: ClaudeStatusInput): void`
  - Прочитать существующий map (или `{}`).
  - `map[projectId] = { data: input, ts: Date.now(), session_id: input.session_id }`.
  - Eviction по TTL: удалить все записи с `Date.now() - ts > CACHE_TTL_MS`.
  - Записать map обратно. Остальные проекты сохраняются.
- `clearCache()` — без изменений: удаляет весь файл целиком. Используется в `runSetup` (после смены порогов) и в `uninstall` (там далее удаляется вся директория).

### `pickRenderData`

- Извлечь `projectId` и `session_id` из `input`.
- `used_percentage > 0` → `writeCache(input)`, вернуть `input`.
- Иначе — `cached = readCache(input.session_id, projectId)`; вернуть `cached ?? input` (zero-burst fallback на свежий same-project+same-session кэш, иначе сам нулевой инпут).

Логика zero-burst и сброса после `/clear` полностью сохраняется, но теперь в рамках одного проекта.

### Backward compatibility

Старый формат — `{ data, ts }` (без map). При чтении как `CacheMap` lookup `map[projectId]` вернёт `undefined` (ключи `data`/`ts` не совпадают с реальным путём проекта) → `null`. Файл перезапишется новым map при следующей `writeCache`. Добавить явную проверку legacy-формата в `readCache` (`parsed.data?.context_window` существует) → вернуть `null` для предсказуемости (без удаления файла).

### Что решает

- Два одновременно открытых проекта пишут в разные ключи → конфликт исчезает.
- `/clear` в одном проекте меняет `session_id` только его записи → другой проект не страдает.
- Память кэша между сессиями одного проекта переиспользуется (один и тот же `project_dir`).

### Eviction

Только по TTL (снос протухших записей при `readCache`/`writeCache`). Top-N ограничение НЕ вводится — выходит за выбранную простоту; при типичном использовании (несколько проектов) файл остаётся маленьким.

## Покрываемые тесты (`tests/config.test.ts`)

- `makeInput` получает `session_id` и `workspace.project_dir` (или `cwd`).
- Обновить сигнатуры вызовов `readCache(sessionId, projectId)`.
- Обновить существующие кейсы `pickRenderData` (zero-burst, `/clear`) под новые поля.
- Новые кейсы:
  - Два разных проекта не конфликтуют: запись проекта A не видна как stale для проекта B; одновременная zero-burst fallback работает независимо.
  - `/clear` сбрасывает только текущий проект (новый `session_id` в проекте A → stale; проект B с тем же `session_id` → валиден).
  - Eviction: протухшая запись сносится после TTL.
  - Legacy-формат `{data, ts}` корректно игнорируется/перезаписывается.

## Затронутые файлы

| Файл | Изменения |
|---|---|
| `src/setup.ts` | `resolveBundledSkillPath()`, `upgradeSkill()`, рефакторинг `installSkill` |
| `src/interactive.ts` | вызов `upgradeSkill()` в начале `handleInteractive` |
| `src/types.ts` | расширить `ClaudeStatusInput` (`cwd`, `workspace`) |
| `src/constants.ts` | `CacheEntry.session_id?`, `CacheMap` |
| `src/config.ts` | `getProjectId`, `readCache(sessionId, projectId)`, `writeCache`, `pickRenderData`, eviction, legacy-detection |
| `tests/config.test.ts` | обновить `makeInput`/сигнатуры, добавить новые кейсы |

## Вне scope

- Интеграция с `/reload-skills` — отброшено по решению пользователя (встроенной команды не существует, hot-reload покрывает перехват изменений).
- Top-N eviction кэша.
- Сравнение версий пакета для обновления скилла.
