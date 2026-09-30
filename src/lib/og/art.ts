// Stationery drawings shared by the OG images (SVG strings for resvg) and the
// story card (Path2D on a <canvas>): the flat icon art, heart + dove motifs,
// wax-seal outline, perforated postage-stamp edge, envelope colours and the
// Molhim font-coverage rule. Pure data + string builders — no DOM, no Node.

import type { CardStyle, IconName } from "@/lib/assets";

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

export const FAMILY = {
  molhim: "Molhim",
  plex: "IBM Plex Sans Arabic",
  ruqaa: "Aref Ruqaa",
} as const;

// Everything Molhim has a glyph for (checked against the TTF cmap): Arabic
// letters + tashkeel, Arabic-Indic and ASCII digits, common ASCII punctuation,
// ×÷ and NBSP. No Latin letters, no «» — … · $ & ; @.
const MOLHIM_ONLY =
  /^[ -#%'-:<-?[-_{-~ ×÷،؛؟ء-غـ-ٓ٠-٫٭‫‬ﱞ-ﱢ﴾﴿ﺀ-ﻼ]*$/;

/**
 * Swaps the typographic marks Molhim lacks for ones it has, so an Arabic line
 * with «quotes» or an ellipsis can stay in the brand font.
 */
export function toMolhimPunctuation(s: string): string {
  return s.replace(/[«»“”]/g, '"').replace(/[—–]/g, "-").replace(/…/g, "...").replace(/[‘’]/g, "'");
}

/** Molhim when every character of `s` is in it; otherwise Plex for the whole run. */
export function canUseMolhim(s: string): boolean {
  return MOLHIM_ONLY.test(s);
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export const INK = {
  plum: "#691d4e",
  plumDeep: "#3d0f2d",
  plum950: "#2b0a20",
  orange: "#eb652c",
  gold: "#f7a64f",
  paper: "#fffdf8",
  cream: "#f8f3ec",
  cream2: "#f4ece0",
  inkSoft: "#6b5462",
  inkMute: "#9a8691",
  line: "#ecdfd5",
  lineStrong: "#dccbbd",
} as const;

type RGB = [number, number, number];

export function hexRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toHex = (c: RGB) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

/** Linear mix of two hex colours (t = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
}

function luminance(hex: string): number {
  const c = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/** White on dark colours, deep plum on light ones (≥ 3:1 for large text). */
export function inkOnColor(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? "#ffffff" : INK.plum950;
}

export interface EnvelopeColors {
  /** The envelope paper (the writer's colour). */
  base: string;
  /** Side flaps (a touch lighter) and the bottom flap (a touch darker). */
  light: string;
  dark: string;
  /** Inside of the envelope / seam shadows. */
  deep: string;
  /** Wax: the accent, deepened a little so it reads on the envelope. */
  wax: string;
  waxLight: string;
  waxDark: string;
  /** Text drawn straight on the envelope. */
  ink: string;
}

/** Envelope + wax colours for a card style (memory letters get the calm lavender). */
export function envelopeColors(style: Pick<CardStyle, "accent" | "gradient" | "key">): EnvelopeColors {
  // Light styles (cream/kraft, gold, peach) use the deeper gradient stop so the
  // envelope still reads as coloured paper against the cream sheet.
  const base = style.key === "cream" ? "#d8bf9f" : mixHex(style.gradient[0], style.gradient[1], 0.72);
  const wax = style.key === "cream" ? "#8a2f2a" : style.key === "gold" || style.key === "peach" ? INK.plum : mixHex(style.accent, "#000000", 0.08);
  return {
    base,
    light: mixHex(base, "#ffffff", 0.1),
    dark: mixHex(base, "#000000", 0.1),
    deep: mixHex(base, "#000000", 0.32),
    wax,
    waxLight: mixHex(wax, "#ffffff", 0.3),
    waxDark: mixHex(wax, "#000000", 0.35),
    ink: inkOnColor(base),
  };
}

// ---------------------------------------------------------------------------
// Seeded randomness (stable per letter id)
// ---------------------------------------------------------------------------

export function seeded(seedText: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Path builders (plain "d" strings: valid for SVG and for canvas Path2D)
// ---------------------------------------------------------------------------

const r1 = (v: number) => Math.round(v * 10) / 10;

export function rectPath(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
  const k = Math.min(r, w / 2, h / 2);
  return (
    `M${r1(x + k)} ${r1(y)}h${r1(w - 2 * k)}a${r1(k)} ${r1(k)} 0 0 1 ${r1(k)} ${r1(k)}` +
    `v${r1(h - 2 * k)}a${r1(k)} ${r1(k)} 0 0 1 ${r1(-k)} ${r1(k)}h${r1(-(w - 2 * k))}` +
    `a${r1(k)} ${r1(k)} 0 0 1 ${r1(-k)} ${r1(-k)}v${r1(-(h - 2 * k))}a${r1(k)} ${r1(k)} 0 0 1 ${r1(k)} ${r1(-k)}Z`
  );
}

export function circlePath(cx: number, cy: number, r: number): string {
  return `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`;
}

/**
 * Postage-stamp outline: a rectangle whose edges are bitten by half-circle
 * perforations. `hole` = perforation radius, `pitch` ≈ distance between holes.
 */
export function perforatedPath(x: number, y: number, w: number, h: number, hole: number, pitch: number): string {
  const edge = (len: number) => {
    const n = Math.max(2, Math.round(len / pitch));
    return { n, step: len / n };
  };
  const top = edge(w);
  const side = edge(h);
  let d = `M${r1(x)} ${r1(y)}`;
  // Holes sit centred on the edge between corners: corner, hole, hole… corner.
  const run = (sx: number, sy: number, dx: number, dy: number, n: number, step: number) => {
    for (let i = 0; i < n; i++) {
      const c = step * (i + 0.5);
      const ax = sx + dx * (c - hole);
      const ay = sy + dy * (c - hole);
      const bx = sx + dx * (c + hole);
      const by = sy + dy * (c + hole);
      d += `L${r1(ax)} ${r1(ay)}A${r1(hole)} ${r1(hole)} 0 0 0 ${r1(bx)} ${r1(by)}`;
    }
  };
  run(x, y, 1, 0, top.n, top.step);
  d += `L${r1(x + w)} ${r1(y)}`;
  run(x + w, y, 0, 1, side.n, side.step);
  d += `L${r1(x + w)} ${r1(y + h)}`;
  run(x + w, y + h, -1, 0, top.n, top.step);
  d += `L${r1(x)} ${r1(y + h)}`;
  run(x, y + h, 0, -1, side.n, side.step);
  return d + "Z";
}

/** Irregular wax blob around (cx, cy): a wobbly circle with a couple of soft drips. */
export function waxBlobPath(cx: number, cy: number, r: number, rand: () => number): string {
  const n = 22;
  const drips = [Math.floor(rand() * n), Math.floor(rand() * n)];
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let k = 1 + (rand() - 0.5) * 0.07;
    if (drips.includes(i)) k += 0.07 + rand() * 0.05;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  // Closed Catmull-Rom → cubic Béziers for a smooth, organic edge.
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + "Z";
}

/** Wavy cancellation lines of a postmark, running from x0 towards x0 + len. */
export function cancelWaves(x0: number, y0: number, len: number, lines: number, gap: number, amp: number): string {
  let d = "";
  const seg = 18;
  for (let l = 0; l < lines; l++) {
    const y = y0 + l * gap;
    d += `M${r1(x0)} ${r1(y)}`;
    const dir = Math.sign(len) || 1;
    for (let i = 0; i * seg < Math.abs(len); i++) {
      const xa = x0 + dir * (i * seg + seg / 2);
      const xb = x0 + dir * (i + 1) * seg;
      d += `Q${r1(xa)} ${r1(y + (i % 2 ? amp : -amp))} ${r1(xb)} ${r1(y)}`;
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------------

/** Heart on a 24×24 grid. */
export const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

/** A small dove in flight on a 24×24 grid (memory letters' seal). */
export const DOVE_PATH =
  "M3 14.5c2.6.2 4.6-.5 6-2.1L7.2 5.6c2.7 1 4.6 2.9 5.4 5.6l2.3-7c1.6 2.4 2.1 5.2 1.4 8.3.8-.8 1.9-1.2 3.1-1.1l2.3.9-1.9.5c-.4 2.9-2.4 5-5.6 5.8-2.3.6-4.8.3-7.1-.6l-2.7 2.3.9-3.2C4 16.5 3.3 15.6 3 14.5z";

type ArtShape = {
  d: string;
  fill?: string;
  /** Stroke colour; width in grid units (64 grid). */
  stroke?: string;
  sw?: number;
};

const P = INK.plum;
const O = INK.orange;
const C = "#fffaf3";
const G = "#f7c87a";
const S = { stroke: P, sw: 3 };

/**
 * Flat duotone drawings of the 3D icons on a 64×64 grid — the same subjects
 * as components/ui/icon-art.tsx, as plain paths so canvas + resvg can draw them.
 */
export const ICON_ART: Record<IconName, ArtShape[]> = {
  letter: [
    { d: "M8 18h48L32 50Z", fill: C, ...S },
    { d: "M8 18l24 16 24-16", ...S },
    { d: circlePath(32, 32, 7.5), fill: O },
    {
      d: "M32 35.6c-2.7-1.8-4.1-3.2-4.1-4.7 0-1.1.9-2 2-2 .8 0 1.6.5 2.1 1.2.5-.7 1.3-1.2 2.1-1.2 1.1 0 2 .9 2 2 0 1.5-1.4 2.9-4.1 4.7Z",
      fill: C,
    },
  ],
  envelope: [
    { d: rectPath(9, 24, 46, 30, 4), fill: P },
    { d: "M9 28l23 15 23-15", stroke: C, sw: 3 },
    { d: "M22 26l5-15 12 4-5 15", fill: C, ...S },
    { d: "M36 21l9-10 8 7-8 9", fill: C, ...S },
    { d: circlePath(46, 12, 3), fill: O },
  ],
  gift: [
    { d: rectPath(11, 26, 42, 28, 4), fill: O, ...S },
    { d: rectPath(8, 19, 48, 10, 3), fill: O, ...S },
    { d: "M32 19v35", ...S },
    { d: "M32 19c-3-7-12-9-13-3-.6 3.4 5 3.6 13 3Zm0 0c3-7 12-9 13-3 .6 3.4-5 3.6-13 3Z", fill: C, ...S },
  ],
  books: [
    { d: rectPath(10, 40, 44, 10, 2.5), fill: P, ...S },
    { d: rectPath(13, 30, 40, 10, 2.5), fill: C, ...S },
    { d: "M46 32v6", stroke: O, sw: 3 },
    { d: "M33 30c-6 0-9-4-9-9s4-8 9-6c5-2 9 1 9 6s-3 9-9 9Z", fill: O, ...S },
    { d: "M33 15c0-3 2-5 5-6", ...S },
  ],
  pencil: [
    { d: "M14 50l4-12 26-26 8 8-26 26Z", fill: P, ...S },
    { d: "M44 12l8 8 3-3a3 3 0 0 0 0-4l-4-4a3 3 0 0 0-4 0Z", fill: O, ...S },
    { d: "M18 38l8 8", ...S },
    { d: "M14 50l4-12 8 8Z", fill: C, ...S },
    { d: "M40 16l8 8", stroke: G, sw: 3 },
  ],
  cap: [
    { d: "M4 26l28-12 28 12-28 12Z", fill: P, ...S },
    { d: "M16 31v10c0 4 7 8 16 8s16-4 16-8V31", fill: C, ...S },
    { d: "M56 28v14", stroke: G, sw: 3 },
    { d: circlePath(56, 45, 3.5), fill: O },
  ],
  plane: [
    { d: "M6 30l52-20-14 44-12-14Z", fill: C, ...S },
    { d: "M32 40l26-30", ...S },
    { d: "M32 40v12l7-7", fill: C, ...S },
    { d: "M12 46c4 0 6 2 8 4", stroke: O, sw: 3 },
  ],
  search: [
    { d: circlePath(27, 27, 15), fill: C, ...S },
    { d: "M38 38l14 14", stroke: P, sw: 6 },
    { d: "M20 24a8 8 0 0 1 7-6", stroke: O, sw: 3 },
  ],
  heart: [
    {
      d: "M32 54C14 42 7 33 7 23c0-7 5-12 12-12 5 0 9 3 13 8 4-5 8-8 13-8 7 0 12 5 12 12 0 10-7 19-25 31Z",
      fill: O,
      ...S,
    },
    { d: "M17 22c0-3 2-5 5-5", stroke: C, sw: 3 },
  ],
};

/** SVG markup for an icon drawing, scaled from the 64 grid to `size` px at (x, y). */
export function iconArtSvg(name: IconName, x: number, y: number, size: number): string {
  const s = size / 64;
  const parts = ICON_ART[name].map(
    (p) =>
      `<path d="${p.d}" fill="${p.fill ?? "none"}"` +
      (p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw ?? 3}" stroke-linecap="round" stroke-linejoin="round"` : "") +
      `/>`,
  );
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${Math.round(s * 1000) / 1000})">${parts.join("")}</g>`;
}
