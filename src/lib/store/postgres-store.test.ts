// Integration test against a real Postgres. Runs only when TEST_DATABASE_URL
// points at a disposable database (its tables are dropped and recreated).

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PublicMessage } from "../types";
import { PostgresStore } from "./postgres-store";
import { SCHEMA_VERSION } from "./schema";
import type { NewMessage, ReportInput, Voter } from "./types";

const url = process.env.TEST_DATABASE_URL;

function input(over: Partial<NewMessage> = {}): NewMessage {
  return {
    title: "ustadha",
    toName: "نورة القحطاني",
    school: "ثانوية الملك فهد",
    body: "شكراً على كل شي يا أستاذة 💜",
    fromName: "سارة",
    variant: 2,
    inMemory: false,
    surpriseOptIn: false,
    contact: null,
    ipHash: "ip-1",
    deviceHash: "dev-1",
    status: "published",
    reviewReason: null,
    moderation: { layer: "wordlist", flagged: false },
    ...over,
  };
}

const voter = (voterHash: string, ipHash: string | null = "ip-1", newDevice = false): Voter => ({
  voterHash,
  ipHash,
  newDevice,
});

const rep = (
  voterHash: string,
  reason: ReportInput["reason"],
  note: string | null = null,
  ipHash: string | null = null,
  newDevice = false,
): ReportInput => ({ voterHash, ipHash, newDevice, reason, note });

// The schema the first version of the app created.
const LEGACY_SCHEMA = `
  CREATE TABLE messages (
    id text PRIMARY KEY, title text NULL, to_name text NOT NULL, school text NULL,
    body text NOT NULL, from_name text NULL, likes integer NOT NULL DEFAULT 0,
    reports integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'published',
    ip_hash text NULL, search_text text NOT NULL DEFAULT '', moderation jsonb NULL,
    variant smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT messages_status_check CHECK (status IN ('published', 'hidden'))
  );
  CREATE TABLE message_likes (
    message_id text NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    voter_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, voter_hash)
  );
  CREATE TABLE message_reports (
    message_id text NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    reporter_hash text NOT NULL, reason text NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, reporter_hash)
  );
  INSERT INTO messages (id, title, to_name, body, likes, variant, search_text, created_at)
  VALUES ('legacy0001', 'ustadh', 'سعد', 'رسالة من النسخة الأولى 💜', 5, 3, 'سعد', '2026-10-01T10:00:00Z');
`;

describe.skipIf(!url)("PostgresStore (TEST_DATABASE_URL)", () => {
  let admin: postgres.Sql;
  let store: PostgresStore;

  beforeAll(async () => {
    vi.stubEnv("DATABASE_URL", url!);
    admin = postgres(url!, { max: 1, onnotice: () => {} });
    await admin.unsafe("DROP TABLE IF EXISTS message_likes, message_reports, messages CASCADE");
    await admin.unsafe(LEGACY_SCHEMA);
    store = new PostgresStore({ reportHideThreshold: 3 });
    await store.ensureSchema();
  });

  afterAll(async () => {
    await admin?.unsafe("DROP TABLE IF EXISTS message_likes, message_reports, messages CASCADE");
    await admin?.end();
    const g = globalThis as { __letters_pg?: { sql: postgres.Sql } };
    await g.__letters_pg?.sql.end();
    delete g.__letters_pg;
    vi.unstubAllEnvs();
  });

  it("migrates a legacy database and marks the schema version", async () => {
    const [v] = await admin`select obj_description('messages'::regclass, 'pg_class') as v`;
    expect(v.v).toBe(SCHEMA_VERSION);
    const legacy = await store.get("legacy0001");
    expect(legacy).toMatchObject({ toName: "سعد", likes: 5, variant: 3, inMemory: false });
    const { items } = await store.adminList({ filter: "all", q: "legacy0001", limit: 5, offset: 0 });
    expect(items[0]).toMatchObject({
      removalRequested: false,
      starred: false,
      surpriseOptIn: false,
      contact: null,
      deviceHash: null,
      reviewReason: null,
    });
    // 'pending' is allowed now; a second instance takes the fast path.
    await new PostgresStore().ensureSchema();
    await admin`delete from messages where id = 'legacy0001'`;
  });

  it("re-checks the version under the advisory lock: concurrent cold starts apply the DDL once", async () => {
    await admin`comment on table messages is 'teachers-day-letters schema v0'`;
    const g = globalThis as { __letters_pg?: { sql: postgres.Sql } };
    const client = g.__letters_pg!.sql;
    const begin = client.begin.bind(client);
    let ddl = 0;
    // Count the schema statements every instance runs (they share the pooled client).
    const spy = vi.spyOn(client, "begin").mockImplementation(((fn: (tx: postgres.TransactionSql) => unknown) =>
      begin(async (tx) => {
        const unsafe = tx.unsafe.bind(tx);
        tx.unsafe = ((q: string, ...rest: unknown[]) => {
          ddl++;
          return (unsafe as (...a: unknown[]) => unknown)(q, ...rest);
        }) as typeof tx.unsafe;
        return fn(tx);
      })) as unknown as typeof client.begin);
    try {
      await Promise.all(Array.from({ length: 4 }, () => new PostgresStore().ensureSchema()));
    } finally {
      spy.mockRestore();
    }
    const required = (await import("./schema")).schemaStatements().filter((st) => !st.optional).length;
    expect(ddl).toBe(required);
    const [v] = await admin`select obj_description('messages'::regclass, 'pg_class') as v`;
    expect(v.v).toBe(SCHEMA_VERSION);
    // The status check is only replaced when it differs.
    const [c] = await admin`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'messages'::regclass and conname = 'messages_status_check'`;
    expect(c.def).toContain("pending");
  });

  it("creates published / pending letters; public reads only see published", async () => {
    const pub = await store.create(input({ surpriseOptIn: true, contact: "+966500000009", inMemory: true }));
    const pend = await store.create(input({ toName: "خالد", status: "pending", reviewReason: "review_all" }));
    expect(Object.keys(pub).sort()).toEqual(
      ["body", "createdAt", "fromName", "id", "inMemory", "likes", "school", "title", "toName", "variant"],
    );
    expect(pub).toMatchObject({ variant: 2, inMemory: true, likes: 0 });
    expect(await store.get(pub.id)).toEqual(pub);
    expect(await store.get(pend.id)).toBeNull();
    expect(await store.count()).toBe(1);
    const wall = await store.list({ sort: "new", limit: 10 });
    expect(wall.items.map((m) => m.id)).toEqual([pub.id]);
    expect(JSON.stringify(wall)).not.toContain("+966500000009");

    const fallback = await store.create(input({ variant: null, contact: "+966500000010" }));
    expect(fallback.variant).toBeGreaterThanOrEqual(0);
    const [row] = await admin`select contact from messages where id = ${fallback.id}`;
    expect(row.contact).toBeNull();
  });

  it("searches with escaped ILIKE patterns and paginates both sorts", async () => {
    await admin`delete from messages`;
    const made: PublicMessage[] = [];
    for (let i = 0; i < 7; i++) {
      made.push(await store.create(input({ toName: `نورة ${i}`, school: i % 2 ? "مدرسة 100%_ok" : "Kingdom Schools" })));
    }
    for (const [i, m] of made.entries()) {
      for (let v = 0; v < i % 4; v++) await store.toggleLike(m.id, true, voter(`voter-${v}`));
    }
    const q = async (text: string) => (await store.list({ q: text, sort: "new", limit: 20 })).total;
    expect(await q("نوره")).toBe(7);
    expect(await q("أستاذة نورة kingdom")).toBe(4);
    // LIKE wildcards in the query are never wildcards.
    expect(await q("100%")).toBe(3);
    expect(await q("_ok")).toBe(3);
    expect(await q("x_k")).toBe(0);
    expect(await q("%%")).toBeGreaterThanOrEqual(0);

    for (const sort of ["new", "top"] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page: Awaited<ReturnType<typeof store.list>> = await store.list({ sort, cursor, limit: 3 });
        seen.push(...page.items.map((m) => m.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(new Set(seen).size).toBe(7);
      const all = (await store.list({ sort, limit: 30 })).items.map((m) => m.id);
      expect(seen).toEqual(all);
    }
    const garbage = await store.list({ sort: "new", limit: 3, cursor: "garbage" });
    expect(garbage.items).toEqual((await store.list({ sort: "new", limit: 3 })).items);
  });

  it("likes are idempotent per voter", async () => {
    const m = await store.create(input());
    expect(await store.toggleLike(m.id, true, voter("v1"))).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, true, voter("v1"))).toEqual({ likes: 1, liked: true });
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.toggleLike(m.id, true, voter(`c${i}`))));
    expect((await store.get(m.id))?.likes).toBe(11);
    expect(await store.toggleLike(m.id, false, voter("v1"))).toEqual({ likes: 10, liked: false });
    expect(await store.toggleLike("missing000", true, voter("v1"))).toBeNull();
  });

  it("counts one cookie-less like per letter per IP per day, even when raced", async () => {
    const m = await store.create(input());
    await Promise.all(Array.from({ length: 8 }, (_, i) => store.toggleLike(m.id, true, voter(`anon-${i}`, "ip-x", true))));
    expect((await store.get(m.id))?.likes).toBe(1);
    expect(await store.toggleLike(m.id, true, voter("anon-y", "ip-y", true))).toEqual({ likes: 2, liked: true });
    expect(await store.toggleLike(m.id, true, voter("cookie", "ip-x"))).toEqual({ likes: 3, liked: true });
    await admin`update message_likes set created_at = now() - interval '25 hours' where message_id = ${m.id} and ip_hash = 'ip-x'`;
    expect(await store.toggleLike(m.id, true, voter("anon-z", "ip-x", true))).toEqual({ likes: 4, liked: true });
  });

  it("reports: threshold, re-publish sticks, removal requests", async () => {
    const m = await store.create(input());
    expect(await store.report(m.id, rep("r1", "inappropriate", null, "ip-1"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r1", "other", null, "ip-1"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r2", "other", "note", "ip-2"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r3", "inappropriate", null, "ip-3"))).toEqual({ hidden: true });
    let [row] = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items;
    expect(row).toMatchObject({ status: "pending", reports: 3, reviewReason: "reports" });

    await store.adminUpdate(m.id, { status: "published" });
    expect(await store.report(m.id, rep("r4", "inappropriate", null, "ip-4"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r1", "removal_request", "أنا", "ip-1"))).toEqual({ hidden: true });
    [row] = (await store.adminList({ filter: "removal", limit: 5, offset: 0 })).items;
    expect(row).toMatchObject({ id: m.id, status: "pending", removalRequested: true, reviewReason: "removal_request", reports: 4 });
    expect(row.flaggedAt).toBeTruthy();
    expect(await store.report(m.id, rep("r1", "removal_request", null, "ip-1"))).toEqual({ hidden: true });
    const [r] = await admin`select reason, note, ip_hash from message_reports where message_id = ${m.id} and reporter_hash = 'r1'`;
    expect(r).toEqual({ reason: "removal_request", note: "أنا", ip_hash: "ip-1" });
    expect(await store.report("missing000", rep("r1", "other"))).toBeNull();
  });

  it("a reporter is a device OR an IP: cookie-less repeats never reach the threshold", async () => {
    const m = await store.create(input());
    await Promise.all(Array.from({ length: 6 }, (_, i) => store.report(m.id, rep(`fresh-${i}`, "inappropriate", null, "ip-bad", true))));
    await store.report(m.id, rep("dev-2", "other", null, "ip-bad"));
    const [row] = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items;
    expect(row).toMatchObject({ status: "published", reports: 1 });
  });

  it("kept letters are only flagged by later removal requests; daily caps per device / IP", async () => {
    const m = await store.create(input());
    await store.report(m.id, rep("k1", "removal_request", null, "ip-k1"));
    await store.adminUpdate(m.id, { status: "published" });
    let [row] = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items;
    expect(row).toMatchObject({ status: "published", removalKept: true, reviewReason: null });
    expect(await store.report(m.id, rep("k2", "removal_request", null, "ip-k2"))).toEqual({ hidden: false });
    [row] = (await store.adminList({ filter: "removal", limit: 1, offset: 0 })).items;
    expect(row).toMatchObject({ id: m.id, status: "published", reviewReason: "removal_request_again" });
    expect(await store.get(m.id)).not.toBeNull();

    const ids = await Promise.all(Array.from({ length: 7 }, () => store.create(input()).then((x) => x.id)));
    // Raced from one IP with a new device each time: exactly 5 get through.
    const results = await Promise.all(ids.map((id, i) => store.report(id, rep(`anon-${i}`, "removal_request", null, "ip-cap", true))));
    expect(results.filter((x) => x?.limited)).toHaveLength(2);
    expect(results.filter((x) => x?.hidden && !x.limited)).toHaveLength(5);
    // Per device: 3 a day, whatever the IP.
    const more = await Promise.all(Array.from({ length: 4 }, () => store.create(input()).then((x) => x.id)));
    for (const [i, id] of more.entries()) {
      const out = await store.report(id, rep("dev-cap", "removal_request", null, `ip-d${i}`));
      expect(out?.limited ?? false).toBe(i >= 3);
    }
  });

  it("admin: counts, queue order, filters, contact search, export, delete; rate-limit counts", async () => {
    await admin`delete from messages`;
    const a = await store.create(input({ toName: "أول", status: "pending", reviewReason: "review_all", ipHash: "ip-a" }));
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.create(input({ toName: "ثاني", status: "pending", reviewReason: "review_all", ipHash: "ip-a" }));
    const s = await store.create(input({ toName: "ثالث", surpriseOptIn: true, contact: "+966500000001", deviceHash: "dev-z" }));
    await store.adminUpdate(s.id, { starred: true });

    const res = await store.adminList({ filter: "pending", limit: 10, offset: 0 });
    expect(res.items.map((m) => m.id)).toEqual([a.id, b.id]);
    expect(res.counts).toEqual({ all: 3, published: 1, pending: 2, hidden: 0, reported: 0, removal: 0, starred: 1, surprise: 1 });
    expect((await store.adminList({ filter: "all", q: "0500000001", limit: 5, offset: 0 })).items.map((m) => m.id)).toEqual([s.id]);
    expect((await store.adminList({ filter: "all", q: "ثاني", limit: 5, offset: 0 })).items.map((m) => m.id)).toEqual([b.id]);
    expect((await store.adminList({ filter: "all", limit: 1, offset: 1 })).items).toHaveLength(1);

    expect(await store.adminUpdate(a.id, { status: "published" })).toBe(true);
    const [pa] = (await store.adminList({ filter: "all", q: a.id, limit: 1, offset: 0 })).items;
    expect(pa).toMatchObject({ status: "published", reviewReason: null, starred: false });
    expect(await store.adminUpdate("missing000", { starred: true })).toBe(false);

    expect((await store.adminExport("starred")).map((m) => m.id)).toEqual([s.id]);
    const surprise = await store.adminExport("surprise");
    expect(surprise[0].contact).toBe("+966500000001");

    const since = Date.now() - 60_000;
    expect(await store.countRecent({ ipHash: "ip-a", sinceMs: since })).toBe(2);
    expect(await store.countRecent({ deviceHash: "dev-z", sinceMs: since })).toBe(1);
    expect(await store.countRecent({ sinceMs: since })).toBe(0);

    expect(await store.adminDelete(s.id)).toBe(true);
    expect(await store.adminDelete(s.id)).toBe(false);
  });
});
