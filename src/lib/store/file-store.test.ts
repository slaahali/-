import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PublicMessage } from "../types";
import { messagesToCsv } from "./csv";
import { DEMO_LETTERS } from "./demo-data";
import { FileStore } from "./file-store";
import { makeTestDir } from "./test-dirs";
import type { NewMessage } from "./types";

const root = makeTestDir("file-store-");
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
function freshDir() {
  return path.join(root, `case-${++n}`);
}

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

const PUBLIC_KEYS = [
  "body",
  "createdAt",
  "fromName",
  "id",
  "inMemory",
  "likes",
  "school",
  "title",
  "toName",
  "variant",
].sort();

function expectPublic(m: PublicMessage) {
  expect(Object.keys(m).sort()).toEqual(PUBLIC_KEYS);
}

describe("FileStore", () => {
  let store: FileStore;
  let dir: string;

  beforeEach(() => {
    dir = freshDir();
    store = new FileStore({ dir, seedDemo: false, reportHideThreshold: 3 });
  });

  it("creates published and pending letters; public reads only see published", async () => {
    const pub = await store.create(input({ surpriseOptIn: true, contact: "+966500000009" }));
    const pend = await store.create(
      input({ toName: "خالد", status: "pending", reviewReason: "suspicious: test" }),
    );

    expectPublic(pub);
    expect(JSON.stringify(pub)).not.toContain("+966500000009");
    expect(pub).toMatchObject({ toName: "نورة القحطاني", variant: 2, inMemory: false, likes: 0 });

    expect(await store.get(pub.id)).toEqual(pub);
    expect(await store.get(pend.id)).toBeNull();
    expect(await store.count()).toBe(1);

    const wall = await store.list({ sort: "new", limit: 10 });
    expect(wall.items.map((m) => m.id)).toEqual([pub.id]);
    expect(wall.total).toBe(1);
    wall.items.forEach(expectPublic);

    // Persisted to disk, contact included (private, admin-only).
    const onDisk = JSON.parse(readFileSync(path.join(dir, "letters.json"), "utf8"));
    expect(onDisk.version).toBe(2);
    expect(onDisk.messages).toHaveLength(2);
    expect(onDisk.messages[0].contact).toBe("+966500000009");

    // A second instance reads the same file.
    const again = new FileStore({ dir, seedDemo: false });
    expect(await again.get(pub.id)).toEqual(pub);
  });

  it("uses the writer's colour, else a stable one from the id; never keeps a contact without opt-in", async () => {
    const picked = await store.create(input({ variant: 4 }));
    expect(picked.variant).toBe(4);
    const fallback = await store.create(input({ variant: null, contact: "+966500000009" }));
    expect(fallback.variant).toBeGreaterThanOrEqual(0);
    expect(fallback.variant).toBeLessThan(6);
    const { items } = await store.adminList({ filter: "all", limit: 10, offset: 0 });
    expect(items.find((m) => m.id === fallback.id)?.contact).toBeNull();
  });

  it("stores inMemory letters", async () => {
    const m = await store.create(input({ inMemory: true }));
    expect(m.inMemory).toBe(true);
    expect((await store.get(m.id))?.inMemory).toBe(true);
  });

  it("searches names and schools (AND of tokens, titles ignored)", async () => {
    const a = await store.create(input({ toName: "نورة القحطاني", school: "ثانوية الملك فهد" }));
    const b = await store.create(input({ toName: "نوره العتيبي", school: "Kingdom Schools" }));
    await store.create(input({ toName: "خالد", school: "جامعة الملك سعود" }));
    await store.create(input({ toName: "نورة السبيعي", status: "pending" }));

    const ids = async (q: string) => (await store.list({ q, sort: "new", limit: 10 })).items.map((m) => m.id).sort();
    expect(await ids("نوره")).toEqual([a.id, b.id].sort());
    expect(await ids("أستاذة نورة")).toEqual([a.id, b.id].sort());
    expect(await ids("نورة فهد")).toEqual([a.id]);
    expect(await ids("kingdom")).toEqual([b.id]);
    expect(await ids("نورة سعود")).toEqual([]);
    expect((await store.list({ q: "نورة", sort: "new", limit: 1 })).total).toBe(2);
  });

  it("paginates 'new' with a keyset cursor and 'top' with an offset", async () => {
    const created: PublicMessage[] = [];
    for (let i = 0; i < 7; i++) created.push(await store.create(input({ toName: `معلم ${i}` })));
    for (const [i, m] of created.entries()) {
      for (let v = 0; v < i % 4; v++) await store.toggleLike(m.id, `voter-${v}`, true);
    }

    const walk = async (sort: "new" | "top") => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await store.list({ sort, cursor, limit: 3 });
        expect(page.total).toBe(7);
        seen.push(...page.items.map((m) => m.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);
      return seen;
    };

    const newest = await walk("new");
    expect(newest).toHaveLength(7);
    expect(new Set(newest).size).toBe(7);
    const expectedNew = [...created]
      .sort((x, y) => (x.createdAt === y.createdAt ? (x.id < y.id ? 1 : -1) : x.createdAt < y.createdAt ? 1 : -1))
      .map((m) => m.id);
    expect(newest).toEqual(expectedNew);

    const top = await walk("top");
    expect(new Set(top).size).toBe(7);
    const all = (await store.list({ sort: "top", limit: 10 })).items;
    expect(all.map((m) => m.id)).toEqual(top);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].likes).toBeGreaterThanOrEqual(all[i].likes);

    // Garbage / foreign cursors fall back to the first page.
    const first = await store.list({ sort: "new", limit: 3 });
    expect((await store.list({ sort: "new", limit: 3, cursor: "garbage" })).items).toEqual(first.items);
    expect((await store.list({ sort: "new", limit: 3, cursor: (await store.list({ sort: "top", limit: 3 })).nextCursor })).items).toEqual(first.items);
  });

  it("likes are idempotent per voter and only for published letters", async () => {
    const m = await store.create(input());
    expect(await store.toggleLike(m.id, "v1", true)).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, "v1", true)).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, "v2", true)).toEqual({ likes: 2, liked: true });
    expect(await store.toggleLike(m.id, "v1", false)).toEqual({ likes: 1, liked: false });
    expect(await store.toggleLike(m.id, "v1", false)).toEqual({ likes: 1, liked: false });
    expect(await store.toggleLike("missing000", "v1", true)).toBeNull();

    const pend = await store.create(input({ status: "pending" }));
    expect(await store.toggleLike(pend.id, "v1", true)).toBeNull();

    // Concurrent likes from many voters all count.
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.toggleLike(m.id, `c${i}`, true)));
    expect((await store.get(m.id))?.likes).toBe(21);
  });

  it("hides a letter after REPORT_HIDE_THRESHOLD distinct reporters; a moderator re-publish sticks", async () => {
    const m = await store.create(input());
    expect(await store.report(m.id, "r1", "inappropriate", null)).toEqual({ hidden: false });
    expect(await store.report(m.id, "r1", "inappropriate", "again")).toEqual({ hidden: false });
    expect(await store.report(m.id, "r2", "other", "ملاحظة")).toEqual({ hidden: false });
    expect(await store.report(m.id, "r3", "inappropriate", null)).toEqual({ hidden: true });
    expect(await store.get(m.id)).toBeNull();

    let row = (await store.adminList({ filter: "pending", limit: 10, offset: 0 })).items[0];
    expect(row).toMatchObject({ id: m.id, status: "pending", reports: 3, reviewReason: "reports", removalRequested: false });

    expect(await store.adminUpdate(m.id, { status: "published" })).toBe(true);
    expect(await store.report(m.id, "r4", "inappropriate", null)).toEqual({ hidden: false });
    row = (await store.adminList({ filter: "reported", limit: 10, offset: 0 })).items[0];
    expect(row).toMatchObject({ status: "published", reports: 4, reviewReason: null });
    expect(await store.report("missing000", "r1", "other", null)).toBeNull();
  });

  it("a removal request hides the letter immediately for review", async () => {
    const m = await store.create(input());
    expect(await store.report(m.id, "r1", "inappropriate", null)).toEqual({ hidden: false });
    // Same reporter can still escalate to a removal request (once).
    expect(await store.report(m.id, "r1", "removal_request", "أنا نورة")).toEqual({ hidden: true });
    expect(await store.get(m.id)).toBeNull();

    const [row] = (await store.adminList({ filter: "removal", limit: 10, offset: 0 })).items;
    expect(row).toMatchObject({
      id: m.id,
      status: "pending",
      removalRequested: true,
      reviewReason: "removal_request",
      reports: 1,
    });

    // Moderator decides to keep it: published again, removalRequested kept for audit.
    await store.adminUpdate(m.id, { status: "published" });
    expect(await store.report(m.id, "r1", "removal_request", null)).toEqual({ hidden: false });
    const after = (await store.adminList({ filter: "all", q: m.id, limit: 10, offset: 0 })).items[0];
    expect(after).toMatchObject({ status: "published", removalRequested: true, reviewReason: null });

    // A hidden letter stays hidden but is flagged.
    const h = await store.create(input());
    await store.adminUpdate(h.id, { status: "hidden" });
    expect(await store.report(h.id, "r9", "removal_request", null)).toEqual({ hidden: true });
    const hidden = (await store.adminList({ filter: "hidden", limit: 10, offset: 0 })).items[0];
    expect(hidden).toMatchObject({ status: "hidden", removalRequested: true });
  });

  it("counts recent letters per IP / device", async () => {
    await store.create(input({ ipHash: "ip-a", deviceHash: "dev-a" }));
    await store.create(input({ ipHash: "ip-a", deviceHash: "dev-b" }));
    await store.create(input({ ipHash: "ip-b", deviceHash: "dev-a", status: "pending" }));
    const since = Date.now() - 60_000;
    expect(await store.countRecent({ ipHash: "ip-a", sinceMs: since })).toBe(2);
    expect(await store.countRecent({ deviceHash: "dev-a", sinceMs: since })).toBe(2);
    expect(await store.countRecent({ ipHash: "ip-a", deviceHash: "dev-a", sinceMs: since })).toBe(1);
    expect(await store.countRecent({ ipHash: "ip-a", sinceMs: Date.now() + 1000 })).toBe(0);
    expect(await store.countRecent({ sinceMs: since })).toBe(0);
  });

  it("admin: filters, counts, queue order, search, update, delete, export", async () => {
    const old = await store.create(input({ toName: "أول", status: "pending", reviewReason: "review_all" }));
    await new Promise((r) => setTimeout(r, 5));
    const newer = await store.create(input({ toName: "ثاني", status: "pending", reviewReason: "review_all" }));
    const surprise = await store.create(input({ toName: "ثالث", surpriseOptIn: true, contact: "+966500000001" }));
    const star = await store.create(input({ toName: "رابع" }));
    await store.adminUpdate(star.id, { starred: true });
    const hid = await store.create(input({ toName: "خامس" }));
    await store.adminUpdate(hid.id, { status: "hidden" });
    await store.report(star.id, "r1", "other", null);

    const res = await store.adminList({ filter: "all", limit: 50, offset: 0 });
    expect(res.total).toBe(5);
    expect(res.counts).toEqual({
      all: 5,
      published: 2,
      pending: 2,
      hidden: 1,
      reported: 1,
      removal: 0,
      starred: 1,
      surprise: 1,
    });
    // Admin rows carry the private fields (the route strips the hashes).
    expect(res.items.find((m) => m.id === surprise.id)?.contact).toBe("+966500000001");

    const queue = await store.adminList({ filter: "pending", limit: 50, offset: 0 });
    expect(queue.items.map((m) => m.id)).toEqual([old.id, newer.id]);
    expect(queue.total).toBe(2);
    expect(queue.counts.all).toBe(5);

    expect((await store.adminList({ filter: "starred", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([star.id]);
    expect((await store.adminList({ filter: "surprise", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([surprise.id]);
    expect((await store.adminList({ filter: "reported", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([star.id]);
    expect((await store.adminList({ filter: "hidden", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([hid.id]);

    // Search by id, contact (any phone format), or name; pagination.
    expect((await store.adminList({ filter: "all", q: star.id, limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([star.id]);
    expect((await store.adminList({ filter: "all", q: "0500000001", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([surprise.id]);
    expect((await store.adminList({ filter: "all", q: "ثالث", limit: 50, offset: 0 })).items.map((m) => m.id)).toEqual([surprise.id]);
    const page2 = await store.adminList({ filter: "all", limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.total).toBe(5);

    // Publishing clears the review reason.
    expect(await store.adminUpdate(old.id, { status: "published" })).toBe(true);
    const published = (await store.adminList({ filter: "all", q: old.id, limit: 1, offset: 0 })).items[0];
    expect(published).toMatchObject({ status: "published", reviewReason: null });
    expect(await store.get(old.id)).not.toBeNull();
    expect(await store.adminUpdate("missing000", { starred: true })).toBe(false);

    // Export.
    const starred = await store.adminExport("starred");
    expect(starred.map((m) => m.id)).toEqual([star.id]);
    const opted = await store.adminExport("surprise");
    expect(opted.map((m) => m.id)).toEqual([surprise.id]);
    expect(messagesToCsv(opted)).toContain("'+966500000001");

    // Delete also drops likes / reports.
    expect(await store.adminDelete(star.id)).toBe(true);
    expect(await store.adminDelete(star.id)).toBe(false);
    expect((await store.adminList({ filter: "all", limit: 50, offset: 0 })).counts).toMatchObject({ all: 4, starred: 0, reported: 0 });
  });

  it("migrates rows written by older versions", async () => {
    const legacyDir = freshDir();
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      path.join(legacyDir, "letters.json"),
      JSON.stringify({
        version: 1,
        messages: [
          {
            id: "legacy0001",
            title: "ustadh",
            toName: "سعد",
            school: null,
            body: "رسالة قديمة من نسخة سابقة 💜",
            fromName: null,
            likes: 5,
            createdAt: "2026-10-01T10:00:00.000Z",
            variant: 3,
            status: "hidden",
            reports: 2,
            ipHash: "old-ip",
            searchText: "سعد",
            moderation: null,
          },
          {
            id: "legacy0002",
            title: "bogus",
            toName: "نورة",
            school: "ثانوية",
            body: "صف قديم بدون حقول جديدة",
            createdAt: "2026-10-02T10:00:00.000Z",
            contact: "+966500000009",
          },
          { id: "broken", body: "no name or date" },
        ],
        likes: { legacy0001: ["v1", 7] },
        reports: { legacy0001: [{ by: "r1", reason: null, at: "2026-10-01T11:00:00.000Z" }] },
      }),
    );

    const legacy = new FileStore({ dir: legacyDir, seedDemo: true });
    const { items, counts } = await legacy.adminList({ filter: "all", limit: 10, offset: 0 });
    expect(items.map((m) => m.id).sort()).toEqual(["legacy0001", "legacy0002"]);
    expect(counts).toMatchObject({ all: 2, hidden: 1, published: 1, reported: 1 });

    const one = items.find((m) => m.id === "legacy0001")!;
    expect(one).toMatchObject({
      variant: 3,
      status: "hidden",
      reports: 2,
      inMemory: false,
      removalRequested: false,
      reviewReason: null,
      starred: false,
      surpriseOptIn: false,
      contact: null,
      deviceHash: null,
    });
    const two = items.find((m) => m.id === "legacy0002")!;
    expect(two.title).toBeNull();
    expect(two.likes).toBe(0);
    expect(two.status).toBe("published");
    expect(two.contact).toBeNull(); // a contact without opt-in is dropped
    expect(two.variant).toBeGreaterThanOrEqual(0);
    expect(two.searchText).not.toBe("");
    expect((await legacy.list({ q: "نورة", sort: "new", limit: 5 })).items.map((m) => m.id)).toEqual(["legacy0002"]);

    // Migrated in place (and not re-seeded, since it had letters).
    const onDisk = JSON.parse(readFileSync(path.join(legacyDir, "letters.json"), "utf8"));
    expect(onDisk.version).toBe(2);
    expect(onDisk.messages).toHaveLength(2);
    expect(onDisk.likes.legacy0001).toEqual(["v1"]);
    expect(onDisk.reports.legacy0001[0].reason).toBe("other");
  });

  it("moves a corrupt file aside and starts fresh", async () => {
    const d = freshDir();
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "letters.json"), "{ not json");
    const s = new FileStore({ dir: d, seedDemo: false });
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void errors.push(a);
    try {
      expect(await s.count()).toBe(0);
    } finally {
      console.error = orig;
    }
    expect(errors).toHaveLength(1);
  });

  it("seeds demo letters (published + a review queue) when empty", async () => {
    const seeded = new FileStore({ dir: freshDir(), seedDemo: true });
    const published = DEMO_LETTERS.filter((d) => d.status !== "pending").length;
    expect(await seeded.count()).toBe(published);
    const { counts, items } = await seeded.adminList({ filter: "pending", limit: 10, offset: 0 });
    expect(counts.pending).toBe(DEMO_LETTERS.length - published);
    expect(items.every((m) => m.reviewReason === "suspicious: demo")).toBe(true);
    expect(counts.surprise).toBe(3);

    const wall = await seeded.list({ sort: "new", limit: 30 });
    expect(wall.items.filter((m) => m.inMemory)).toHaveLength(2);
    expect(new Set(wall.items.map((m) => m.variant)).size).toBe(6);
    expect(JSON.stringify(wall)).not.toMatch(/\+9665|example\.com/);
  });
});
