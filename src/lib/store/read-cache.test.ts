import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListQuery, ListResult, PublicMessage } from "../types";
import { CachedStore, TtlCache } from "./read-cache";
import type { MessageStore, ReportOutcome } from "./types";

afterEach(() => vi.useRealTimers());

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("TtlCache", () => {
  it("serves a value for the TTL, then reloads", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache({ ttlMs: 5_000 });
    let n = 0;
    const load = async () => ++n;
    expect(await cache.get("k", load)).toBe(1);
    vi.advanceTimersByTime(4_999);
    expect(await cache.get("k", load)).toBe(1);
    vi.advanceTimersByTime(2);
    expect(await cache.get("k", load)).toBe(2);
  });

  it("shares one load between concurrent misses", async () => {
    const cache = new TtlCache({ ttlMs: 5_000 });
    const d = deferred<string>();
    const load = vi.fn(() => d.promise);
    const all = Promise.all([cache.get("k", load), cache.get("k", load), cache.get("k", load)]);
    d.resolve("v");
    expect(await all).toEqual(["v", "v", "v"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches errors, but serves the last good value for a while when a reload fails", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache({ ttlMs: 1_000, staleMs: 60_000 });
    await expect(cache.get("k", () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await cache.get("k", async () => "ok")).toBe("ok");
    vi.advanceTimersByTime(2_000);
    expect(await cache.get("k", () => Promise.reject(new Error("blip")))).toBe("ok");
    vi.advanceTimersByTime(60_000);
    await expect(cache.get("k", () => Promise.reject(new Error("still down")))).rejects.toThrow("still down");
  });

  it("a load that started before an invalidation is returned but not kept", async () => {
    const cache = new TtlCache({ ttlMs: 60_000 });
    const d = deferred<string>();
    const before = cache.get("k", () => d.promise);
    cache.invalidate("k");
    d.resolve("pre-write");
    expect(await before).toBe("pre-write");
    expect(await cache.get("k", async () => "post-write")).toBe("post-write");
  });

  it("invalidates by prefix, stays bounded, and is off at TTL 0", async () => {
    const cache = new TtlCache({ ttlMs: 60_000, maxKeys: 3 });
    for (const k of ["a:1", "a:2", "b:1"]) await cache.get(k, async () => k);
    cache.invalidate("a:");
    expect(cache.size).toBe(1);
    for (const k of ["c:1", "c:2", "c:3", "c:4"]) await cache.get(k, async () => k);
    expect(cache.size).toBeLessThanOrEqual(3);

    const off = new TtlCache({ ttlMs: 0 });
    let n = 0;
    await off.get("k", async () => ++n);
    expect(await off.get("k", async () => ++n)).toBe(2);
  });
});

function fakeStore() {
  const msg = (id: string): PublicMessage => ({
    id,
    title: null,
    toName: "نورة",
    school: null,
    body: "شكراً",
    fromName: null,
    likes: 0,
    createdAt: new Date(0).toISOString(),
    variant: 0,
    inMemory: false,
  });
  const calls = { get: 0, list: 0, count: 0 };
  const page = (): ListResult => ({ items: [msg("a")], nextCursor: null, total: 1 });
  let reportResult: ReportOutcome = { hidden: false };
  const inner = {
    get: vi.fn(async (id: string) => (calls.get++, msg(id))),
    list: vi.fn(async (_q: ListQuery) => (calls.list++, page())),
    count: vi.fn(async () => (calls.count++, 1)),
    create: vi.fn(async () => msg("new")),
    toggleLike: vi.fn(async () => ({ likes: 1, liked: true })),
    report: vi.fn(async () => reportResult),
    countRecent: vi.fn(async () => 0),
    adminList: vi.fn(),
    adminUpdate: vi.fn(async () => true),
    adminDelete: vi.fn(async () => true),
    adminExport: vi.fn(async () => []),
  } as unknown as MessageStore;
  const store = new CachedStore(inner, new TtlCache({ ttlMs: 60_000 }));
  return { store, calls, setReport: (r: ReportOutcome) => (reportResult = r) };
}

const newPage = { sort: "new", limit: 18 } as const;
const voter = { voterHash: "v", ipHash: "ip", newDevice: false };
const newMsg = (status: "published" | "pending") =>
  ({ status }) as unknown as Parameters<MessageStore["create"]>[0];

describe("CachedStore", () => {
  it("caches the default pages, the count and single letters — never searches or cursors", async () => {
    const { store, calls } = fakeStore();
    await store.list(newPage);
    await store.list(newPage);
    await store.list({ ...newPage, limit: 40 });
    await store.list({ ...newPage, q: "نورة" });
    await store.list({ ...newPage, q: "نورة" });
    await store.list({ ...newPage, cursor: "c" });
    expect(calls.list).toBe(5); // the repeated default page came from the cache
    await store.count();
    await store.count();
    await store.get("x");
    await store.get("x");
    expect(calls).toMatchObject({ count: 1, get: 1 });
  });

  it("drops what this instance's writes change", async () => {
    const { store, calls, setReport } = fakeStore();
    const warm = async () => {
      await store.list(newPage);
      await store.list({ sort: "top", limit: 18 });
      await store.count();
      await store.get("x");
    };
    await warm();
    expect(calls).toEqual({ list: 2, count: 1, get: 1 });

    // A pending letter changes nothing public.
    await store.create(newMsg("pending"));
    await warm();
    expect(calls).toEqual({ list: 2, count: 1, get: 1 });

    // A published one changes the wall and the counter, not other letters.
    await store.create(newMsg("published"));
    await warm();
    expect(calls).toEqual({ list: 4, count: 2, get: 1 });

    // A like changes that letter and the "top" order.
    await store.toggleLike("x", true, voter);
    await warm();
    expect(calls).toEqual({ list: 5, count: 2, get: 2 });

    // A report that didn't hide anything changes nothing; one that did drops everything.
    await store.report("x", { ...voter, reason: "other", note: null });
    await warm();
    expect(calls).toEqual({ list: 5, count: 2, get: 2 });
    setReport({ hidden: true });
    await store.report("x", { ...voter, reason: "removal_request", note: null });
    await warm();
    expect(calls).toEqual({ list: 7, count: 3, get: 3 });

    await store.adminUpdate("x", { status: "hidden" });
    await warm();
    await store.adminDelete("x");
    await warm();
    expect(calls).toEqual({ list: 11, count: 5, get: 5 });
  });
});
