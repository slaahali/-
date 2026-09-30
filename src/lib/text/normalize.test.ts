import { describe, expect, it } from "vitest";
import {
  asciiDigits,
  buildSearchText,
  cleanInput,
  foldText,
  matchesQuery,
  normalizeArabic,
  stripTitles,
  tokenizeQuery,
} from "./normalize";

const ZWSP = "\u200B";
const ZWNJ = "\u200C";
const ZWJ = "\u200D";
const RLO = "\u202E";
const BOM = "\uFEFF";

describe("cleanInput", () => {
  it("trims and collapses spaces on one line", () => {
    expect(cleanInput("   نورة    الزهراني  ")).toBe("نورة الزهراني");
  });

  it("turns newlines into spaces for single-line fields", () => {
    expect(cleanInput("ثانوية\nالملك\r\nفهد")).toBe("ثانوية الملك فهد");
  });

  it("keeps line breaks in multiline mode but caps blank lines at one", () => {
    expect(cleanInput("سطر أول  \n\n\n\n  سطر ثاني\r\nسطر ثالث", { multiline: true })).toBe(
      "سطر أول\n\nسطر ثاني\nسطر ثالث",
    );
  });

  it("strips zero-width, bidi-override, BOM and control characters", () => {
    expect(cleanInput(`ك${ZWSP}ل${ZWNJ}ب${RLO}${BOM}\u0007`)).toBe("كلب");
    expect(cleanInput("a\u0000b\u001Fc\u007F")).toBe("abc");
  });

  it("strips invisible filler characters used for blank names", () => {
    expect(cleanInput("\u3164\u2800 سارة \u115F")).toBe("سارة");
  });

  it("keeps emoji ZWJ sequences intact but drops stray joiners", () => {
    const teacher = `👩${ZWJ}🏫`;
    expect(cleanInput(`شكراً ${teacher}`)).toBe(`شكراً ${teacher}`);
    expect(cleanInput(`ك${ZWJ}ل${ZWJ}ب`)).toBe("كلب");
  });

  it("normalises to NFC", () => {
    expect(cleanInput("e\u0301cole")).toBe("\u00E9cole");
  });

  it("caps Zalgo-style stacks of combining marks", () => {
    const zalgo = "a" + "\u0301".repeat(30);
    // NFC folds the first mark into "á"; at most 4 more may stay stacked on it.
    expect(cleanInput(zalgo)).toBe("\u00E1" + "\u0301".repeat(4));
  });

  it("converts non-breaking and exotic spaces to plain spaces", () => {
    expect(cleanInput("مس\u00A0سارة\u2003الحربي")).toBe("مس سارة الحربي");
  });

  it("leaves Arabic diacritics and emoji alone", () => {
    expect(cleanInput("شُكْرًا 💜✨")).toBe("شُكْرًا 💜✨");
  });

  it("handles empty / nullish input", () => {
    expect(cleanInput("")).toBe("");
    expect(cleanInput(undefined as unknown as string)).toBe("");
  });
});

describe("normalizeArabic", () => {
  it("unifies alef forms, taa marbuta, alef maqsura and hamza carriers", () => {
    expect(normalizeArabic("أحمد إبراهيم آمنة ٱلعلم")).toBe("احمد ابراهيم امنه العلم");
    expect(normalizeArabic("مصطفى هدى")).toBe("مصطفي هدي");
    expect(normalizeArabic("مؤمن سائد")).toBe("مومن سايد");
  });

  it("strips tashkeel and tatweel", () => {
    expect(normalizeArabic("مُحَمَّد")).toBe("محمد");
    expect(normalizeArabic("شكـــــراً")).toBe("شكرا");
  });

  it("maps Persian letters and Arabic-Indic / Persian digits", () => {
    expect(normalizeArabic("کریم")).toBe("كريم");
    expect(normalizeArabic("٢٠١٦ ۱۴۴۰")).toBe("2016 1440");
    expect(asciiDigits("٠٥٥١٢٣")).toBe("055123");
  });

  it("turns punctuation and emoji into single spaces and lowercases Latin", () => {
    expect(normalizeArabic("  Ms. SARAH، شكراً!!  💜 ")).toBe("ms sarah شكرا");
  });

  it("folds presentation forms and full-width letters", () => {
    expect(normalizeArabic("\uFEDB\uFEE0\uFEE4\uFE94")).toBe("كلمه");
    expect(normalizeArabic("ＡＢＣ")).toBe("abc");
  });

  it("removes invisible characters inside words", () => {
    expect(normalizeArabic(`نو${ZWSP}رة`)).toBe("نوره");
  });

  it("is idempotent", () => {
    const once = normalizeArabic("الأستاذة فاطمة الشمّري — ثانوية ٣");
    expect(normalizeArabic(once)).toBe(once);
  });

  it("foldText keeps punctuation that the filter needs", () => {
    expect(foldText("A@B.com")).toBe("a@b.com");
  });
});

describe("stripTitles", () => {
  it("removes honorifics as whole words only", () => {
    expect(stripTitles(normalizeArabic("الأستاذة نورة"))).toBe("نوره");
    expect(stripTitles(normalizeArabic("أ. خالد"))).toBe("خالد");
    expect(stripTitles(normalizeArabic("د. هيفاء"))).toBe("هيفاء");
    expect(stripTitles(normalizeArabic("الدكتور محمد"))).toBe("محمد");
    expect(stripTitles(normalizeArabic("مس سارة"))).toBe("ساره");
    expect(stripTitles(normalizeArabic("Mr. Ahmed"))).toBe("ahmed");
    expect(stripTitles(normalizeArabic("المعلمة أمل"))).toBe("امل");
    expect(stripTitles(normalizeArabic("أبلة منيرة"))).toBe("منيره");
  });

  it("does not touch names that merely contain a title", () => {
    expect(stripTitles(normalizeArabic("مستورة"))).toBe("مستوره");
    expect(stripTitles(normalizeArabic("دكتورية"))).toBe("دكتوريه");
    expect(stripTitles("drake")).toBe("drake");
  });
});

describe("buildSearchText / tokenizeQuery / matchesQuery", () => {
  const m = { title: "ustadh" as const, toName: "أستاذ عبد الله الشهري", school: "ثانوية الملك فهد" };

  it("builds normalised text without titles, plus joined compound names", () => {
    const text = buildSearchText(m);
    expect(text).toContain("عبد الله الشهري ثانويه الملك فهد");
    expect(text).toContain("عبدالله");
    expect(text).not.toContain("استاذ");
  });

  it("handles a missing school", () => {
    expect(buildSearchText({ title: null, toName: "أمل", school: null })).toBe("امل");
  });

  it("tokenises queries: normalised, titles stripped, deduped, max 6", () => {
    expect(tokenizeQuery("الأستاذ عبدالله")).toEqual(["عبدالله"]);
    expect(tokenizeQuery("نورة نورة  نوره")).toEqual(["نوره"]);
    expect(tokenizeQuery("a b c d e f g h")).toHaveLength(6);
    expect(tokenizeQuery("  ")).toEqual([]);
  });

  it("matches every token as a substring (AND)", () => {
    const text = buildSearchText(m);
    expect(matchesQuery(text, tokenizeQuery("عبدالله"))).toBe(true);
    expect(matchesQuery(text, tokenizeQuery("عبد الله الشهري"))).toBe(true);
    expect(matchesQuery(text, tokenizeQuery("الشهرى ثانوية"))).toBe(true);
    expect(matchesQuery(text, tokenizeQuery("أستاذ الشهري"))).toBe(true);
    expect(matchesQuery(text, tokenizeQuery("الشهري جامعة"))).toBe(false);
  });

  it("finds hamza / taa marbuta spelling variants", () => {
    const text = buildSearchText({ title: "ustadha", toName: "فاطمة الأحمدي", school: null });
    expect(matchesQuery(text, tokenizeQuery("فاطمه الاحمدي"))).toBe(true);
  });
});
