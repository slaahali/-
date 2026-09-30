import { describe, expect, it } from "vitest";
import { CARD_COLORS, MEMORY_STYLE } from "@/lib/assets";
import {
  GESTURE_WINDOW_MS,
  SHEET,
  classifySwipe,
  contrast,
  hasLongRun,
  letterPalette,
  mix,
  noteGesture,
  readableOn,
  recentGesture,
} from "./letter-utils";

describe("colour helpers", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#fff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("mixes linearly between the ends", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("darkens only as far as needed", () => {
    // Plum is already readable: unchanged.
    expect(readableOn("#691d4e", SHEET, "#2a1422")).toBe("#691d4e");
    const orange = readableOn("#eb652c", SHEET, "#4f1f0c");
    expect(contrast(orange, SHEET)).toBeGreaterThanOrEqual(4.5);
    expect(orange).not.toBe("#4f1f0c");
  });

  it.each([...CARD_COLORS, MEMORY_STYLE].map((s) => [s.key, s] as const))(
    "%s: signature ≥ 4.5:1 and stamp ≥ 5.5:1 on the sheet",
    (_key, s) => {
      const p = letterPalette(s);
      expect(contrast(p.accentInk, SHEET)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.stampInk, SHEET)).toBeGreaterThanOrEqual(5.5);
      expect(p.envelope).toMatch(/^#[0-9a-f]{6}$/);
    },
  );

  it("falls back for an unknown colour key", () => {
    const p = letterPalette({ ...CARD_COLORS[0], key: "teal", gradient: ["#66cccc", "#118888"] });
    expect(p.envelope).toBe("#118888");
    expect(p.envelopeInside).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("swipes", () => {
  const can = { canClose: true };
  const cannot = { canClose: false };

  it("flicks sideways step between letters (RTL)", () => {
    expect(classifySwipe(120, 10, 300, cannot)).toBe("next");
    expect(classifySwipe(-120, -8, 300, cannot)).toBe("prev");
  });

  it("ignores short, slow or diagonal drags", () => {
    expect(classifySwipe(50, 0, 200, cannot)).toBeNull();
    expect(classifySwipe(120, 0, 1200, cannot)).toBeNull();
    expect(classifySwipe(100, 90, 300, cannot)).toBeNull();
  });

  it("closes on a long pull down from the header only", () => {
    expect(classifySwipe(10, 140, 400, can)).toBe("close");
    expect(classifySwipe(10, 140, 400, cannot)).toBeNull();
    expect(classifySwipe(10, 80, 400, can)).toBeNull();
    expect(classifySwipe(0, -160, 400, can)).toBeNull();
  });
});

describe("gesture clock", () => {
  it("remembers the last press for a short window", () => {
    const t0 = 1_000_000;
    noteGesture(null, t0);
    expect(recentGesture(t0 + 100)).toEqual({ target: null });
    expect(recentGesture(t0 + GESTURE_WINDOW_MS + 1)).toBeNull();
  });
});

describe("handwriting guard", () => {
  it("spots laughter runs and other long letter runs", () => {
    expect(hasLongRun("هههههههه")).toBe(true);
    expect(hasLongRun("خالد ههههه")).toBe(true);
    expect(hasLongRun("مممممم")).toBe(true);
    expect(hasLongRun("ههه")).toBe(false);
    expect(hasLongRun("سارة")).toBe(false);
    expect(hasLongRun("Sarah")).toBe(false);
  });
});
