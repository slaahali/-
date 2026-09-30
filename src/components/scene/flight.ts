// Flight path for a freshly published letter: it appears big near the bottom
// centre, then glides along a cubic Bézier into its slot. Pure math.

import { halfHeightAt } from "./layout";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

export function cubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number, out: Vec3): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  return out;
}

/** Bottom-centre, close to the camera and still on screen. */
export function flightStart(cam: Vec3, fovDeg: number, startDist: number, gentle: boolean): Vec3 {
  const hh = halfHeightAt(startDist, fovDeg);
  return { x: cam.x * 0.5, y: cam.y - hh * (gentle ? 0.7 : 0.6), z: cam.z - startDist };
}

/**
 * Control points. Normal letters rise, swing through the middle and arrive
 * from the front; memory letters just rise slowly and settle.
 */
export function flightControls(start: Vec3, end: Vec3, gentle: boolean): [Vec3, Vec3] {
  if (gentle) {
    return [
      { x: start.x, y: start.y + 0.9, z: start.z - 0.2 },
      { x: end.x, y: end.y - 0.7, z: end.z + 1 },
    ];
  }
  return [
    { x: start.x - end.x * 0.15, y: start.y + 1.7, z: start.z - 0.8 },
    { x: end.x * 0.6, y: end.y + 1.1, z: end.z + 2.6 },
  ];
}
