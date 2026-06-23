import { statSync, openSync, readSync, closeSync } from "node:fs";

/**
 * How many bytes from the end of the transcript to scan for a compaction marker.
 * Claude Code writes the `compact_boundary` entry (~1 KB) immediately followed by
 * the summary message (~15-25 KB), so the boundary sits well within this window
 * at the moment we look (right after /compact, before the next request).
 */
const TAIL_BYTES = 256 * 1024;

/**
 * Find the post-compaction context size from a Claude Code transcript.
 *
 * After `/compact` the session_id is unchanged and Claude Code emits zero-payloads
 * until the next request, so the status line's cache fallback keeps showing the
 * stale pre-compact reading. The accurate post-compact size is recorded only in the
 * transcript, as a `system / compact_boundary` entry carrying
 * `compactMetadata.postTokens`.
 *
 * Returns the `postTokens` of the most recent boundary whose timestamp is newer
 * than `afterTs` (the cached reading's timestamp), or null when there is nothing to
 * correct. Cheap mtime gate skips the read entirely when the file hasn't changed
 * since the cached reading. Read-only and fully silent — any error yields null so
 * the status line never breaks.
 */
export function readRecentCompactPostTokens(
  transcriptPath: string,
  afterTs: number,
): number | null {
  try {
    const st = statSync(transcriptPath);
    // Nothing written since the cached reading → no newer compaction possible.
    if (st.mtimeMs <= afterTs) return null;

    const readLen = Math.min(st.size, TAIL_BYTES);
    const start = st.size - readLen;
    const buf = Buffer.alloc(readLen);
    const fd = openSync(transcriptPath, "r");
    try {
      readSync(fd, buf, 0, readLen, start);
    } finally {
      closeSync(fd);
    }

    const lines = buf.toString("utf-8").split("\n");
    // A non-zero start almost certainly cuts mid-line; drop the partial head.
    if (start > 0) lines.shift();

    let bestTs = -Infinity;
    let bestPost: number | null = null;
    for (const line of lines) {
      if (!line.includes("compact_boundary")) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = obj as {
        subtype?: string;
        timestamp?: string;
        compactMetadata?: { postTokens?: number };
      };
      if (entry.subtype !== "compact_boundary") continue;
      const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
      if (!Number.isFinite(ts) || ts <= afterTs || ts < bestTs) continue;
      const post = entry.compactMetadata?.postTokens;
      if (typeof post !== "number" || post <= 0) continue;
      bestTs = ts;
      bestPost = post;
    }
    return bestPost;
  } catch {
    return null;
  }
}
