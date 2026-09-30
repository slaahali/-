// Pure maths of the immersive tunnel (no three.js, unit-tested).
//
// The path is the −z axis. `travel` is how far the camera has flown (camera
// z = −travel). Slot k (0, 1, 2, …) sits `readDist + k·spacing` down the path,
// so at travel = k·spacing slot k is exactly `readDist` ahead: the "current"
// letter. A fixed pool of meshes covers the window of slots around the camera;
// slots that fall behind recycle to the far end (and back again when the
// camera reverses).

import { clamp, smoothstep } from "./layout";
import { hashString, mulberry32 } from "./random";

export interface TunnelGeom {
  spacing: number;
  readDist: number;
  behind: number;
  pool: number;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** World distance from the camera to slot k along the path (negative = behind). */
export function slotAhead(k: number, travel: number, g: TunnelGeom): number {
  return g.readDist + k * g.spacing - travel;
}

/** First slot of the live window: slots further than `behind` behind the camera recycle. */
export function windowStart(travel: number, g: TunnelGeom): number {
  return Math.max(0, Math.floor((travel - g.readDist - g.behind) / g.spacing) + 1);
}

/** The slot at reading distance (the letter the counter talks about). */
export function focusSlot(travel: number, g: TunnelGeom): number {
  return Math.max(0, Math.round(travel / g.spacing));
}

/** Travel that puts slot k at reading distance. */
export const travelFor = (k: number, g: TunnelGeom) => Math.max(0, k) * g.spacing;

/** Closest the far end of the window ever gets (letters fade in before it). */
export function visibleDepth(g: TunnelGeom): number {
  return (g.pool - 1) * g.spacing - g.behind - g.spacing;
}

/**
 * Opacity from the distance ahead: fades in from the fog over the far part of
 * the window, and out again as the letter brushes past the camera.
 */
export function tunnelFade(dist: number, depth: number, near: readonly [number, number], farFrom: number): number {
  if (dist <= near[0]) return 0;
  const inNear = smoothstep(near[0], near[1], dist);
  const outFar = 1 - smoothstep(depth * farFrom, depth, dist);
  return clamp(inNear * outFar, 0, 1);
}

export interface SlotPlacement {
  /** Position around the axis as a fraction of the half view at reading distance. */
  u: number;
  v: number;
  /** Small jitter along the path (world units). */
  dz: number;
  tilt: { x: number; y: number; z: number };
  phase: number;
  bob: number;
  bobSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  spin: number;
}

/**
 * Deterministic per slot, so flying back shows the same letters in the same
 * places. Consecutive slots step by the golden angle around the ring (no two
 * neighbours line up); the radius keeps a quiet lane down the middle.
 */
export function placeSlot(
  k: number,
  ring: readonly [number, number],
  tilt: { x: number; y: number; z: number },
  spacing: number,
): SlotPlacement {
  const rng = mulberry32(hashString(`slot:${k}`));
  const angle = k * GOLDEN_ANGLE + (rng() - 0.5) * 0.5;
  const r = ring[0] + (ring[1] - ring[0]) * Math.sqrt(rng());
  const s = () => rng() * 2 - 1;
  return {
    u: Math.cos(angle) * r,
    v: Math.sin(angle) * r,
    dz: s() * spacing * 0.3,
    tilt: { x: s() * tilt.x, y: s() * tilt.y, z: s() * tilt.z },
    phase: rng() * Math.PI * 2,
    bob: 0.03 + rng() * 0.06,
    bobSpeed: 0.4 + rng() * 0.4,
    wobble: 0.05 + rng() * 0.1,
    wobbleSpeed: 0.2 + rng() * 0.25,
    spin: s() * 0.04,
  };
}

/** Normalises a wheel event's delta to pixels. */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === 1) return deltaY * 33; // lines
  if (deltaMode === 2) return deltaY * pageHeight; // pages
  return deltaY;
}

/**
 * Where to stop when stepping one letter from `k` in direction `dir`:
 * the next slot `isReal` accepts (fillers are skipped), at most `maxScan` away.
 */
export function stepTarget(k: number, dir: 1 | -1, isReal: (k: number) => boolean, maxScan = 8): number {
  let next = k;
  for (let i = 0; i < maxScan; i++) {
    next += dir;
    if (next < 0) return Math.max(0, k);
    if (isReal(next)) return next;
  }
  return Math.max(0, k + dir);
}
