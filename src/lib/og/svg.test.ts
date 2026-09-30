import { describe, expect, it } from "vitest";
import {
  buildOgSvg,
  escapeXml,
  fitLine,
  pickSans,
  stripEmoji,
  textWidth,
  wrapText,
  type OgBrand,
  type OgLetterScene,
  type OgSearchScene,
} from "./svg";

const brand: OgBrand = {
  logo: "data:image/png;base64,iVBORw0KGgo=",
  logoRatio: 497 / 120,
  wordmark: "ذا شفز",
  host: "example.com",
  postmarkTop: "يوم المعلم",
  postmarkBottom: "٥ أكتوبر",
};

const letter = (over: Partial<OgLetterScene> = {}): OgLetterScene => ({
  kind: "letter",
  toLabel: "إلى",
  toName: "أستاذة نورة",
  school: "ثانوية الملك فهد",
  body: "شكراً لأنك آمنت فيني",
  signature: "— سارة",
  date: "5 أكتوبر 2026",
  stamp: "شكراً معلمي",
  memory: false,
  palette: { key: "orange", accent: "#eb652c", bg: "#fde3d6", ink: "#4f1f0c", gradient: ["#f7a64f", "#eb652c"], icon: "books" },
  seed: "abc",
  brand,
  ...over,
});

const search = (over: Partial<OgSearchScene> = {}): OgSearchScene => ({
  kind: "search",
  total: 0,
  countNumber: "0",
  countLabel: "رسالة شكر",
  toLabel: "إلى",
  query: "سرّي",
  tagline: "اكتشف وش كتبوا",
  emptyTitle: "ما أحد كتب لك للحين؟",
  emptyLead: "ابدأ أنت واكتب لأحد علّمك",
  emptyCta: "اكتب رسالتك",
  brand,
  ...over,
});

/** font-family of the <text> element holding `s` (inside RLE…PDF). */
function familyOf(svg: string, s: string): string | undefined {
  const i = svg.indexOf(`‫${s}‬`);
  if (i < 0) return undefined;
  const open = svg.lastIndexOf("<text", i);
  return /font-family="([^"]+)"/.exec(svg.slice(open, i))?.[1];
}

describe("stripEmoji", () => {
  it("removes emoji, ZWJ sequences, flags, keycaps and variation selectors", () => {
    expect(stripEmoji("شكراً 💜✨ يا أستاذة 👩‍🔧 🇸🇦 1️⃣ ✍️")).toBe("شكراً يا أستاذة");
    expect(stripEmoji("في ذكراك 🤍")).toBe("في ذكراك");
  });
  it("keeps Arabic, Latin, digits and punctuation", () => {
    expect(stripEmoji("دفعة 2016 (Riyadh) «نورة»، شكراً!")).toBe("دفعة 2016 (Riyadh) «نورة»، شكراً!");
  });
  it("drops control and bidi override characters", () => {
    expect(stripEmoji("a\u0000b‮c⁦d‏e")).toBe("abcde");
  });
  it("collapses whitespace", () => {
    expect(stripEmoji("  سطر\n\nثاني\t 😀  ثالث ")).toBe("سطر ثاني ثالث");
  });
});

describe("escapeXml", () => {
  it("escapes markup characters", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("wrapText / fitLine", () => {
  it("wraps within the width and ellipsizes past maxLines", () => {
    const words = Array.from({ length: 80 }, (_, i) => (i % 2 ? "معلمي" : "شكراً")).join(" ");
    const { lines, truncated } = wrapText(words, 500, 30, "hand", 3);
    expect(lines).toHaveLength(3);
    expect(truncated).toBe(true);
    expect(lines[2].endsWith("…")).toBe(true);
    for (const l of lines) expect(textWidth(l, 30, "hand")).toBeLessThanOrEqual(500);
  });
  it("hard-breaks a single overlong word", () => {
    const { lines } = wrapText("ا".repeat(200), 300, 30, "sans", 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 30, "sans")).toBeLessThanOrEqual(300);
  });
  it("shrinks, then truncates", () => {
    expect(fitLine("أستاذ علي", 700, 56, 34, "sansBold").size).toBe(56);
    const long = fitLine("عبدالرحمن ".repeat(8).trim(), 500, 56, 34, "sansBold");
    expect(long.size).toBe(34);
    expect(long.text.endsWith("…")).toBe(true);
  });
  it("does not underestimate short Ruqaa signatures (the date sits right beside them)", () => {
    // Widths measured with resvg + ArefRuqaa-Bold at 34px.
    expect(textWidth("— أحد طلابك", 34, "handBold") * 1.1).toBeGreaterThanOrEqual(158);
    expect(textWidth("— Lama", 34, "handBold") * 1.1).toBeGreaterThanOrEqual(138);
    expect(textWidth("— فهد", 34, "handBold") * 1.1).toBeGreaterThanOrEqual(78);
  });
});

describe("font choice (resvg falls back per <text>, not per glyph)", () => {
  it("uses Molhim for Arabic, Plex once Latin letters appear", () => {
    expect(pickSans(["شكراً يا أستاذة نورة ٥ أكتوبر 2026"])).toBe("molhim");
    expect(pickSans(["شكراً Ms. Sarah"])).toBe("plex");
    // «» … — have Molhim-safe stand-ins, so they don't force a fallback.
    expect(pickSans(["إلى «نورة» — شكراً…"])).toBe("molhim");
  });
  it("keeps one family for a whole block", () => {
    expect(pickSans(["سطر عربي", "and one Latin line"])).toBe("plex");
  });
  it("draws Arabic runs in Molhim and Latin runs in Plex", () => {
    const svg = buildOgSvg(letter({ school: "British International School" }));
    expect(familyOf(svg, "أستاذة نورة")).toBe("Molhim");
    expect(familyOf(svg, "British International School")).toBe("IBM Plex Sans Arabic");
    expect(familyOf(svg, "— سارة")).toBe("Aref Ruqaa");
  });
  it("swaps «» for quotes Molhim has instead of falling back", () => {
    const svg = buildOgSvg(letter({ body: "عبارتك «اللي يتعب»" }));
    expect(svg).toContain("‫عبارتك &quot;اللي يتعب&quot;‬");
    expect(familyOf(svg, "عبارتك &quot;اللي يتعب&quot;")).toBe("Molhim");
  });
});

describe("buildOgSvg", () => {
  it("escapes user text", () => {
    const svg = buildOgSvg(letter({ body: `<script>alert("x")</script> & شكراً`, toName: "<b>" }));
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&quot;x&quot;");
    expect(svg).toContain("&amp;");
  });
  it("wraps Arabic lines in RLE…PDF for correct bidi in resvg", () => {
    expect(buildOgSvg(letter())).toContain("‫أستاذة نورة‬");
  });
  it("embeds the official logo, or falls back to the wordmark", () => {
    expect(buildOgSvg(letter())).toContain('<image href="data:image/png;base64,iVBORw0KGgo="');
    const plain = buildOgSvg(letter({ brand: { ...brand, logo: null } }));
    expect(plain).not.toContain("<image");
    expect(plain).toContain("‫ذا شفز‬");
  });
  it("uses the dove seal for memory letters", () => {
    const heart = buildOgSvg(letter());
    const dove = buildOgSvg(letter({ memory: true }));
    expect(heart).not.toBe(dove);
    expect(dove).toContain("M3 14.5c2.6.2");
  });
  it("only draws the query when the search matched letters", () => {
    expect(buildOgSvg(search())).not.toContain("سرّي");
    expect(buildOgSvg(search())).toContain("ما أحد كتب لك للحين؟");
    expect(buildOgSvg(search({ total: 3, countNumber: "3" }))).toContain("‫سرّي‬");
  });
});
