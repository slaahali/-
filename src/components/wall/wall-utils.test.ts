import { describe, expect, it } from "vitest";
import type { PublicMessage } from "@/lib/types";
import {
  cleanQueryName,
  effectiveQuery,
  isFemaleTitle,
  lettersCount,
  looksLong,
  mergeUnique,
  postmarkDate,
  tiltFor,
  wallSearchUrl,
} from "./wall-utils";

const msg = (id: string): PublicMessage => ({
  id,
  title: null,
  toName: "نورة",
  school: null,
  body: "شكراً لك على كل شيء",
  fromName: null,
  likes: 0,
  createdAt: "2026-09-30T08:00:00.000Z",
  variant: 0,
  inMemory: false,
});

describe("cleanQueryName", () => {
  it.each([
    ["الأستاذة نورة", "نورة"],
    ["أستاذ محمد العتيبي", "محمد العتيبي"],
    ["استاذه منى", "منى"],
    ["الاستاذ خالد", "خالد"],
    ["د. سعد", "سعد"],
    ["د.سعد", "سعد"],
    ["دكتور فهد", "فهد"],
    ["الدكتورة ريم", "ريم"],
    ["المعلمة هند", "هند"],
    ["المعلم  علي ", "علي"],
    ["مس ريم", "ريم"],
    ["الأستاذة الدكتورة نورة", "نورة"],
    ["«نورة»", "نورة"],
  ])("%s → %s", (q, expected) => {
    expect(cleanQueryName(q)).toBe(expected);
  });

  it("keeps names that merely start like an honorific", () => {
    expect(cleanQueryName("مسعود")).toBe("مسعود");
    expect(cleanQueryName("دكتورنا الغالي")).toBe("دكتورنا الغالي");
    expect(cleanQueryName("ثانوية الملك فهد")).toBe("ثانوية الملك فهد");
  });

  it("returns empty when the query is only a title", () => {
    expect(cleanQueryName("أستاذ")).toBe("");
    expect(cleanQueryName("  ")).toBe("");
  });
});

describe("effectiveQuery", () => {
  it("clears to unfiltered on empty input", () => {
    expect(effectiveQuery("   ", "نورة")).toBe("");
  });
  it("keeps the applied query while too short", () => {
    expect(effectiveQuery("ن", "نورة")).toBe("نورة");
  });
  it("uses the trimmed text otherwise", () => {
    expect(effectiveQuery("  نو ", "")).toBe("نو");
  });
});

describe("mergeUnique", () => {
  it("appends only unseen ids and keeps order", () => {
    const out = mergeUnique([msg("a"), msg("b")], [msg("b"), msg("c"), msg("c")]);
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
});

describe("wallSearchUrl", () => {
  const home = { pathname: "/", search: "", hash: "" };

  it("sets q and keeps #letters", () => {
    expect(wallSearchUrl({ ...home, hash: "#letters" }, " نورة ")).toBe(
      `/?q=${encodeURIComponent("نورة")}#letters`,
    );
  });
  it("removes q when cleared but keeps other params", () => {
    expect(wallSearchUrl({ pathname: "/", search: "?q=x&utm_source=wa", hash: "" }, "")).toBe(
      "/?utm_source=wa",
    );
    expect(wallSearchUrl({ pathname: "/", search: "?q=x", hash: "#letters" }, "")).toBe(
      "/#letters",
    );
  });
  it("drops unrelated hashes", () => {
    expect(wallSearchUrl({ ...home, hash: "#write" }, "")).toBe("/");
  });
  it("never touches permalinks", () => {
    expect(wallSearchUrl({ pathname: "/m/abc123", search: "", hash: "" }, "x")).toBeNull();
  });
});

describe("lettersCount", () => {
  it.each([
    [0, "0 رسالة"],
    [1, "رسالة"],
    [2, "رسالتين"],
    [3, "3 رسائل"],
    [10, "10 رسائل"],
    [11, "11 رسالة"],
    [99, "99 رسالة"],
    [100, "100 رسالة"],
    [101, "101 رسالة"],
    [102, "102 رسالة"],
    [103, "103 رسائل"],
    [110, "110 رسائل"],
    [111, "111 رسالة"],
    [240, "240 رسالة"],
    [1000, "1,000 رسالة"],
  ])("%i → %s", (n, expected) => {
    expect(lettersCount(n)).toBe(expected);
  });

  it("can spell out a lone letter", () => {
    expect(lettersCount(1, { one: "رسالة وحدة" })).toBe("رسالة وحدة");
    expect(lettersCount(5, { one: "رسالة وحدة" })).toBe("5 رسائل");
  });
});

describe("postmarkDate", () => {
  it("uses Riyadh time", () => {
    expect(postmarkDate("2026-09-29T08:00:00.000Z")).toEqual({ day: "29", month: "سبتمبر" });
    // 22:30 UTC on 4 Oct is already 5 Oct in Riyadh
    expect(postmarkDate("2026-10-04T22:30:00.000Z")).toEqual({ day: "5", month: "أكتوبر" });
  });
  it("ignores bad dates", () => {
    expect(postmarkDate("nope")).toBeNull();
  });
});

describe("misc", () => {
  it("tilts unevenly but stays small", () => {
    const tilts = Array.from({ length: 12 }, (_, i) => tiltFor(i));
    expect(new Set(tilts).size).toBeGreaterThan(2);
    expect(tilts.every((t) => Math.abs(t) <= 1)).toBe(true);
    expect(tiltFor(0)).not.toBe(tiltFor(1));
  });
  it("guesses long bodies", () => {
    expect(looksLong("قصيرة")).toBe(false);
    expect(looksLong("سطر\n".repeat(8))).toBe(true);
    expect(looksLong("ا".repeat(38 * 7 + 5))).toBe(true);
  });
  it("detects female titles", () => {
    expect(isFemaleTitle("ustadha")).toBe(true);
    expect(isFemaleTitle("dr_f")).toBe(true);
    expect(isFemaleTitle("dr_m")).toBe(false);
    expect(isFemaleTitle(null)).toBe(false);
  });
});
