import { describe, expect, it } from "vitest";
import { buildOgSvg, escapeXml, fitLine, stripEmoji, textWidth, wrapText, type OgLetterScene } from "./svg";

const letter = (over: Partial<OgLetterScene> = {}): OgLetterScene => ({
  kind: "letter",
  label: "رسالة شكر",
  to: "إلى: أستاذة نورة",
  school: "ثانوية الملك فهد",
  body: "شكراً لأنك آمنت فيني",
  signature: "— سارة",
  stamp: "شكراً معلمي",
  memory: false,
  palette: { accent: "#eb652c", bg: "#fde3d6", ink: "#4f1f0c", gradient: ["#f7a64f", "#eb652c"] },
  brandLine: "ذا شفز · يوم المعلم",
  host: "example.com",
  ...over,
});

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
    expect(fitLine("إلى: أستاذ علي", 700, 56, 34, "sansBold").size).toBe(56);
    const long = fitLine("إلى: " + "عبدالرحمن ".repeat(8), 500, 56, 34, "sansBold");
    expect(long.size).toBe(34);
    expect(long.text.endsWith("…")).toBe(true);
  });
});

describe("buildOgSvg", () => {
  it("escapes user text", () => {
    const svg = buildOgSvg(letter({ body: `<script>alert("x")</script> & شكراً`, to: "إلى: <b>" }));
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;");
  });
  it("wraps Arabic lines in RLE…PDF for correct bidi in resvg", () => {
    const svg = buildOgSvg(letter());
    expect(svg).toContain("‫إلى: أستاذة نورة‬");
  });
  it("only draws the query when the search matched letters", () => {
    const base = {
      kind: "search" as const,
      countNumber: "0",
      countLabel: "رسالة شكر",
      toQuery: "إلى «سرّي»",
      tagline: "اكتشف وش كتبوا",
      emptyTitle: "ما أحد كتب لك للحين؟",
      emptyLead: "ابدأ أنت واكتب لأحد علّمك",
      emptyCta: "اكتب رسالتك",
      brandLine: "ذا شفز",
      host: "example.com",
    };
    expect(buildOgSvg({ ...base, total: 0 })).not.toContain("سرّي");
    expect(buildOgSvg({ ...base, total: 0 })).toContain("ما أحد كتب لك للحين؟");
    expect(buildOgSvg({ ...base, total: 3, countNumber: "3" })).toContain("إلى «سرّي»");
  });
});
