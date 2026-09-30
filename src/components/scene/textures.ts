// Paper textures for the folded letters, painted on a 2D canvas.
//
// Canvas layout matches geometry.ts UVs: apex at top-centre, base along the
// bottom edge, the three flaps meeting at FOLD (0.65·H). Everything outside
// the triangle is filled with paper colour so mipmaps don't bleed dark edges.

import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import type { CardStyle } from "@/lib/assets";
import { FOLD_CENTER_Y, LETTER_H } from "./constants";
import { mulberry32, type Rng } from "./random";
import { wrapIntoBoxes, type LineBox } from "./textLayout";

export type PaperKind = "real" | "memory" | "filler";

export interface PaintSpec {
  text: string;
  kind: PaperKind;
  style: CardStyle;
  seed: number;
}

const PAPER_WHITE = "#fffdf9";
const PLUM_INK = "#691d4e";
const FILLER_PAPER = { top: "#fffdf9", bottom: "#f4ece0", edge: "#dccbbd" };
const FOLD_V = 0.5 - FOLD_CENTER_Y / LETTER_H; // canvas y fraction of the fold centre

const WAX = {
  orange: { base: "#eb652c", light: "#f7a06f", dark: "#b8461a", heart: "#fff4ee" },
  memory: { base: "#bcb2c5", light: "#e6e0eb", dark: "#8a7e95", heart: "#ffffff" },
};

const FALLBACK_FAMILY = '"Aref Ruqaa", serif';

// ---------------------------------------------------------------- fonts ---

/**
 * next/font gives Aref Ruqaa a hashed family name exposed as --font-ruqaa.
 * Resolves with a canvas-ready family list once the face is loaded (or after
 * `timeoutMs`, in which case the fallback serif is used for painting).
 */
export async function loadHandFamily(timeoutMs = 1500): Promise<string> {
  let family = FALLBACK_FAMILY;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--font-ruqaa").trim();
    if (v) family = `${v}, ${FALLBACK_FAMILY}`;
  } catch {
    /* keep fallback */
  }
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (fonts && typeof fonts.load === "function") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      fonts.load(`400 40px ${family}`, "شكراً معلمي").catch(() => []),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
  }
  return family;
}

// --------------------------------------------------------------- colour ---

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [255, 253, 249];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Palette {
  top: string;
  bottom: string;
  ink: string;
  inkAlpha: number;
  edge: string;
  edgeAlpha: number;
  wax: (typeof WAX)["orange"];
}

function paletteFor(spec: PaintSpec): Palette {
  if (spec.kind === "filler") {
    return {
      top: FILLER_PAPER.top,
      bottom: FILLER_PAPER.bottom,
      ink: PLUM_INK,
      inkAlpha: 0.5,
      edge: FILLER_PAPER.edge,
      edgeAlpha: 0.7,
      wax: WAX.orange,
    };
  }
  const bg = spec.style.bg;
  const memory = spec.kind === "memory";
  return {
    top: mixHex(bg, PAPER_WHITE, 0.55),
    bottom: bg,
    ink: memory ? spec.style.ink : PLUM_INK,
    inkAlpha: 0.55,
    edge: spec.style.accent,
    edgeAlpha: memory ? 0.35 : 0.55,
    wax: memory ? WAX.memory : WAX.orange,
  };
}

/** Plain colour for the back faces (slightly darker than the front paper). */
export function paperBackColor(spec: Pick<PaintSpec, "kind" | "style">): string {
  return spec.kind === "filler" ? FILLER_PAPER.bottom : spec.style.bg;
}

// ---------------------------------------------------------------- paint ---

type Pt = { x: number; y: number };

export function paintLetterCanvas(spec: PaintSpec, size: { w: number; h: number }, family: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const W = size.w;
  const H = size.h;
  const s = W / 384; // scale factor for strokes/details
  const rng = mulberry32(spec.seed);
  const pal = paletteFor(spec);

  const A: Pt = { x: W / 2, y: 0 };
  const B: Pt = { x: 0, y: H };
  const C: Pt = { x: W, y: H };
  const P: Pt = { x: W / 2, y: H * FOLD_V };

  // Paper everywhere (incl. outside the triangle, for clean mip edges).
  const paper = ctx.createLinearGradient(0, 0, 0, H);
  paper.addColorStop(0, pal.top);
  paper.addColorStop(1, pal.bottom);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  tri(ctx, A, B, C);
  ctx.clip();

  // Soft light from the upper-left, like the scene's sun.
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.3, H * 0.3, W * 0.75);
  glow.addColorStop(0, "rgba(255, 255, 255, 0.4)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Paper grain.
  const dots = Math.round(220 * ((W * H) / (384 * 308)));
  ctx.fillStyle = rgba(pal.ink, 0.035);
  for (let i = 0; i < dots; i++) {
    const r = (0.5 + rng()) * s;
    ctx.fillRect(rng() * W, rng() * H, r, r);
  }

  // Faint ruled lines.
  ctx.strokeStyle = rgba(pal.ink, 0.07);
  ctx.lineWidth = Math.max(1, s);
  for (let y = H * 0.3; y < H * 0.98; y += H * 0.1) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
    ctx.stroke();
  }

  // Flaps: a soft overlap shadow on one side of each seam + the crease itself.
  for (const corner of [A, B, C]) seam(ctx, P, corner, pal.ink, s);

  drawText(ctx, spec, pal, family, W, H, rng);
  ctx.restore();

  drawSeal(ctx, P.x, P.y, H * (spec.kind === "filler" ? 0.068 : 0.075), pal.wax, rng);

  // Edges: a thin paper edge and an inner accent line.
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(pal.ink, 0.12);
  ctx.lineWidth = 1.5 * s;
  insetTri(ctx, A, B, C, 1 * s);
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.edge, pal.edgeAlpha);
  ctx.lineWidth = 2 * s;
  insetTri(ctx, A, B, C, 7 * s);
  ctx.stroke();

  return canvas;
}

function tri(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
}

/** Triangle shrunk toward its incentre by `d` pixels. */
function insetTri(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt, d: number) {
  const la = Math.hypot(b.x - c.x, b.y - c.y);
  const lb = Math.hypot(a.x - c.x, a.y - c.y);
  const lc = Math.hypot(a.x - b.x, a.y - b.y);
  const per = la + lb + lc;
  const I = { x: (la * a.x + lb * b.x + lc * c.x) / per, y: (la * a.y + lb * b.y + lc * c.y) / per };
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  const inradius = (2 * area) / per;
  const k = Math.max(0, 1 - d / inradius);
  const shrink = (p: Pt): Pt => ({ x: I.x + (p.x - I.x) * k, y: I.y + (p.y - I.y) * k });
  tri(ctx, shrink(a), shrink(b), shrink(c));
}

function seam(ctx: CanvasRenderingContext2D, p: Pt, q: Pt, ink: string, s: number) {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  const band = 16 * s;

  const g = ctx.createLinearGradient(p.x, p.y, p.x + nx * band, p.y + ny * band);
  g.addColorStop(0, rgba(ink, 0.09));
  g.addColorStop(1, rgba(ink, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.lineTo(q.x + nx * band, q.y + ny * band);
  ctx.lineTo(p.x + nx * band, p.y + ny * band);
  ctx.closePath();
  ctx.fill();

  ctx.lineCap = "round";
  ctx.strokeStyle = rgba(ink, 0.18);
  ctx.lineWidth = 1.4 * s;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(p.x - nx * 1.3 * s, p.y - ny * 1.3 * s);
  ctx.lineTo(q.x - nx * 1.3 * s, q.y - ny * 1.3 * s);
  ctx.stroke();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  spec: PaintSpec,
  pal: Palette,
  family: string,
  W: number,
  H: number,
  rng: Rng,
) {
  const text = spec.text.replace(/\s+/g, " ").trim();
  if (!text) return;

  const px = Math.round(H * (spec.kind === "filler" ? 0.095 : 0.078));
  ctx.save();
  ctx.font = `400 ${px}px ${family}`;
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = pal.inkAlpha;

  // Triangle width at canvas y is W·y/H; keep a margin from the slanted sides.
  const box = (f: number): LineBox => ({ y: H * f, width: W * f * 0.78 });
  const measure = (str: string) => ctx.measureText(str).width;
  // Short lines live in the wide bottom band; longer text also uses the top band above the seal.
  let wrapped = wrapIntoBoxes(text, [box(0.8), box(0.915)], measure);
  if (wrapped.truncated) wrapped = wrapIntoBoxes(text, [box(0.4), box(0.52), box(0.8), box(0.915)], measure);

  // A slight slant so it reads as handwriting.
  const cx = W / 2;
  const cy = H * 0.7;
  ctx.translate(cx, cy);
  ctx.rotate(((rng() - 0.5) * 5 * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  for (const line of wrapped.lines) ctx.fillText(line.text, cx + (rng() - 0.5) * 6, line.y);
  ctx.restore();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const h = w * 0.9;
  ctx.beginPath();
  ctx.moveTo(x, y + 0.45 * h);
  ctx.bezierCurveTo(x - 0.1 * w, y + 0.3 * h, x - 0.5 * w, y + 0.1 * h, x - 0.5 * w, y - 0.15 * h);
  ctx.bezierCurveTo(x - 0.5 * w, y - 0.45 * h, x - 0.1 * w, y - 0.5 * h, x, y - 0.22 * h);
  ctx.bezierCurveTo(x + 0.1 * w, y - 0.5 * h, x + 0.5 * w, y - 0.45 * h, x + 0.5 * w, y - 0.15 * h);
  ctx.bezierCurveTo(x + 0.5 * w, y + 0.1 * h, x + 0.1 * w, y + 0.3 * h, x, y + 0.45 * h);
  ctx.closePath();
}

function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, wax: Palette["wax"], rng: Rng) {
  ctx.save();

  // Irregular wax blob with a soft drop shadow.
  const n = 16;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rng() - 0.5) * 0.12);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, wax.light);
  g.addColorStop(0.55, wax.base);
  g.addColorStop(1, wax.dark);
  ctx.shadowColor = "rgba(60, 20, 40, 0.28)";
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetY = r * 0.15;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Pressed ring + heart.
  ctx.strokeStyle = rgba(wax.dark, 0.5);
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();

  heartPath(ctx, x, y + r * 0.05, r * 0.82);
  ctx.fillStyle = wax.heart;
  ctx.globalAlpha = 0.92;
  ctx.fill();

  // Gloss.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.42, y - r * 0.48, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------- textures ---

export function createLetterTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Soft round sprite for the dust particles. */
export function createDotTexture(size: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const c = size / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.35, "rgba(255, 255, 255, 0.8)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.generateMipmaps = true;
  return tex;
}
