import { describe, expect, it } from "vitest";
import type { AdminFilter } from "@/lib/types";
import type { AdminMessage } from "./admin-api";
import {
  ADMIN_FILTERS,
  ADMIN_TABS,
  applyPatch,
  countsDelta,
  emptyCounts,
  expandsByDefault,
  exportFilename,
  humanReviewReason,
  inversePatch,
  matchesFilter,
  membershipDelta,
  moderationSummary,
  neighbourId,
  nextOffset,
  normalizeCounts,
  orderForTab,
  pageRange,
  placeItem,
  prevOffset,
  refillOffset,
  runPool,
  shortcutFor,
  showsPrivate,
  stepId,
} from "./admin-model";

function msg(over: Partial<AdminMessage> = {}): AdminMessage {
  return {
    id: "a",
    title: "ustadha",
    toName: "نورة",
    school: null,
    body: "شكراً على كل شي",
    fromName: null,
    likes: 0,
    createdAt: "2026-09-30T10:00:00.000Z",
    variant: 0,
    inMemory: false,
    status: "pending",
    reports: 0,
    removalRequested: false,
    reviewReason: null,
    starred: false,
    surpriseOptIn: false,
    contact: null,
    moderation: null,
    ...over,
  };
}

describe("tabs", () => {
  it("puts the review queue first and covers every filter once", () => {
    expect(ADMIN_TABS[0].filter).toBe("pending");
    const all: AdminFilter[] = ["all", "published", "pending", "hidden", "reported", "removal", "starred", "surprise"];
    expect([...ADMIN_FILTERS].sort()).toEqual([...all].sort());
  });

  it("only shows private contact data in the starred / surprise tabs", () => {
    expect(ADMIN_FILTERS.filter(showsPrivate).sort()).toEqual(["starred", "surprise"]);
  });

  it("expands bodies by default only in review tabs", () => {
    expect(ADMIN_FILTERS.filter(expandsByDefault).sort()).toEqual(["pending", "removal", "reported"]);
  });
});

describe("counts", () => {
  it("normalizes missing / bad counts to zero", () => {
    expect(normalizeCounts({ pending: 3, hidden: "x", starred: -1, all: 7.9 })).toEqual({
      ...emptyCounts(),
      pending: 3,
      all: 7,
    });
    expect(normalizeCounts(null)).toEqual(emptyCounts());
  });

  it("moves a published letter from pending to published", () => {
    const before = msg({ status: "pending" });
    const after = applyPatch(before, { status: "published" });
    const c = countsDelta({ ...emptyCounts(), all: 5, pending: 2, published: 3 }, before, after);
    expect(c).toMatchObject({ all: 5, pending: 1, published: 4 });
  });

  it("handles stars, deletes and never goes negative", () => {
    const m = msg({ starred: false, surpriseOptIn: true, reports: 2 });
    expect(countsDelta(emptyCounts(), m, applyPatch(m, { starred: true })).starred).toBe(1);
    const deleted = countsDelta({ ...emptyCounts(), all: 1, pending: 1, surprise: 1, reported: 1 }, m, null);
    expect(deleted).toMatchObject({ all: 0, pending: 0, surprise: 0, reported: 0 });
    expect(countsDelta(emptyCounts(), m, null).all).toBe(0);
  });
});

describe("filters", () => {
  it("mirrors the server filters", () => {
    const m = msg({ status: "hidden", reports: 1, removalRequested: true, starred: true, surpriseOptIn: true });
    for (const f of ADMIN_FILTERS) expect(matchesFilter(f, m)).toBe(f !== "published" && f !== "pending");
    expect(ADMIN_FILTERS.filter((f) => matchesFilter(f, msg()))).toEqual(["pending", "all"]);
  });

  it("computes the current tab's total delta", () => {
    const m = msg();
    expect(membershipDelta("pending", m, applyPatch(m, { status: "hidden" }))).toBe(-1);
    expect(membershipDelta("pending", m, applyPatch(m, { starred: true }))).toBe(0);
    expect(membershipDelta("hidden", m, applyPatch(m, { status: "hidden" }))).toBe(1);
  });
});

describe("patches", () => {
  it("applies only the given fields and inverts them", () => {
    const m = msg({ status: "pending", starred: true, reviewReason: "review_all" });
    const p = { status: "published" as const };
    const after = applyPatch(m, p);
    expect(after).toMatchObject({ status: "published", starred: true, reviewReason: null });
    expect(applyPatch(m, { status: "hidden" }).reviewReason).toBe("review_all");
    expect(inversePatch(m, p)).toEqual({ status: "pending" });
    expect(inversePatch(m, { starred: false })).toEqual({ starred: true });
  });
});

describe("placeItem", () => {
  const list = [msg({ id: "a" }), msg({ id: "b" }), msg({ id: "c" })];

  it("replaces when the letter still belongs to the tab", () => {
    const next = placeItem(list, "b", msg({ id: "b", starred: true }), "pending", 1);
    expect(next.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(next[1].starred).toBe(true);
  });

  it("removes when it leaves the tab or is deleted", () => {
    expect(placeItem(list, "b", msg({ id: "b", status: "published" }), "pending", 1).map((m) => m.id)).toEqual(["a", "c"]);
    expect(placeItem(list, "a", null, "pending", 0).map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("re-inserts at the hint on rollback / undo, clamped to the list", () => {
    const short = [msg({ id: "a" }), msg({ id: "c" })];
    expect(placeItem(short, "b", msg({ id: "b" }), "pending", 1).map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(placeItem(short, "z", msg({ id: "z" }), "pending", 99).map((m) => m.id)).toEqual(["a", "c", "z"]);
    expect(placeItem(short, "z", msg({ id: "z", status: "hidden" }), "pending", 0)).toEqual(short);
  });

  it("restores original order when several rollbacks run in list order", () => {
    let l = list.slice();
    l = placeItem(l, "a", null, "pending", 0);
    l = placeItem(l, "c", null, "pending", 2);
    l = placeItem(l, "a", msg({ id: "a" }), "pending", 0);
    l = placeItem(l, "c", msg({ id: "c" }), "pending", 2);
    expect(l.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("queue order + cursor", () => {
  it("sorts the pending queue oldest first, stable for ties / bad dates", () => {
    const items = [
      msg({ id: "new", createdAt: "2026-09-30T12:00:00Z" }),
      msg({ id: "old", createdAt: "2026-09-29T12:00:00Z" }),
      msg({ id: "mid", createdAt: "2026-09-30T08:00:00Z" }),
    ];
    expect(orderForTab("pending", items).map((m) => m.id)).toEqual(["old", "mid", "new"]);
    expect(orderForTab("published", items).map((m) => m.id)).toEqual(["new", "old", "mid"]);
    const bad = [msg({ id: "x", createdAt: "" }), msg({ id: "y", createdAt: "" })];
    expect(orderForTab("pending", bad).map((m) => m.id)).toEqual(["x", "y"]);
  });

  it("hands the cursor to the next item, else the previous one", () => {
    const l = [msg({ id: "a" }), msg({ id: "b" }), msg({ id: "c" })];
    expect(neighbourId(l, "b")).toBe("c");
    expect(neighbourId(l, "c")).toBe("b");
    expect(neighbourId([msg({ id: "a" })], "a")).toBeNull();
    expect(neighbourId(l, "zz")).toBeNull();
  });

  it("steps J/K within bounds", () => {
    const l = [msg({ id: "a" }), msg({ id: "b" })];
    expect(stepId(l, null, 1)).toBe("a");
    expect(stepId(l, null, -1)).toBe("b");
    expect(stepId(l, "a", 1)).toBe("b");
    expect(stepId(l, "b", 1)).toBe("b");
    expect(stepId(l, "a", -1)).toBe("a");
    expect(stepId([], "a", 1)).toBeNull();
  });
});

describe("pagination", () => {
  it("labels ranges", () => {
    expect(pageRange(0, 25, 80)).toEqual({ from: 1, to: 25, total: 80 });
    expect(pageRange(25, 10, 35)).toEqual({ from: 26, to: 35, total: 35 });
    expect(pageRange(0, 0, 0)).toEqual({ from: 0, to: 0, total: 0 });
  });

  it("continues after what is still shown (acted-on items already left the server page)", () => {
    expect(nextOffset(0, 25)).toBe(25);
    expect(nextOffset(0, 20)).toBe(20);
    expect(prevOffset(25)).toBe(0);
    expect(prevOffset(10)).toBe(0);
  });

  it("refills an emptied page from the same offset, or the last page", () => {
    expect(refillOffset(0, 40)).toBe(0);
    expect(refillOffset(25, 40)).toBe(25);
    expect(refillOffset(25, 25)).toBe(0);
    expect(refillOffset(50, 26)).toBe(25);
    expect(refillOffset(25, 0)).toBe(0);
  });
});

describe("shortcuts", () => {
  it("maps physical keys, so an Arabic layout works too", () => {
    expect(shortcutFor({ code: "KeyA", key: "ش" })).toBe("publish");
    expect(shortcutFor({ code: "KeyH", key: "ا" })).toBe("hide");
    expect(shortcutFor({ code: "KeyS", key: "س" })).toBe("star");
    expect(shortcutFor({ code: "KeyJ", key: "ت" })).toBe("next");
    expect(shortcutFor({ code: "KeyK", key: "ن" })).toBe("prev");
    expect(shortcutFor({ key: "a" })).toBe("publish");
    expect(shortcutFor({ key: "J" })).toBe("next");
  });

  it("ignores modifiers, IME composition and other keys", () => {
    expect(shortcutFor({ code: "KeyA", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ code: "KeyS", metaKey: true })).toBeNull();
    expect(shortcutFor({ code: "KeyA", altKey: true })).toBeNull();
    expect(shortcutFor({ code: "KeyA", isComposing: true })).toBeNull();
    expect(shortcutFor({ code: "KeyB", key: "b" })).toBeNull();
    expect(shortcutFor({ key: "Enter" })).toBeNull();
  });
});

describe("labels", () => {
  it("humanizes review reasons", () => {
    expect(humanReviewReason(null)).toBeNull();
    expect(humanReviewReason("  ")).toBeNull();
    expect(humanReviewReason("review_all")).toBe("وضع مراجعة كل الرسائل");
    expect(humanReviewReason("removal_request")).toBe("طلب حذف من الشخص المذكور");
    expect(humanReviewReason("reports:3")).toBe("وصلت حد البلاغات");
    expect(humanReviewReason("suspicious: profanity")).toBe("اشتباه من الفلتر: ألفاظ غير لائقة");
    expect(humanReviewReason("suspicious")).toBe("اشتباه من الفلتر");
    expect(humanReviewReason("something new")).toBe("something new");
  });

  it("summarizes the automatic filter", () => {
    expect(moderationSummary(null)).toBeNull();
    expect(moderationSummary({ layer: "none", flagged: false })).toBe("بدون فحص · سليمة");
    expect(moderationSummary({ layer: "ai", flagged: false, suspicious: true, reason: "ai_flagged" })).toBe(
      "الفحص الذكي · غير متأكد · رصد آلي",
    );
    expect(moderationSummary({ layer: "wordlist", flagged: true, reason: "link" })).toBe(
      "قائمة الكلمات · مرفوضة آلياً · رابط",
    );
  });

  it("names export files by filter and date", () => {
    expect(exportFilename("starred", new Date(2026, 9, 5))).toBe("thechefz-teachers-day-starred-2026-10-05.csv");
    expect(exportFilename("surprise", new Date(2026, 0, 1))).toBe("thechefz-teachers-day-surprise-2026-01-01.csv");
  });
});

describe("runPool", () => {
  it("caps concurrency, keeps order and captures failures", async () => {
    let inFlight = 0;
    let peak = 0;
    const res = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (n === 4) throw new Error("boom");
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(res.map((r) => (r.status === "fulfilled" ? r.value : "x"))).toEqual([10, 20, 30, "x", 50, 60, 70]);
  });

  it("handles an empty list", async () => {
    expect(await runPool([], 4, async () => 1)).toEqual([]);
  });
});
