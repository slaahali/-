import { describe, expect, it } from "vitest";
import { DESKTOP, MOBILE, CAMERA_Z, FOV_LANDSCAPE, FOV_PORTRAIT, LETTER_W } from "./constants";
import {
  calmDistance,
  fovForAspect,
  generateSlots,
  halfHeightAt,
  resolveSlot,
  slotPreference,
  type RawSlot,
  type ViewParams,
} from "./layout";
import { mulberry32 } from "./random";

function viewFor(aspect: number, profile = DESKTOP): ViewParams {
  return {
    aspect,
    fovDeg: fovForAspect(aspect, FOV_LANDSCAPE, FOV_PORTRAIT),
    camZ: CAMERA_Z,
    zNear: profile.zNear,
    zFar: profile.zFar,
    calm: profile.calm,
    letterRadius: LETTER_W * 0.55 * profile.letterScale,
  };
}

/** Screen NDC of a resolved world position for the (unmoved) camera. */
function project(p: { x: number; y: number; z: number }, view: ViewParams) {
  const dist = view.camZ - p.z;
  const hh = halfHeightAt(dist, view.fovDeg);
  return { u: p.x / (hh * view.aspect), v: p.y / hh, dist };
}

describe("generateSlots", () => {
  it("is deterministic and stays inside the spread", () => {
    const a = generateSlots(54, mulberry32(7), 1.15);
    const b = generateSlots(54, mulberry32(7), 1.15);
    expect(a).toEqual(b);
    expect(a).toHaveLength(54);
    for (const s of a) {
      expect(Math.abs(s.u)).toBeLessThanOrEqual(1.15);
      expect(Math.abs(s.v)).toBeLessThanOrEqual(1.15);
      expect(s.depth).toBeGreaterThanOrEqual(0);
      expect(s.depth).toBeLessThan(1);
    }
  });

  it("spreads slots better than plain random sampling", () => {
    const minPair = (slots: RawSlot[]) => {
      let m = Infinity;
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++) {
          const d = Math.hypot(slots[i].u - slots[j].u, slots[i].v - slots[j].v, slots[i].depth - slots[j].depth);
          m = Math.min(m, d);
        }
      return m;
    };
    const spread = generateSlots(40, mulberry32(3), 1.15);
    const plain = generateSlots(40, mulberry32(3), 1.15, 1);
    expect(minPair(spread)).toBeGreaterThan(minPair(plain));
  });
});

describe("resolveSlot", () => {
  for (const [name, aspect, profile] of [
    ["desktop", 16 / 9, DESKTOP],
    ["phone", 390 / 780, MOBILE],
  ] as const) {
    it(`keeps near letters out of the calm zone (${name})`, () => {
      const view = viewFor(aspect, profile);
      const slots = generateSlots(profile.maxReal, mulberry32(11), profile.spread);
      for (const raw of slots) {
        const r = resolveSlot(raw, view);
        const { u, v, dist } = project(r, view);
        expect(r.z).toBeLessThanOrEqual(profile.zNear + 1e-9);
        expect(r.z).toBeGreaterThanOrEqual(profile.zFar - 1e-9);
        if (!r.calmDim) expect(calmDistance(u, v, dist, view)).toBeGreaterThanOrEqual(0.999);
        else expect(raw.depth).toBeGreaterThanOrEqual(0.6);
      }
    });
  }

  it("pushes a slot sitting exactly on the centre", () => {
    const view = viewFor(16 / 9);
    const raw: RawSlot = { u: 0, v: 0, depth: 0.1, jitter: 0.5, angle: 1 };
    const r = resolveSlot(raw, view);
    const { u, v, dist } = project(r, view);
    expect(r.calmDim).toBe(false);
    expect(calmDistance(u, v, dist, view)).toBeGreaterThan(1);
  });

  it("sinks far calm-zone slots to the back instead", () => {
    const view = viewFor(16 / 9);
    const raw: RawSlot = { u: 0.05, v: 0.05, depth: 0.7, jitter: 0.2, angle: 1 };
    const r = resolveSlot(raw, view);
    expect(r.calmDim).toBe(true);
    expect(r.z).toBeLessThan(-14);
  });
});

describe("fovForAspect", () => {
  it("widens the vertical fov on portrait screens only", () => {
    expect(fovForAspect(16 / 9)).toBe(45);
    expect(fovForAspect(1)).toBe(45);
    expect(fovForAspect(0.46)).toBeGreaterThan(55);
    expect(fovForAspect(0.46)).toBeLessThanOrEqual(60);
  });
});

describe("slotPreference", () => {
  it("returns every slot once, preferring near slots outside the calm zone", () => {
    const view = viewFor(16 / 9);
    const raws = generateSlots(54, mulberry32(5), 1.15);
    const resolved = raws.map((r) => resolveSlot(r, view));
    const order = slotPreference(raws, resolved);
    expect([...order].sort((a, b) => a - b)).toEqual(raws.map((_, i) => i));
    const firstTen = order.slice(0, 10).map((i) => raws[i].depth);
    const lastTen = order.slice(-10).map((i) => raws[i].depth);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(firstTen)).toBeLessThan(avg(lastTen));
    expect(order.slice(0, 10).some((i) => resolved[i].calmDim)).toBe(false);
  });
});
