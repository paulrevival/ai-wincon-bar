# TODO

## Remove the `render.log` diagnostic

`src/render-log.ts` and the `appendRenderLog(data)` call in `src/index.ts`
(status-line render path) are a **temporary** diagnostic.

**Why it exists:** sessions for 13–15 July 2026 never made it into
`sessions.json` — only 16–17 July survived, even though the retention window at
the time (7 days, later raised to a configurable 14) should have kept the whole
week. Retention can't explain the gap, so the records were never written —
meaning the status-line render path didn't fire (or fired without `session_id` /
`cost.total_duration_ms`) on those days. This log answers that question.

`~/.claude/ai-wincon-bar/render.log` is JSONL, one line per render:

```jsonl
{"ts":"2026-07-20T12:23:51+03:00","sid":"6539f13c","result":"ok","project":"/p","dur":59449,"api":13082}
{"ts":"2026-07-20T12:24:03+03:00","sid":null,"result":"no_session_id"}
```

`result` ∈ `ok` | `no_session_id` | `no_cost` | `duration_le_zero`.

**Once the cause is confirmed** (check whether renders fired on the missing
days; if they did, which `result` dominated):

- [ ] delete `src/render-log.ts` and `tests/render-log.test.ts`
- [ ] remove the `appendRenderLog` import + call (and the TEMP comment) in `src/index.ts`
- [ ] remove `getRenderLogPath()` from `src/config.ts`
- [ ] delete this `TODO.md`
- [ ] advise deleting the on-disk `~/.claude/ai-wincon-bar/render.log`
