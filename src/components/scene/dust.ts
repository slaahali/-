// Sparse warm dust drifting slowly upward through the field.

import { BufferGeometry, Color, Float32BufferAttribute, NormalBlending, Points, PointsMaterial } from "three";
import { DUST, DUST_TEX } from "./constants";
import { mulberry32, range } from "./random";
import { createDotTexture } from "./textures";

const COLORS: ReadonlyArray<readonly [string, number]> = [
  ["#f7a64f", 0.55], // gold
  ["#eb652c", 0.2], // orange
  ["#a73784", 0.25], // magenta-plum
];

export interface Dust {
  points: Points<BufferGeometry, PointsMaterial>;
  /** Half extents of the box particles wrap around in. */
  setBounds(halfW: number, halfH: number): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

const wrap = (x: number, half: number) => {
  const span = 2 * half;
  return ((((x + half) % span) + span) % span) - half;
};

export function createDust(count: number, halfW: number, halfH: number, seed: number): Dust {
  const rng = mulberry32(seed);
  const base = new Float32Array(count * 3); // x, y, z before sway
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new Color();
  let bw = halfW;
  let bh = halfH;

  for (let i = 0; i < count; i++) {
    base[i * 3] = range(rng, -bw, bw);
    base[i * 3 + 1] = range(rng, -bh, bh);
    base[i * 3 + 2] = range(rng, DUST.zMin, DUST.zMax);
    speed[i] = range(rng, DUST.speed[0], DUST.speed[1]);
    phase[i] = rng() * Math.PI * 2;
    let pick = rng();
    let hex = COLORS[0][0];
    for (const [h, w] of COLORS) {
      if (pick < w) {
        hex = h;
        break;
      }
      pick -= w;
    }
    c.set(hex);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  positions.set(base);

  const geometry = new BufferGeometry();
  const posAttr = new Float32BufferAttribute(positions, 3);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  const map = createDotTexture(DUST_TEX);
  const material = new PointsMaterial({
    size: DUST.size,
    map,
    vertexColors: true,
    transparent: true,
    opacity: DUST.opacity,
    depthWrite: false,
    sizeAttenuation: true,
    // Additive would vanish on the light background.
    blending: NormalBlending,
  });

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  return {
    points,
    setBounds(w, h) {
      bw = w;
      bh = h;
    },
    update(dt, time) {
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const k = i * 3;
        // Modulo wrap also redistributes particles when the bounds change.
        const y = wrap(base[k + 1] + speed[i] * dt, bh);
        base[k + 1] = y;
        base[k] = wrap(base[k], bw);
        arr[k] = base[k] + Math.sin(time * 0.3 + phase[i]) * 0.25;
        arr[k + 1] = y;
        arr[k + 2] = base[k + 2] + Math.cos(time * 0.2 + phase[i]) * 0.15;
      }
      posAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}
