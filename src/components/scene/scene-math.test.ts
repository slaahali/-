import { describe, expect, it } from "vitest";
import { DESKTOP, MOBILE, TEXTURE_BUDGET, fieldSize, textureBudgetBytes, textureBytes } from "./constants";
import { toSafeLetter } from "./shared";
import { cubicBezier, easeInOutCubic, easeInOutSine, flightControls, flightStart } from "./flight";
import { hashString, mulberry32 } from "./random";
import { wrapIntoBoxes } from "./textLayout";

describe("texture budget", () => {
  it("fits desktop in ~32MB and mobile in ~12MB", () => {
    expect(textureBudgetBytes(DESKTOP)).toBeLessThanOrEqual(TEXTURE_BUDGET.desktop);
    expect(textureBudgetBytes(MOBILE)).toBeLessThanOrEqual(TEXTURE_BUDGET.mobile);
  });

  it("keeps the letter aspect (1.0 × 0.8) in texture sizes", () => {
    for (const p of [DESKTOP, MOBILE]) {
      expect(p.tex.h / p.tex.w).toBeCloseTo(0.8, 1);
      expect(p.fillerTex.h / p.fillerTex.w).toBeCloseTo(0.8, 1);
      expect(p.minField).toBeLessThanOrEqual(p.maxReal);
    }
    expect(textureBytes(256, 256, false)).toBe(262144);
  });
});

describe("hero field size", () => {
  it("pads with fillers only below minField and never exceeds maxReal", () => {
    for (const p of [DESKTOP, MOBILE]) {
      expect(fieldSize(0, p)).toBe(p.minField);
      expect(fieldSize(p.minField - 5, p)).toBe(p.minField);
      expect(fieldSize(p.minField + 3, p)).toBe(p.minField + 3); // all real, no fillers
      expect(fieldSize(500, p)).toBe(p.maxReal);
    }
    expect(DESKTOP.maxReal).toBe(40); // the whole newest-40 page flies on desktop
  });
});

describe("flight", () => {
  const start = flightStart({ x: 0, y: 0, z: 6 }, 45, 3.4, false);
  const end = { x: 3, y: 1.5, z: -8 };

  it("starts near the camera, below centre", () => {
    expect(start.z).toBeCloseTo(2.6);
    expect(start.y).toBeLessThan(0);
  });

  it("hits both endpoints", () => {
    for (const gentle of [false, true]) {
      const [c1, c2] = flightControls(start, end, gentle);
      const out = { x: 0, y: 0, z: 0 };
      expect(cubicBezier(start, c1, c2, end, 0, out)).toEqual(start);
      const e = cubicBezier(start, c1, c2, end, 1, out);
      expect(e.x).toBeCloseTo(end.x);
      expect(e.y).toBeCloseTo(end.y);
      expect(e.z).toBeCloseTo(end.z);
    }
  });

  it("eases from 0 to 1 monotonically", () => {
    for (const ease of [easeInOutCubic, easeInOutSine]) {
      let prev = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const v = ease(Math.min(1, t));
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });
});

describe("wrapIntoBoxes", () => {
  const measure = (s: string) => s.length * 10;

  it("fills lines greedily", () => {
    const r = wrapIntoBoxes("شكراً لك يا معلمي", [{ y: 1, width: 110 }, { y: 2, width: 110 }], measure);
    expect(r.truncated).toBe(false);
    expect(r.lines.map((l) => l.text)).toEqual(["شكراً لك يا", "معلمي"]);
    expect(r.lines.map((l) => l.y)).toEqual([1, 2]);
  });

  it("ends with an ellipsis when the text does not fit", () => {
    const r = wrapIntoBoxes("كلمة كلمة كلمة كلمة كلمة كلمة", [{ y: 1, width: 90 }], measure);
    expect(r.truncated).toBe(true);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].text.endsWith("…")).toBe(true);
    expect(measure(r.lines[0].text)).toBeLessThanOrEqual(90);
  });

  it("cuts a single word longer than the line", () => {
    const r = wrapIntoBoxes("ابجدهوزحطيكلمنسعفصقرشت", [{ y: 1, width: 80 }], measure);
    expect(measure(r.lines[0].text)).toBeLessThanOrEqual(80);
    expect(r.lines[0].text.endsWith("…")).toBe(true);
  });

  it("returns nothing for empty text", () => {
    expect(wrapIntoBoxes("   ", [{ y: 1, width: 80 }], measure).lines).toEqual([]);
  });
});

describe("toSafeLetter", () => {
  it("keeps only the public scene fields", () => {
    const l = toSafeLetter({
      id: "abc123",
      label: "إلى: أستاذة نورة",
      snippet: "شكراً",
      variant: 2,
      inMemory: false,
      contact: "0500000000",
    });
    expect(l).toEqual({ id: "abc123", label: "إلى: أستاذة نورة", snippet: "شكراً", variant: 2, inMemory: false });
    expect(l && "contact" in l).toBe(false);
  });

  it("rejects junk and normalises odd values", () => {
    expect(toSafeLetter(null)).toBeNull();
    expect(toSafeLetter({ id: "" })).toBeNull();
    expect(toSafeLetter({ id: "x", variant: Number.NaN })).toEqual({
      id: "x",
      label: "",
      snippet: "",
      variant: 0,
      inMemory: false,
    });
  });
});

describe("random", () => {
  it("is deterministic per seed and in [0, 1)", () => {
    const a = mulberry32(hashString("letter-1"));
    const b = mulberry32(hashString("letter-1"));
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
