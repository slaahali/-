import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PublicMessage } from "../types";
import { messagesToCsv } from "./csv";
import { DEMO_LETTERS } from "./demo-data";
import { FileStore } from "./file-store";
import { makeTestDir } from "./test-dirs";
import type { NewMessage, ReportInput, Voter } from "./types";

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
      for (let v = 0; v < i % 4; v++) await store.toggleLike(m.id, true, voter(`voter-${v}`));
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
    expect(await store.toggleLike(m.id, true, voter("v1"))).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, true, voter("v1"))).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, true, voter("v2"))).toEqual({ likes: 2, liked: true });
    expect(await store.toggleLike(m.id, false, voter("v1"))).toEqual({ likes: 1, liked: false });
    expect(await store.toggleLike(m.id, false, voter("v1"))).toEqual({ likes: 1, liked: false });
    expect(await store.toggleLike("missing000", true, voter("v1"))).toBeNull();

    const pend = await store.create(input({ status: "pending" }));
    expect(await store.toggleLike(pend.id, true, voter("v1"))).toBeNull();

    // Concurrent likes from many voters (with cookies, same IP) all count.
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.toggleLike(m.id, true, voter(`c${i}`))));
    expect((await store.get(m.id))?.likes).toBe(21);
  });

  it("counts one cookie-less like per letter per IP per day (durably)", async () => {
    const m = await store.create(input());
    const other = await store.create(input());
    expect(await store.toggleLike(m.id, true, voter("n1", "ip-x", true))).toEqual({ likes: 1, liked: true });
    // Same IP, no cookie again: acknowledged, not counted.
    expect(await store.toggleLike(m.id, true, voter("n2", "ip-x", true))).toEqual({ likes: 1, liked: true });
    await Promise.all(Array.from({ length: 5 }, (_, i) => store.toggleLike(m.id, true, voter(`n${i + 3}`, "ip-x", true))));
    expect((await store.get(m.id))?.likes).toBe(1);
    // Other IPs, other letters, and devices with a cookie are unaffected.
    expect(await store.toggleLike(m.id, true, voter("n9", "ip-y", true))).toEqual({ likes: 2, liked: true });
    expect(await store.toggleLike(other.id, true, voter("n10", "ip-x", true))).toEqual({ likes: 1, liked: true });
    expect(await store.toggleLike(m.id, true, voter("known", "ip-x"))).toEqual({ likes: 3, liked: true });

    // Survives a restart (a new instance reading the same file).
    const again = new FileStore({ dir, seedDemo: false });
    expect(await again.toggleLike(m.id, true, voter("n11", "ip-x", true))).toEqual({ likes: 3, liked: true });
    // …and expires after a day.
    const file = path.join(dir, "letters.json");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.likeIps[m.id]["ip-x"] = new Date(Date.now() - 25 * 3600_000).toISOString();
    writeFileSync(file, JSON.stringify(raw));
    const later = new FileStore({ dir, seedDemo: false });
    expect(await later.toggleLike(m.id, true, voter("n12", "ip-x", true))).toEqual({ likes: 4, liked: true });
  });

  it("hides a letter after REPORT_HIDE_THRESHOLD distinct reporters; a moderator re-publish sticks", async () => {
    const m = await store.create(input());
    expect(await store.report(m.id, rep("r1", "inappropriate", null, "ip-1"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r1", "inappropriate", "again", "ip-1"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r2", "other", "ملاحظة", "ip-2"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("r3", "inappropriate", null, "ip-3"))).toEqual({ hidden: true });
    expect(await store.get(m.id)).toBeNull();

    let row = (await store.adminList({ filter: "pending", limit: 10, offset: 0 })).items[0];
    expect(row).toMatchObject({ id: m.id, status: "pending", reports: 3, reviewReason: "reports", removalRequested: false });

    expect(await store.adminUpdate(m.id, { status: "published" })).toBe(true);
    expect(await store.report(m.id, rep("r4", "inappropriate", null, "ip-4"))).toEqual({ hidden: false });
    row = (await store.adminList({ filter: "reported", limit: 10, offset: 0 })).items[0];
    expect(row).toMatchObject({ status: "published", reports: 4, reviewReason: null, removalKept: false });
    expect(await store.report("missing000", rep("r1", "other"))).toBeNull();
  });

  it("a reporter is a device OR an IP: cookie-less repeats from one IP never add up", async () => {
    const m = await store.create(input());
    for (let i = 0; i < 6; i++) {
      expect(await store.report(m.id, rep(`fresh-${i}`, "inappropriate", null, "ip-attacker", true))).toEqual({ hidden: false });
    }
    // Another device behind the same IP doesn't count either; a new device + new IP does.
    await store.report(m.id, rep("dev-2", "other", null, "ip-attacker"));
    await store.report(m.id, rep("dev-3", "other", null, "ip-3"));
    const [row] = (await store.adminList({ filter: "reported", limit: 5, offset: 0 })).items;
    expect(row).toMatchObject({ id: m.id, reports: 2, status: "published" });
    // Only the counted reports are stored.
    const raw = JSON.parse(readFileSync(path.join(dir, "letters.json"), "utf8"));
    expect(raw.reports[m.id]).toHaveLength(2);
    // Unknown IP (no proxy header): the device is all we have.
    await store.report(m.id, rep("dev-4", "other", null, null, true));
    expect((await store.adminList({ filter: "reported", limit: 5, offset: 0 })).items[0]).toMatchObject({ reports: 3, status: "pending" });
  });

  it("a removal request hides the letter immediately for review", async () => {
    const m = await store.create(input());
    expect(await store.report(m.id, rep("r1", "inappropriate", null, "ip-1"))).toEqual({ hidden: false });
    // Same reporter can still escalate to a removal request (once).
    expect(await store.report(m.id, rep("r1", "removal_request", "أنا نورة", "ip-1"))).toEqual({ hidden: true });
    expect(await store.get(m.id)).toBeNull();

    const [row] = (await store.adminList({ filter: "removal", limit: 10, offset: 0 })).items;
    expect(row).toMatchObject({
      id: m.id,
      status: "pending",
      removalRequested: true,
      reviewReason: "removal_request",
      reports: 1,
      removalKept: false,
    });
    expect(row.flaggedAt).toBeTruthy();

    // A hidden letter stays hidden but is flagged.
    const h = await store.create(input());
    await store.adminUpdate(h.id, { status: "hidden" });
    expect(await store.report(h.id, rep("r9", "removal_request", null, "ip-9"))).toEqual({ hidden: true });
    const hidden = (await store.adminList({ filter: "hidden", limit: 10, offset: 0 })).items[0];
    expect(hidden).toMatchObject({ status: "hidden", removalRequested: true });
  });

  it("after a moderator keeps a letter, later removal requests only flag it", async () => {
    const m = await store.create(input());
    await store.report(m.id, rep("r1", "removal_request", null, "ip-1"));
    // Moderator decides to keep it: published again, removalRequested kept for audit.
    await store.adminUpdate(m.id, { status: "published" });
    let row = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items[0];
    expect(row).toMatchObject({ status: "published", removalRequested: true, removalKept: true, reviewReason: null });

    // Same device or IP again: nothing changes.
    expect(await store.report(m.id, rep("r1", "removal_request", null, "ip-1"))).toEqual({ hidden: false });
    expect(await store.report(m.id, rep("fresh", "removal_request", null, "ip-1", true))).toEqual({ hidden: false });
    row = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items[0];
    expect(row.reviewReason).toBeNull();

    // Someone else: stays public, flagged for another look and first in the removal tab.
    const other = await store.create(input());
    await store.report(other.id, rep("r7", "removal_request", null, "ip-7"));
    await new Promise((r) => setTimeout(r, 5));
    expect(await store.report(m.id, rep("r2", "removal_request", "مرة ثانية", "ip-2"))).toEqual({ hidden: false });
    expect(await store.get(m.id)).not.toBeNull();
    const removal = (await store.adminList({ filter: "removal", limit: 10, offset: 0 })).items;
    expect(removal.map((x) => x.id)).toEqual([m.id, other.id]);
    expect(removal[0]).toMatchObject({ status: "published", reviewReason: "removal_request_again" });

    // "Keep" again clears the flag.
    await store.adminUpdate(m.id, { status: "published" });
    row = (await store.adminList({ filter: "all", q: m.id, limit: 1, offset: 0 })).items[0];
    expect(row).toMatchObject({ status: "published", reviewReason: null, removalKept: true });
  });

  it("caps new removal requests per device and per IP per day", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => store.create(input()).then((m) => m.id)));
    // Per device: 3 a day.
    for (const id of ids.slice(0, 3)) expect(await store.report(id, rep("dev-a", "removal_request", null, `ip-${id}`))).toEqual({ hidden: true });
    expect(await store.report(ids[3], rep("dev-a", "removal_request", null, "ip-new"))).toEqual({ hidden: false, limited: true });
    // Per IP (cookie-less, a new device each time): 5 a day.
    for (const id of ids.slice(3, 8)) {
      expect((await store.report(id, rep(`fresh-${id}`, "removal_request", null, "ip-b", true)))?.limited).toBeFalsy();
    }
    const extra = await store.create(input());
    expect(await store.report(extra.id, rep("fresh-x", "removal_request", null, "ip-b", true))).toEqual({ hidden: false, limited: true });
    expect(await store.get(extra.id)).not.toBeNull();
    // Ordinary reports aren't capped this way.
    expect(await store.report(extra.id, rep("fresh-y", "inappropriate", null, "ip-b", true))).toEqual({ hidden: false });
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
    await store.report(star.id, rep("r1", "other"));

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
      removalKept: false,
      flaggedAt: null,
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
    expect(onDisk.reports.legacy0001[0]).toMatchObject({ reason: "other", ip: null });
    expect(onDisk.likeIps).toEqual({});
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
