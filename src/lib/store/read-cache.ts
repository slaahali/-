// Per-instance read cache for the hot public reads — the default wall pages
// (no search, no cursor), the counter and single letters — so a viral spike
// costs about one query per key per TTL per instance instead of one per hit.
// Concurrent misses share one query. This instance's own writes invalidate what
// they change; other instances converge within the TTL (READ_CACHE_TTL_MS, 5s).

import type { LikeResult, ListQuery, ListResult, PublicMessage } from "../types";
import type {
  AdminListOptions,
  AdminListResult,
  AdminPatch,
  AdminRecord,
  ExportFilter,
  MessageStore,
  NewMessage,
  RecentQuery,
  ReportInput,
  ReportOutcome,
  Voter,
} from "./types";

interface Entry<T> {
  has: boolean;
  value?: T;
  /** When `value` was loaded. */
  at: number;
  pending?: Promise<T>;
}

export interface TtlCacheOptions {
  ttlMs: number;
  /** A failed reload may serve the last good value this long (stale-if-error). */
  staleMs?: number;
  maxKeys?: number;
}

export class TtlCache {
  private readonly map = new Map<string, Entry<unknown>>();
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly maxKeys: number;

  constructor(o: TtlCacheOptions) {
    this.ttlMs = o.ttlMs;
    this.staleMs = Math.max(o.ttlMs, o.staleMs ?? 0);
    this.maxKeys = o.maxKeys ?? 2_000;
  }

  get size(): number {
    return this.map.size;
  }

  get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.ttlMs <= 0) return load();
    const hit = this.map.get(key) as Entry<T> | undefined;
    if (hit?.pending) return hit.pending;
    if (hit?.has && Date.now() - hit.at < this.ttlMs) return Promise.resolve(hit.value as T);

    const entry: Entry<T> = hit ?? { has: false, at: 0 };
    if (!hit) {
      this.map.set(key, entry);
      this.evict();
    }
    // An invalidation while loading removes `entry`: the result is then returned
    // to its callers but not kept, so a pre-write read never outlives the write.
    const live = () => this.map.get(key) === entry;
    const p = load().then(
      (value) => {
        if (live()) Object.assign(entry, { has: true, value, at: Date.now(), pending: undefined });
        return value;
      },
      (err: unknown) => {
        if (!live()) throw err;
        entry.pending = undefined;
        if (entry.has && Date.now() - entry.at < this.staleMs) return entry.value as T;
        this.map.delete(key);
        throw err;
      },
    );
    entry.pending = p;
    return p;
  }

  /** Drops every key starting with one of `prefixes` (all keys when none given). */
  invalidate(...prefixes: string[]): void {
    if (prefixes.length === 0) {
      this.map.clear();
      return;
    }
    for (const key of [...this.map.keys()]) {
      if (prefixes.some((p) => key.startsWith(p))) this.map.delete(key);
    }
  }

  private evict(): void {
    if (this.map.size <= this.maxKeys) return;
    const now = Date.now();
    for (const [key, e] of this.map) {
      if (!e.pending && now - e.at >= this.staleMs) this.map.delete(key);
    }
    // Still full: drop the oldest insertions (Map keeps insertion order).
    for (const key of this.map.keys()) {
      if (this.map.size <= this.maxKeys) break;
      this.map.delete(key);
    }
  }
}

const LIST = "list:";
const COUNT = "count";
const GET = "get:";

/** Wraps a store with a TtlCache; every call not listed here goes straight through. */
export class CachedStore implements MessageStore {
  constructor(
    private readonly inner: MessageStore,
    readonly cache: TtlCache,
  ) {}

  get(id: string): Promise<PublicMessage | null> {
    return this.cache.get(GET + id, () => this.inner.get(id));
  }

  async list(q: ListQuery): Promise<ListResult> {
    if (q.q || q.cursor) return this.inner.list(q);
    const r = await this.cache.get(`${LIST}${q.sort}:${q.limit}`, () => this.inner.list(q));
    // Callers may sort / slice what they get; the cached page must not change under them.
    return { ...r, items: [...r.items] };
  }

  count(): Promise<number> {
    return this.cache.get(COUNT, () => this.inner.count());
  }

  async create(input: NewMessage): Promise<PublicMessage> {
    const m = await this.inner.create(input);
    if (input.status === "published") this.cache.invalidate(LIST, COUNT);
    return m;
  }

  async toggleLike(id: string, like: boolean, who: Voter): Promise<LikeResult | null> {
    try {
      return await this.inner.toggleLike(id, like, who);
    } finally {
      // Like counts on the "new" pages may lag by one TTL; the order of "top" can't.
      this.cache.invalidate(GET + id, `${LIST}top:`);
    }
  }

  async report(id: string, input: ReportInput): Promise<ReportOutcome | null> {
    const r = await this.inner.report(id, input);
    if (r?.hidden) this.cache.invalidate();
    return r;
  }

  async adminUpdate(id: string, patch: AdminPatch): Promise<boolean> {
    try {
      return await this.inner.adminUpdate(id, patch);
    } finally {
      this.cache.invalidate();
    }
  }

  async adminDelete(id: string): Promise<boolean> {
    try {
      return await this.inner.adminDelete(id);
    } finally {
      this.cache.invalidate();
    }
  }

  countRecent(o: RecentQuery): Promise<number> {
    return this.inner.countRecent(o);
  }

  adminList(o: AdminListOptions): Promise<AdminListResult> {
    return this.inner.adminList(o);
  }

  adminExport(filter: ExportFilter): Promise<AdminRecord[]> {
    return this.inner.adminExport(filter);
  }
}
