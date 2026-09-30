// Triangle-folded letter: an isosceles triangle (apex up) made of three flaps
// that meet at a point slightly raised toward the viewer, so each facet catches
// the light a little differently (~12–14° between neighbouring facets).
//
// Two draw groups: 0 = front (textured), 1 = back (plain, reversed winding).
// Both materials stay FrontSide, so the back never shows mirrored writing and
// the two layers never z-fight.

import { BufferGeometry, Float32BufferAttribute } from "three";
import { FOLD_CENTER_Y, FOLD_RISE, LETTER_H, LETTER_W } from "./constants";

type P3 = readonly [number, number, number];

/** Letter-local corners: apex, base-left, base-right and the fold centre. */
export const LETTER_POINTS = {
  apex: [0, LETTER_H / 2, 0] as P3,
  left: [-LETTER_W / 2, -LETTER_H / 2, 0] as P3,
  right: [LETTER_W / 2, -LETTER_H / 2, 0] as P3,
  center: [0, FOLD_CENTER_Y, FOLD_RISE] as P3,
};

/** Planar UVs over the triangle's bounding box (canvas top = apex). */
export function uvFor(p: P3): [number, number] {
  return [p[0] / LETTER_W + 0.5, p[1] / LETTER_H + 0.5];
}

export function createLetterGeometry(): BufferGeometry {
  const { apex: A, left: B, right: C, center: P } = LETTER_POINTS;
  // Counter-clockwise seen from +z.
  const front: P3[][] = [
    [P, A, B],
    [P, B, C],
    [P, C, A],
  ];
  const back = front.map(([a, b, c]) => [a, c, b]);

  const positions: number[] = [];
  const uvs: number[] = [];
  for (const tri of [...front, ...back]) {
    for (const p of tri) {
      positions.push(p[0], p[1], p[2]);
      uvs.push(...uvFor(p));
    }
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  // Non-indexed → flat per-facet normals.
  g.computeVertexNormals();
  g.addGroup(0, 9, 0);
  g.addGroup(9, 9, 1);
  g.computeBoundingSphere();
  return g;
}
