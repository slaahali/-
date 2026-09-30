import { describe, expect, it } from "vitest";
import { TEXTURE_BUDGET, TUNNEL, TUNNEL_DESKTOP, TUNNEL_MOBILE, tunnelBudgetBytes } from "./constants";
import { LetterList, SPARSE_BELOW } from "./letter-list";
import {
  focusSlot,
  placeSlot,
  slotAhead,
  stepTarget,
  travelFor,
  tunnelFade,
  visibleDepth,
  wheelPixels,
  windowStart,
  type TunnelGeom,
} from "./tunnel-math";
import type { PublicMessage } from "@/lib/types";

const geomFor = (pool: number): TunnelGeom => ({ spacing: TUNNEL.spacing, readDist: TUNNEL.readDist, behind: TUNNEL.behind, pool });

function msg(i: number, extra: Partial<PublicMessage> = {}): PublicMessage {
  return {
    id: `m${i}`,
    title: "ustadha",
    toName: `نورة ${i}`,
    school: null,
    body: `شكراً لك ${i}`,
    fromName: null,
    likes: 0,
    createdAt: new Date(2025, 9, 5, 0, i).toISOString(),
    variant: i % 6,
    inMemory: false,
    ...extra,
  };
}

describe("tunnel budget", () => {
  it("fits one tunnel in the per-engine texture budget", () => {
    expect(tunnelBudgetBytes(TUNNEL_DESKTOP)).toBeLessThanOrEqual(TEXTURE_BUDGET.desktop);
    expect(tunnelBudgetBytes(TUNNEL_MOBILE)).toBeLessThanOrEqual(TEXTURE_BUDGET.mobile);
    for (const p of [TUNNEL_DESKTOP, TUNNEL_MOBILE]) expect(p.tex.h / p.tex.w).toBeCloseTo(0.8, 1);
  });
});

describe("tunnel window", () => {
  for (const [name, p] of [["desktop", TUNNEL_DESKTOP], ["mobile", TUNNEL_MOBILE]] as const) {
    it(`covers everything visible and recycles only what is behind (${name})`, () => {
      const g = geomFor(p.pool);
      const depth = visibleDepth(g);
      expect(depth).toBeGreaterThan(8);
      for (let travel = -2; travel < 400; travel += 0.37) {
        const k0 = windowStart(travel, g);
        const k1 = k0 + g.pool - 1;
        // Slots before the window are well behind the camera …
        if (k0 > 0) expect(slotAhead(k0 - 1, travel, g)).toBeLessThan(-g.behind + 1e-9);
        // … and every slot that can be seen is inside it.
        expect(slotAhead(k0, travel, g)).toBeGreaterThanOrEqual(-g.behind - g.spacing);
        expect(slotAhead(k1, travel, g)).toBeGreaterThanOrEqual(depth);
        const f = focusSlot(travel, g);
        expect(f).toBeGreaterThanOrEqual(k0);
        expect(f).toBeLessThanOrEqual(k1);
      }
    });
  }

  it("puts the focused slot at reading distance", () => {
    const g = geomFor(24);
    for (const k of [0, 1, 7, 120]) {
      const travel = travelFor(k, g);
      expect(focusSlot(travel, g)).toBe(k);
      expect(slotAhead(k, travel, g)).toBeCloseTo(TUNNEL.readDist);
    }
    expect(focusSlot(-3, g)).toBe(0);
  });
});

describe("tunnelFade", () => {
  it("fades in from the fog and out as a letter brushes past", () => {
    const depth = 18;
    expect(tunnelFade(0.2, depth, TUNNEL.near, TUNNEL.farFadeFrom)).toBe(0);
    expect(tunnelFade(-1, depth, TUNNEL.near, TUNNEL.farFadeFrom)).toBe(0);
    expect(tunnelFade(TUNNEL.readDist, depth, TUNNEL.near, TUNNEL.farFadeFrom)).toBeCloseTo(1);
    expect(tunnelFade(depth, depth, TUNNEL.near, TUNNEL.farFadeFrom)).toBe(0);
    expect(tunnelFade(depth + 3, depth, TUNNEL.near, TUNNEL.farFadeFrom)).toBe(0);
    const mid = tunnelFade(depth * 0.8, depth, TUNNEL.near, TUNNEL.farFadeFrom);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("placeSlot", () => {
  it("is deterministic, stays on the ring and spreads neighbours around it", () => {
    const ring = TUNNEL_MOBILE.ring;
    expect(placeSlot(42, ring, TUNNEL.tilt, TUNNEL.spacing)).toEqual(placeSlot(42, ring, TUNNEL.tilt, TUNNEL.spacing));
    for (let k = 0; k < 200; k++) {
      const a = placeSlot(k, ring, TUNNEL.tilt, TUNNEL.spacing);
      const r = Math.hypot(a.u, a.v);
      expect(r).toBeGreaterThanOrEqual(ring[0] - 1e-9);
      expect(r).toBeLessThanOrEqual(ring[1] + 1e-9);
      expect(Math.abs(a.dz)).toBeLessThanOrEqual(TUNNEL.spacing * 0.3 + 1e-9);
      const b = placeSlot(k + 1, ring, TUNNEL.tilt, TUNNEL.spacing);
      // Consecutive letters never sit on top of each other on screen.
      expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeGreaterThan(0.15);
    }
  });
});

describe("input helpers", () => {
  it("normalises wheel deltas", () => {
    expect(wheelPixels(100, 0, 800)).toBe(100);
    expect(wheelPixels(3, 1, 800)).toBe(99);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });

  it("steps to the next real letter and stops at the start", () => {
    const everyThird = (k: number) => k % 3 === 0;
    expect(stepTarget(0, 1, everyThird)).toBe(3);
    expect(stepTarget(3, -1, everyThird)).toBe(0);
    expect(stepTarget(0, -1, everyThird)).toBe(0);
    expect(stepTarget(5, 1, () => true)).toBe(6);
    expect(stepTarget(5, 1, () => false)).toBe(6); // nothing real nearby: plain step
  });
});

describe("LetterList", () => {
  it("dedupes, keeps order and wraps around at the end", () => {
    const list = new LetterList();
    expect(list.add([msg(1), msg(2), msg(1)])).toBe(2);
    expect(list.add([msg(2), msg(3)])).toBe(1);
    const many = Array.from({ length: 30 }, (_, i) => msg(10 + i));
    list.add(many);
    expect(list.length).toBe(33);
    expect(list.stride()).toBe(1);
    const at = (k: number) => {
      const c = list.at(k);
      return c && typeof c === "object" ? c.id : c;
    };
    expect(at(0)).toBe("m1");
    expect(at(2)).toBe("m3");
    expect(at(33)).toBe("m1"); // wrapped
    expect(list.nearestIndex(34)).toBe(1);
  });

  it("only carries public scene fields", () => {
    const list = new LetterList();
    list.add([{ ...msg(1), contact: "0500000000" } as PublicMessage]);
    const c = list.at(0);
    expect(c && typeof c === "object" && Object.keys(c).sort()).toEqual(["id", "inMemory", "label", "snippet", "variant"]);
  });

  it("leaves taken-down letters out", () => {
    const list = new LetterList();
    list.add(Array.from({ length: 20 }, (_, i) => msg(i)));
    expect(list.hide("m4")).toBe(true);
    expect(list.at(4)).toBeNull();
    expect(list.visibleCount).toBe(19);
    expect(list.hiddenCount).toBe(1);
    expect(list.add([msg(99), msg(4)])).toBe(1); // a hidden id never comes back
    expect(list.hide("nope")).toBe(false);
  });

  it("mixes blank paper into a short list", () => {
    const empty = new LetterList();
    expect(empty.at(0)).toBe("filler");
    expect(empty.nearestIndex(3)).toBe(-1);

    const short = new LetterList();
    short.add([msg(1), msg(2), msg(3)]);
    expect(short.stride()).toBe(3);
    expect(short.at(1)).toBe("filler");
    expect(short.at(2)).toBe("filler");
    expect(short.indexAt(3)).toBe(1);
    expect(short.nearestIndex(4)).toBe(1);

    const mid = new LetterList();
    mid.add(Array.from({ length: 10 }, (_, i) => msg(i)));
    expect(mid.stride()).toBe(2);
    const full = new LetterList();
    full.add(Array.from({ length: SPARSE_BELOW }, (_, i) => msg(i)));
    expect(full.stride()).toBe(1);
  });
});
