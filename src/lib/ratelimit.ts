// In-memory sliding-window rate limiter. Per process only: good enough as a
// first line of defence (the create endpoint also checks the store).

interface Entry {
  hits: number[];
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next request would be allowed (0 when ok). */
  retryAfter: number;
}

const MAX_KEYS = 10_000;
const SWEEP_EVERY_MS = 60_000;

const buckets = new Map<string, Entry>();
let lastSweep = 0;

function sweep(now: number) {
  lastSweep = now;
  for (const [key, e] of buckets) {
    const last = e.hits[e.hits.length - 1];
    if (last === undefined || last <= now - e.windowMs) buckets.delete(key);
  }
}

/** Records a hit for `key` unless it already has `limit` hits within the last `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > SWEEP_EVERY_MS) sweep(now);

  let e = buckets.get(key);
  if (e) {
    const from = now - windowMs;
    let drop = 0;
    while (drop < e.hits.length && e.hits[drop] <= from) drop++;
    if (drop) e.hits.splice(0, drop);
    e.windowMs = windowMs;
  } else {
    if (buckets.size >= MAX_KEYS) {
      sweep(now);
      // Still full: evict the oldest keys (Map keeps insertion order).
      const excess = buckets.size - MAX_KEYS + 1;
      if (excess > 0) {
        let i = 0;
        for (const k of buckets.keys()) {
          if (i++ >= excess) break;
          buckets.delete(k);
        }
      }
    }
    e = { hits: [], windowMs };
    buckets.set(key, e);
  }

  if (e.hits.length >= limit) {
    const retryMs = e.hits[0] + windowMs - now;
    return { ok: false, retryAfter: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  e.hits.push(now);
  return { ok: true, retryAfter: 0 };
}

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}
