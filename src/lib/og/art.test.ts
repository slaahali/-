import { describe, expect, it } from "vitest";
import { CARD_COLORS, MEMORY_STYLE } from "@/lib/assets";
import { canUseMolhim, envelopeColors, inkOnColor, perforatedPath, toMolhimPunctuation, waxBlobPath, seeded } from "./art";

describe("Molhim coverage", () => {
  it("accepts Arabic, both digit sets and common punctuation", () => {
    expect(canUseMolhim("إلى: أستاذة نورة، شكراً! (٥ أكتوبر 2026) #شكرا_معلمي؟")).toBe(true);
  });
  it("rejects Latin letters and the marks Molhim lacks", () => {
    for (const s of ["Ms. Sarah", "«نورة»", "شكراً…", "— سارة", "ذا شفز · يوم", "a@b.co", "پ"]) {
      expect(canUseMolhim(s)).toBe(false);
    }
  });
  it("swaps «» — … for marks it has", () => {
    const s = toMolhimPunctuation("«نورة» — شكراً…");
    expect(s).toBe('"نورة" - شكراً...');
    expect(canUseMolhim(s)).toBe(true);
  });
});

describe("envelope colours", () => {
  it("gives every card colour a readable ink on its envelope", () => {
    for (const style of [...CARD_COLORS, MEMORY_STYLE]) {
      const env = envelopeColors(style);
      expect(env.base).toMatch(/^#[0-9a-f]{6}$/);
      expect([env.ink]).toContain(inkOnColor(env.base));
    }
  });
});

describe("paths", () => {
  it("builds closed, finite outlines", () => {
    for (const d of [perforatedPath(10, 10, 150, 184, 6, 16), waxBlobPath(50, 50, 40, seeded("x"))]) {
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });
  it("is stable per seed", () => {
    expect(waxBlobPath(0, 0, 10, seeded("a"))).toBe(waxBlobPath(0, 0, 10, seeded("a")));
    expect(waxBlobPath(0, 0, 10, seeded("a"))).not.toBe(waxBlobPath(0, 0, 10, seeded("b")));
  });
});
