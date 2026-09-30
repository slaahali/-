import { describe, expect, it } from "vitest";
import type { PublicMessage } from "@/lib/types";
import {
  cleanQueryName,
  effectiveQuery,
  isFemaleTitle,
  looksLong,
  mergeUnique,
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

describe("misc", () => {
  it("alternates tilt", () => {
    expect(tiltFor(0)).toBe(-0.6);
    expect(tiltFor(1)).toBe(0.6);
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
