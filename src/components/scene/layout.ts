// Where letters float. Pure math (no three.js) so it can be unit-tested.
//
// Slots are generated in *normalised screen space* (u, v ≈ NDC, a bit wider
// than the viewport) plus a depth fraction, then resolved to world positions
// for the current camera. That keeps the field evenly filled on any aspect
// ratio (wide desktop or tall phone) and lets the calm zone behind the hero
// headline be expressed in screen terms.

import type { Rng } from "./random";

/** Ellipse in NDC (−1…1) that should stay quiet so the headline reads well. */
export interface CalmZone {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface RawSlot {
  /** Horizontal NDC-ish position (|u| may exceed 1: slightly off-screen). */
  u: number;
  v: number;
  /** 0 = nearest plane, 1 = farthest. */
  depth: number;
  /** Per-slot random 0..1 used for tie-breaking and margins. */
  jitter: number;
  /** Fallback push direction when a slot sits exactly on the calm-zone centre. */
  angle: number;
}

export interface ViewParams {
  aspect: number;
  fovDeg: number;
  camZ: number;
  zNear: number;
  zFar: number;
  calm: CalmZone;
  /** Letter's rough screen footprint radius in world units (for calm-zone margins). */
  letterRadius: number;
}

export interface ResolvedSlot {
  x: number;
  y: number;
  z: number;
  /** Still inside the calm zone (far + dimmed) after resolving. */
  calmDim: boolean;
}

/** Weight of depth vs screen distance when spreading slots apart. */
const DEPTH_WEIGHT = 0.8;
/** Slots at least this deep that land in the calm zone sink further back instead of moving aside. */
export const CALM_SINK_FROM = 0.6;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Half the visible height (world units) at `dist` in front of a camera with vertical fov `fovDeg`. */
export function halfHeightAt(dist: number, fovDeg: number): number {
  return dist * Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

/**
 * Portrait screens get a wider vertical fov so the horizontal view does not
 * collapse (letters would otherwise look huge on phones).
 */
export function fovForAspect(aspect: number, landscapeFov = 45, portraitFov = 60): number {
  if (!(aspect > 0) || aspect >= 1) return landscapeFov;
  return lerp(landscapeFov, portraitFov, clamp((1 - aspect) / 0.55, 0, 1));
}

/**
 * Best-candidate (Mitchell) sampling: each new slot is the candidate farthest
 * from all previous ones, so any prefix of the list is also well spread.
 */
export function generateSlots(count: number, rng: Rng, spread: number, candidates = 16): RawSlot[] {
  const out: RawSlot[] = [];
  const draw = (): RawSlot => ({
    u: (rng() * 2 - 1) * spread,
    v: (rng() * 2 - 1) * spread,
    depth: rng(),
    jitter: rng(),
    angle: rng() * Math.PI * 2,
  });
  for (let i = 0; i < count; i++) {
    let best = draw();
    if (out.length > 0) {
      let bestScore = minDistSq(best, out);
      for (let c = 1; c < candidates; c++) {
        const cand = draw();
        const score = minDistSq(cand, out);
        if (score > bestScore) {
          best = cand;
          bestScore = score;
        }
      }
    }
    out.push(best);
  }
  return out;
}

function minDistSq(s: RawSlot, others: RawSlot[]): number {
  let m = Infinity;
  for (const o of others) {
    const du = o.u - s.u;
    const dv = o.v - s.v;
    const dd = (o.depth - s.depth) * DEPTH_WEIGHT;
    const d = du * du + dv * dv + dd * dd;
    if (d < m) m = d;
  }
  return m;
}

/** Normalised calm-zone distance (<1 = inside) for a slot at a given depth. */
export function calmDistance(u: number, v: number, dist: number, view: ViewParams): number {
  const hh = halfHeightAt(dist, view.fovDeg);
  const hw = hh * view.aspect;
  const rx = view.calm.rx + view.letterRadius / hw;
  const ry = view.calm.ry + view.letterRadius / hh;
  const du = (u - view.calm.cx) / rx;
  const dv = (v - view.calm.cy) / ry;
  return du * du + dv * dv;
}

/**
 * Turns a raw slot into a world position for the current view. Near slots that
 * would cover the headline are pushed out of the calm ellipse (whichever of a
 * radial or vertical move is shorter in world units); far ones sink to the
 * back and are dimmed.
 */
export function resolveSlot(raw: RawSlot, view: ViewParams): ResolvedSlot {
  let depth = raw.depth;
  let u = raw.u;
  let v = raw.v;
  let calmDim = false;

  let z = lerp(view.zNear, view.zFar, depth);
  let dist = view.camZ - z;
  const e = calmDistance(u, v, dist, view);

  if (e < 1) {
    if (depth >= CALM_SINK_FROM) {
      depth = Math.max(depth, 0.9 + 0.1 * raw.jitter);
      z = lerp(view.zNear, view.zFar, depth);
      dist = view.camZ - z;
      calmDim = true;
    } else {
      const hh = halfHeightAt(dist, view.fovDeg);
      const hw = hh * view.aspect;
      const rx = view.calm.rx + view.letterRadius / hw;
      const ry = view.calm.ry + view.letterRadius / hh;
      const margin = 1.05 + 0.2 * raw.jitter;
      const du = u - view.calm.cx;
      const dv = v - view.calm.cy;

      // Radial: straight out through the ellipse boundary.
      let ru: number;
      let rv: number;
      const len = Math.sqrt(e);
      if (len < 1e-4) {
        ru = Math.cos(raw.angle) * rx;
        rv = Math.sin(raw.angle) * ry;
      } else {
        ru = du / len;
        rv = dv / len;
      }
      const radU = view.calm.cx + ru * margin;
      const radV = view.calm.cy + rv * margin;

      // Vertical: keep u, move above/below the ellipse.
      const s = Math.max(0, 1 - (du / rx) * (du / rx));
      const sign = dv !== 0 ? Math.sign(dv) : raw.angle < Math.PI ? 1 : -1;
      const verV = view.calm.cy + sign * ry * Math.sqrt(s) * margin;

      const radCost = ((radU - u) * hw) ** 2 + ((radV - v) * hh) ** 2;
      const verCost = ((verV - v) * hh) ** 2;
      if (radCost <= verCost) {
        u = radU;
        v = radV;
      } else {
        v = verV;
      }
    }
  }

  const hh = halfHeightAt(dist, view.fovDeg);
  return { x: u * hh * view.aspect, y: v * hh, z, calmDim };
}

/**
 * Order in which real letters take slots: nearer and outside the calm zone
 * first (with a little randomness so they don't all sit in one depth band).
 */
export function slotPreference(raws: RawSlot[], resolved: ResolvedSlot[]): number[] {
  return raws
    .map((r, i) => ({ i, key: r.depth + 0.3 * r.jitter + (resolved[i]?.calmDim ? 1 : 0) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.i);
}
