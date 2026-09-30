// Pure SVG layouts for the 1200×630 link-preview images (/api/og*), in the V2
// stationery look: a cream desk, the writer's envelope with a wax seal, a paper
// sheet with fold creases, a postage stamp + postmark and a rubber stamp.
// No DOM / Node APIs: render.ts rasterises the string with resvg.
//
// resvg quirks (verified with the bundled fonts):
//  - Arabic shapes fine, but the paragraph direction defaults to LTR, so numbers,
//    dashes, quotes and Latin runs land on the wrong side. Every Arabic line is
//    wrapped in RLE…PDF (U+202B/U+202C) and anchored with text-anchor end/middle.
//  - Font fallback is per <text>, not per character: if ANY character is missing
//    from the first family, the whole run is drawn in the fallback. Molhim has
//    no Latin letters and no «» — … ·, so each run picks its family up front
//    (see art.ts canUseMolhim) and blocks of lines share one family.
//  - Changing font-family inside one <text> (tspans) doesn't work either.
//  - There is no emoji font: emoji must be stripped (they render as tofu).
//  - Full-canvas feTurbulence grain costs ~300 ms and bloats the PNG past 800 KB,
//    so paper texture is a small tiled speck pattern instead.

import type { IconName } from "@/lib/assets";
import {
  DOVE_PATH,
  FAMILY,
  HEART_PATH,
  INK,
  cancelWaves,
  canUseMolhim,
  envelopeColors,
  iconArtSvg,
  mixHex,
  perforatedPath,
  seeded,
  toMolhimPunctuation,
  waxBlobPath,
  type EnvelopeColors,
} from "./art";

export const OG_W = 1200;
export const OG_H = 630;
/** Default family for resvg (anything unspecified falls back to Plex). */
export const OG_SANS = FAMILY.plex;

export interface OgPalette {
  key: string;
  accent: string;
  bg: string;
  ink: string;
  gradient: [string, string];
  icon: IconName;
}

export interface OgBrand {
  /** data: URI of the official logo (PNG), or null → the Arabic wordmark. */
  logo: string | null;
  /** Logo aspect ratio (width / height). */
  logoRatio: number;
  /** Arabic wordmark fallback, e.g. "ذا شفز". */
  wordmark: string;
  host: string;
  /** Postmark rings: "يوم المعلم" on top, "٥ أكتوبر" underneath. */
  postmarkTop: string;
  postmarkBottom: string;
}

export interface OgLetterScene {
  kind: "letter";
  /** "إلى" / "إلى روح". */
  toLabel: string;
  /** "أستاذة نورة". */
  toName: string;
  school: string | null;
  body: string;
  /** "— اسم المرسل" */
  signature: string;
  /** Posting date, e.g. "5 أكتوبر 2026" (Molhim draws the digits as Arabic-Indic). */
  date: string;
  stamp: string;
  memory: boolean;
  palette: OgPalette;
  /** Seeds the wax blob / stamp wear so each letter looks hand-made but stable. */
  seed: string;
  brand: OgBrand;
}

export interface OgSearchScene {
  kind: "search";
  total: number;
  /** "12" — drawn big. */
  countNumber: string;
  countLabel: string;
  /** "إلى" + the query (only rendered when total > 0). */
  toLabel: string;
  query: string;
  tagline: string;
  /** Invitation (total = 0). */
  emptyTitle: string;
  emptyLead: string;
  emptyCta: string;
  brand: OgBrand;
}

export interface OgDefaultScene {
  kind: "default";
  eyebrow: string;
  titleLead: string;
  titleWord: string;
  lead: string;
  brand: OgBrand;
}

export type OgScene = OgLetterScene | OgSearchScene | OgDefaultScene;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const EMOJI_RE =
  /[0-9#*]️?⃣|\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}︎️‍⃣]/gu;
// Control chars (invalid in XML) + bidi overrides/marks (we add our own).
const UNSAFE_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F؜‎‏‪-‮⁦-⁩￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Removes emoji (resvg has no emoji font) and XML-unsafe / bidi control chars; collapses whitespace. */
export function stripEmoji(s: string): string {
  return s
    .replace(UNSAFE_RE, "")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .replace(/ ([،,.!؟?:])/g, "$1")
    .trim();
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * "sans"/"sansBold" = the brand face: Molhim when the text allows it, else Plex
 * (see pickSans). "latin*" = always Plex (URLs). "hand*" = Aref Ruqaa.
 */
export type OgFont = "sans" | "sansBold" | "latin" | "latinBold" | "hand" | "handBold";
type Face = "molhim" | "molhimBold" | "plex" | "plexBold" | "ruqaa" | "ruqaaBold";

// Average advance per character in em, fitted against the bundled TTFs with
// resvg (p95 error ≈ 9%) plus ~8% headroom so estimated lines never overflow.
// "sp" also absorbs the wider word-final letter forms.
// "dash" = the em dash that opens every signature (a full em in Ruqaa).
const EM: Record<Face, { ar: number; sp: number; dig: number; lat: number; dash: number }> = {
  molhim: { ar: 0.36, sp: 0.74, dig: 0.43, lat: 0.52, dash: 0.52 },
  molhimBold: { ar: 0.355, sp: 0.74, dig: 0.42, lat: 0.52, dash: 0.52 },
  plex: { ar: 0.41, sp: 0.58, dig: 0.63, lat: 0.56, dash: 0.8 },
  plexBold: { ar: 0.44, sp: 0.6, dig: 0.64, lat: 0.6, dash: 0.8 },
  ruqaa: { ar: 0.35, sp: 0.27, dig: 0.53, lat: 0.62, dash: 1 },
  ruqaaBold: { ar: 0.35, sp: 0.27, dig: 0.58, lat: 0.66, dash: 1 },
};

/** Molhim when every given string fits it (after punctuation swaps), else Plex — one family per block. */
export function pickSans(texts: string[]): "molhim" | "plex" {
  return texts.every((t) => canUseMolhim(toMolhimPunctuation(t))) ? "molhim" : "plex";
}

function faceFor(font: OgFont, s: string, forced?: "molhim" | "plex"): Face {
  const bold = font.endsWith("Bold");
  if (font.startsWith("hand")) return bold ? "ruqaaBold" : "ruqaa";
  if (font.startsWith("latin")) return bold ? "plexBold" : "plex";
  const fam = forced ?? pickSans([s]);
  return fam === "molhim" ? (bold ? "molhimBold" : "molhim") : bold ? "plexBold" : "plex";
}

/** Estimated rendered width in px. */
export function textWidth(s: string, size: number, font: OgFont, forced?: "molhim" | "plex"): number {
  const face = faceFor(font, s, forced);
  const m = EM[face];
  const str = face.startsWith("molhim") ? toMolhimPunctuation(s) : s;
  let w = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed)) continue; // tashkeel
    if (c === 0x20) w += m.sp;
    else if (c === 0x2014) w += m.dash;
    else if ((c >= 0x30 && c <= 0x39) || (c >= 0x660 && c <= 0x669)) w += m.dig;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfeff)) w += m.ar;
    else w += m.lat;
  }
  return w * size;
}

const ELLIPSIS = "…";

function ellipsize(line: string, maxWidth: number, size: number, font: OgFont, forced?: "molhim" | "plex"): string {
  let s = line.trimEnd();
  while (s && textWidth(s + ELLIPSIS, size, font, forced) > maxWidth) {
    const cut = s.lastIndexOf(" ");
    s = cut > 0 ? s.slice(0, cut).trimEnd() : Array.from(s).slice(0, -1).join("");
  }
  return s + ELLIPSIS;
}

/** Greedy word wrap by estimated width; the last kept line gets "…" when text is cut. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  font: OgFont,
  maxLines: number,
  forced?: "molhim" | "plex",
): { lines: string[]; truncated: boolean } {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => textWidth(s, size, font, forced) <= maxWidth;
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (fits(word)) {
      cur = word;
    } else {
      // One very long "word" (URL, repeated letters…): hard-break it.
      let piece = "";
      for (const ch of word) {
        if (piece && !fits(piece + ch)) {
          lines.push(piece);
          piece = "";
        }
        piece += ch;
      }
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], maxWidth, size, font, forced);
  return { lines: kept, truncated: true };
}

/** One line that shrinks from maxSize to minSize to fit, then gets "…". */
export function fitLine(
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  font: OgFont,
): { text: string; size: number } {
  const w1 = textWidth(text, 1, font);
  const size = Math.max(minSize, Math.min(maxSize, Math.floor(w1 > 0 ? maxWidth / w1 : maxSize)));
  if (textWidth(text, size, font) <= maxWidth) return { text, size };
  return { text: ellipsize(text, maxWidth, size, font), size };
}

// ---------------------------------------------------------------------------
// SVG primitives
// ---------------------------------------------------------------------------

const n = (v: number) => Math.round(v * 10) / 10;
const f3 = (v: number) => Math.round(v * 1000) / 1000;

interface TextOpts {
  size: number;
  font: OgFont;
  fill: string;
  anchor?: "start" | "middle" | "end";
  /** Arabic line (default). false → plain LTR (URLs). */
  rtl?: boolean;
  opacity?: number;
  /** Force the brand-sans family for a block of lines (see pickSans). */
  family?: "molhim" | "plex";
  extra?: string;
}

const FACE_FAMILY: Record<Face, [string, number]> = {
  molhim: [FAMILY.molhim, 400],
  molhimBold: [FAMILY.molhim, 700],
  plex: [FAMILY.plex, 400],
  plexBold: [FAMILY.plex, 700],
  ruqaa: [FAMILY.ruqaa, 400],
  ruqaaBold: [FAMILY.ruqaa, 700],
};

function text(s: string, x: number, y: number, o: TextOpts): string {
  if (!s) return "";
  const face = faceFor(o.font, s, o.family);
  const [family, weight] = FACE_FAMILY[face];
  const content = escapeXml(face.startsWith("molhim") ? toMolhimPunctuation(s) : s);
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${family}" font-weight="${weight}" font-size="${n(o.size)}"` +
    ` fill="${o.fill}" text-anchor="${o.anchor ?? "end"}"` +
    (o.opacity != null ? ` fill-opacity="${o.opacity}"` : "") +
    (o.extra ? ` ${o.extra}` : "") +
    `>${o.rtl === false ? content : `‫${content}‬`}</text>`
  );
}

function motif(kind: "heart" | "dove", cx: number, cy: number, size: number, fill: string, extra = ""): string {
  const s = size / 24;
  return `<path d="${kind === "dove" ? DOVE_PATH : HEART_PATH}" transform="translate(${n(cx - 12 * s)} ${n(cy - 12 * s)}) scale(${f3(s)})" fill="${fill}" ${extra}/>`;
}

/**
 * Soft drop shadow for rects, built from stacked translucent rects: close to a
 * blur and ~10× cheaper for resvg than feDropShadow at this size.
 */
function softShadow(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  o: { color: string; opacity: number; spread: number; dy: number; steps?: number },
): string {
  const steps = o.steps ?? 8;
  let out = "";
  for (let i = steps; i >= 1; i--) {
    const e = (o.spread * i) / steps - o.spread * 0.35;
    out += `<rect x="${n(x - e)}" y="${n(y - e + o.dy)}" width="${n(w + 2 * e)}" height="${n(h + 2 * e)}" rx="${n(Math.max(0, r + e))}" fill="${o.color}" fill-opacity="${f3(o.opacity / steps)}"/>`;
  }
  return out;
}

class Svg {
  defs: string[] = [];
  body: string[] = [];
  private ids = 0;
  private cache = new Map<string, string>();
  id(prefix: string) {
    return `${prefix}${++this.ids}`;
  }
  add(...parts: string[]) {
    this.body.push(...parts);
  }
  /** Defines something once per image (patterns, masks) and returns its id. */
  once(key: string, build: (id: string) => string): string {
    let id = this.cache.get(key);
    if (!id) {
      id = this.id("d");
      this.cache.set(key, id);
      this.defs.push(build(id));
    }
    return id;
  }
  /** Soft round glow. */
  blob(cx: number, cy: number, r: number, color: string, opacity: number) {
    const id = this.id("g");
    this.defs.push(
      `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="0.55" stop-color="${color}" stop-opacity="${f3(opacity * 0.45)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    );
    this.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
  }
  blur(std: number): string {
    return `url(#${this.once(`blur${std}`, (id) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${std}"/></filter>`)})`;
  }
  linear(a: string, b: string, x2 = 1, y2 = 1): string {
    const id = this.id("l");
    this.defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }
  /** Tiled paper specks — cheap texture that compresses well. */
  grain(color: string, opacity: number): string {
    const id = this.once(`grain${color}${opacity}`, (id) => {
      const rand = seeded("grain");
      let dots = "";
      for (let i = 0; i < 28; i++) {
        const r = 0.45 + rand() * 0.9;
        dots += `<circle cx="${n(rand() * 90)}" cy="${n(rand() * 90)}" r="${f3(r)}" fill-opacity="${f3(0.4 + rand() * 0.6)}"/>`;
      }
      for (let i = 0; i < 4; i++) {
        const x = rand() * 90;
        const y = rand() * 90;
        const a = rand() * Math.PI;
        const l = 3 + rand() * 5;
        dots += `<path d="M${n(x)} ${n(y)}l${n(Math.cos(a) * l)} ${n(Math.sin(a) * l)}" stroke="${color}" stroke-width="0.6" stroke-opacity="0.8"/>`;
      }
      return `<pattern id="${id}" width="90" height="90" patternUnits="userSpaceOnUse"><g fill="${color}" opacity="${opacity}">${dots}</g></pattern>`;
    });
    return `url(#${id})`;
  }
  toString() {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">` +
      `<defs>${this.defs.join("")}</defs>${this.body.join("")}</svg>`
    );
  }
}

// ---------------------------------------------------------------------------
// Stationery pieces
// ---------------------------------------------------------------------------

function desk(svg: Svg, glow: string) {
  svg.add(`<rect width="${OG_W}" height="${OG_H}" fill="${INK.cream2}"/>`);
  svg.blob(930, 120, 620, "#ffffff", 0.55);
  svg.blob(120, 620, 420, glow, 0.12);
}

/** A wax seal: irregular blob, pressed ring and an embossed heart (or dove). */
function waxSeal(svg: Svg, cx: number, cy: number, r: number, env: EnvelopeColors, kind: "heart" | "dove", seed: string): string {
  const rand = seeded(seed);
  const grad = svg.id("w");
  const ring = svg.id("w");
  svg.defs.push(
    `<radialGradient id="${grad}" cx="0.36" cy="0.32" r="0.78"><stop offset="0" stop-color="${env.waxLight}"/><stop offset="0.55" stop-color="${env.wax}"/><stop offset="1" stop-color="${env.waxDark}"/></radialGradient>`,
    `<linearGradient id="${ring}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${env.waxDark}" stop-opacity="0.9"/><stop offset="1" stop-color="${env.waxLight}" stop-opacity="0.9"/></linearGradient>`,
  );
  const k = r * 0.045;
  const m = r * (kind === "dove" ? 1.0 : 0.9);
  return (
    `<ellipse cx="${n(cx + r * 0.06)}" cy="${n(cy + r * 0.16)}" rx="${n(r * 1.02)}" ry="${n(r * 0.98)}" fill="${INK.plum950}" fill-opacity="0.32" filter="${svg.blur(Math.max(2, Math.round(r * 0.09)))}"/>` +
    `<path d="${waxBlobPath(cx, cy, r, rand)}" fill="url(#${grad})"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.72)}" fill="${env.wax}" stroke="url(#${ring})" stroke-width="${n(r * 0.07)}"/>` +
    motif(kind, cx + k, cy + k, m, env.waxLight, `fill-opacity="0.95"`) +
    motif(kind, cx - k, cy - k, m, env.waxDark, `fill-opacity="0.95"`) +
    motif(kind, cx, cy, m, mixHex(env.wax, "#ffffff", 0.1)) +
    `<ellipse cx="${n(cx - r * 0.42)}" cy="${n(cy - r * 0.5)}" rx="${n(r * 0.2)}" ry="${n(r * 0.1)}" transform="rotate(-35 ${n(cx - r * 0.42)} ${n(cy - r * 0.5)})" fill="#ffffff" fill-opacity="0.28"/>`
  );
}

/** The back of an envelope in the writer's colour, flap closed, centred on (cx, cy). */
function envelopeBack(
  svg: Svg,
  cx: number,
  cy: number,
  w: number,
  rot: number,
  env: EnvelopeColors,
  o: { seal?: "heart" | "dove"; seed: string; label?: string; shadow?: number },
): string {
  const h = w * 0.66;
  const x = -w / 2;
  const y = -h / 2;
  const clip = svg.id("c");
  svg.defs.push(`<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(w * 0.018)}"/></clipPath>`);
  const seam = `stroke="${env.deep}" stroke-opacity="0.35" stroke-width="${n(Math.max(1, w * 0.004))}" fill="none" stroke-linejoin="round"`;
  const tip = h * 0.14; // top flap tip, below the centre
  const parts = [
    softShadow(x, y, w, h, w * 0.02, { color: INK.plum950, opacity: o.shadow ?? 0.34, spread: w * 0.06, dy: w * 0.03 }),
    `<g clip-path="url(#${clip})">`,
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${env.base}"/>`,
    // side flaps, bottom flap
    `<path d="M${n(x)} ${n(y)} L${n(-w * 0.04)} ${n(h * 0.06)} L${n(x)} ${n(-y)}Z" fill="${env.light}"/>`,
    `<path d="M${n(-x)} ${n(y)} L${n(w * 0.04)} ${n(h * 0.06)} L${n(-x)} ${n(-y)}Z" fill="${env.light}"/>`,
    `<path d="M${n(x)} ${n(-y)} L0 ${n(-h * 0.06)} L${n(-x)} ${n(-y)}Z" fill="${env.dark}"/>`,
    `<path d="M${n(x)} ${n(-y)} L0 ${n(-h * 0.06)} L${n(-x)} ${n(-y)}" ${seam}/>`,
    // top flap with its shadow
    `<path d="M${n(x)} ${n(y)} L0 ${n(tip + h * 0.03)} L${n(-x)} ${n(y)}Z" fill="${env.deep}" fill-opacity="0.22" filter="${svg.blur(Math.max(2, Math.round(w * 0.012)))}"/>`,
    `<path d="M${n(x)} ${n(y)} L0 ${n(tip)} L${n(-x)} ${n(y)}Z" fill="${env.base}"/>`,
    `<path d="M${n(x)} ${n(y)} L0 ${n(tip)} L${n(-x)} ${n(y)}" ${seam}/>`,
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${svg.grain(INK.plum950, 0.07)}"/>`,
    `</g>`,
  ];
  if (o.label) parts.push(o.label);
  if (o.seal) parts.push(waxSeal(svg, 0, tip - w * 0.005, w * 0.1, env, o.seal, o.seed));
  return `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${rot})">${parts.join("")}</g>`;
}

/** The official logo (or the Arabic wordmark when the PNG is unavailable). `x`/`y` = top-left. */
function logo(brand: OgBrand, x: number, y: number, h: number): string {
  if (brand.logo) {
    const w = h * brand.logoRatio;
    return `<image href="${brand.logo}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  return text(brand.wordmark, x, y + h * 0.82, { size: h * 0.95, font: "sansBold", fill: INK.plum, anchor: "start" });
}

function logoWidth(brand: OgBrand, h: number): number {
  return brand.logo ? h * brand.logoRatio : textWidth(brand.wordmark, h * 0.95, "sansBold");
}

/** Perforated postage stamp showing the card's icon, top-left corner at (x, y). */
function postageStamp(svg: Svg, x: number, y: number, w: number, h: number, rot: number, p: OgPalette, caption: string, memory: boolean): string {
  const hole = w * 0.045;
  const inset = w * 0.1;
  const iw = w - inset * 2;
  const ih = h - inset * 2 - h * 0.14;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const tint = memory ? mixHex(p.bg, p.accent, 0.12) : mixHex(p.bg, p.gradient[0], 0.35);
  const icon = Math.min(iw, ih) * 0.84;
  return (
    `<g transform="rotate(${rot} ${n(cx)} ${n(cy)})">` +
    `<path d="${perforatedPath(x + 2, y + 5, w, h, hole, w / 9)}" fill="${INK.plum950}" fill-opacity="0.2" filter="${svg.blur(3)}"/>` +
    `<path d="${perforatedPath(x, y, w, h, hole, w / 9)}" fill="#fffefa"/>` +
    `<rect x="${n(x + inset)}" y="${n(y + inset)}" width="${n(iw)}" height="${n(ih)}" fill="${tint}"/>` +
    `<rect x="${n(x + inset + 3)}" y="${n(y + inset + 3)}" width="${n(iw - 6)}" height="${n(ih - 6)}" fill="none" stroke="${p.accent}" stroke-opacity="0.35" stroke-width="1"/>` +
    iconArtSvg(p.icon, cx - icon / 2, y + inset + (ih - icon) / 2, icon) +
    text(caption, cx, y + h - inset * 0.95, { size: h * 0.085, font: "sansBold", fill: p.accent, anchor: "middle" }) +
    `</g>`
  );
}

/** Round postmark with its two lines of text on the rings + wavy cancellation lines. */
function postmark(svg: Svg, cx: number, cy: number, r: number, brand: OgBrand, ink: string, wavesTo: number): string {
  const top = svg.id("p");
  const bot = svg.id("p");
  const rt = r * 0.72;
  const rb = r * 0.72 + r * 0.2;
  svg.defs.push(
    `<path id="${top}" d="M${n(cx - rt)} ${n(cy)} A${n(rt)} ${n(rt)} 0 0 1 ${n(cx + rt)} ${n(cy)}"/>`,
    `<path id="${bot}" d="M${n(cx - rb)} ${n(cy)} A${n(rb)} ${n(rb)} 0 0 0 ${n(cx + rb)} ${n(cy)}"/>`,
  );
  const size = r * 0.3;
  const onPath = (id: string, s: string) =>
    `<text font-family="${FAMILY.molhim}" font-weight="700" font-size="${n(size)}" fill="${ink}"><textPath href="#${id}" xlink:href="#${id}" startOffset="50%" text-anchor="middle">‫${escapeXml(toMolhimPunctuation(s))}‬</textPath></text>`;
  const waveLen = wavesTo - (cx - r * 1.08);
  return (
    `<g opacity="0.62">` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${ink}" stroke-width="${n(r * 0.05)}"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.5)}" fill="none" stroke="${ink}" stroke-width="${n(r * 0.035)}"/>` +
    (canUseMolhim(toMolhimPunctuation(brand.postmarkTop)) ? onPath(top, brand.postmarkTop) : "") +
    (canUseMolhim(toMolhimPunctuation(brand.postmarkBottom)) ? onPath(bot, brand.postmarkBottom) : "") +
    motif("heart", cx, cy + r * 0.02, r * 0.42, ink) +
    `<path d="${cancelWaves(cx - r * 1.08, cy - r * 0.36, waveLen, 4, r * 0.24, r * 0.07)}" stroke="${ink}" stroke-width="${n(r * 0.045)}" fill="none" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** Slanted rubber stamp with a double border and worn ink. */
function rubberStamp(svg: Svg, cx: number, cy: number, label: string, color: string, rot: number, size: number): string {
  const sw = textWidth(label, size, "handBold") + size * 1.5;
  const sh = size * 2;
  const mask = svg.once("stampWear", (id) => {
    const rand = seeded("stamp");
    let specks = "";
    for (let i = 0; i < 26; i++) {
      specks += `<circle cx="${n(rand() * 60)}" cy="${n(rand() * 60)}" r="${f3(0.5 + rand() * 1.6)}" fill-opacity="${f3(0.5 + rand() * 0.5)}"/>`;
    }
    return `<pattern id="${id}p" width="60" height="60" patternUnits="userSpaceOnUse"><g fill="#000">${specks}</g></pattern><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${OG_W}" height="${OG_H}"><rect width="${OG_W}" height="${OG_H}" fill="#fff"/><rect width="${OG_W}" height="${OG_H}" fill="url(#${id}p)"/></mask>`;
  });
  return (
    `<g mask="url(#${mask})"><g transform="rotate(${rot} ${n(cx)} ${n(cy)})" opacity="0.86">` +
    `<rect x="${n(cx - sw / 2)}" y="${n(cy - sh / 2)}" width="${n(sw)}" height="${n(sh)}" rx="${n(size * 0.3)}" fill="none" stroke="${color}" stroke-width="${n(size * 0.11)}"/>` +
    `<rect x="${n(cx - sw / 2 + size * 0.22)}" y="${n(cy - sh / 2 + size * 0.22)}" width="${n(sw - size * 0.44)}" height="${n(sh - size * 0.44)}" rx="${n(size * 0.16)}" fill="none" stroke="${color}" stroke-width="${n(size * 0.045)}"/>` +
    text(label, cx, cy + size * 0.36, { size, font: "handBold", fill: color, anchor: "middle" }) +
    `</g></g>`
  );
}

/** Cream sheet with shadow, speck grain and the two triangle-fold creases. */
function sheet(svg: Svg, x: number, y: number, w: number, h: number): string {
  const clip = svg.id("c");
  svg.defs.push(`<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6"/></clipPath>`);
  const apexX = x + w / 2;
  const reach = Math.min(h * 0.72, w * 0.5);
  const crease = (x2: number) =>
    `<path d="M${n(apexX)} ${n(y)} L${n(x2)} ${n(y + reach)}" stroke="${INK.plum950}" stroke-opacity="0.07" stroke-width="2.2"/>` +
    `<path d="M${n(apexX + 1.5)} ${n(y + 1)} L${n(x2 + 1.5)} ${n(y + reach + 1)}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.4"/>`;
  const shade = svg.linear(INK.plum950, INK.plum950, 0, 1);
  return (
    softShadow(x, y, w, h, 6, { color: INK.plum950, opacity: 0.26, spread: 26, dy: 14 }) +
    `<g clip-path="url(#${clip})">` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${INK.paper}"/>` +
    // the upper triangle (the fold that was on top) catches a little less light
    `<path d="M${n(x)} ${n(y)} L${n(apexX)} ${n(y)} L${n(x)} ${n(y + reach)}Z" fill="${shade}" fill-opacity="0.018"/>` +
    crease(x) +
    crease(x + w) +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${svg.grain(INK.plum, 0.06)}"/>` +
    `</g>`
  );
}

// ---------------------------------------------------------------------------
// Letter
// ---------------------------------------------------------------------------

function letterSvg(s: OgLetterScene): string {
  const svg = new Svg();
  const p = s.palette;
  const env = envelopeColors(p);
  desk(svg, p.gradient[1]);

  // Envelope (behind the sheet, on the end/left side) with the return label.
  const labelW = 150;
  const logoH = 26;
  const label =
    `<g transform="translate(-196 44) rotate(2)">` +
    `<rect x="0" y="0" width="${labelW}" height="54" rx="3" fill="#fffdf6"/>` +
    `<rect x="4" y="4" width="${labelW - 8}" height="46" rx="2" fill="none" stroke="${INK.plum}" stroke-opacity="0.14"/>` +
    logo(s.brand, (labelW - logoWidth(s.brand, logoH)) / 2, 14, logoH) +
    `</g>`;
  svg.add(envelopeBack(svg, 262, 318, 470, -8, env, { seal: s.memory ? "dove" : "heart", seed: s.seed, label }));

  // Sheet
  const SX = 412;
  const SY = 34;
  const SW = 748;
  const SH = 562;
  const scx = SX + SW / 2;
  const scy = SY + SH / 2;
  const parts: string[] = [sheet(svg, SX, SY, SW, SH)];

  const TX = SX + SW - 58; // text start (right)
  const TL = SX + 52;

  // Stamp in the sheet's top-end (left) corner; the postmark sits on its
  // inner edge with the cancellation waves running back across it.
  const stW = 112;
  const stH = 136;
  const stX = TL + 2;
  const stY = SY + 30;
  const pmR = 40;
  const pmX = stX + stW + 8;
  parts.push(postageStamp(svg, stX, stY, stW, stH, -3, p, s.brand.wordmark, s.memory));
  parts.push(postmark(svg, pmX, stY + stH * 0.64, pmR, s.brand, INK.plum950, stX - 18));

  // Address block: «إلى» small, then the name, then the school.
  const nameMaxW = TX - (pmX + pmR + 30);
  const name = fitLine(s.toName, nameMaxW, 54, 32, "sansBold");
  const school = s.school ? fitLine(s.school, nameMaxW, 24, 20, "sans") : null;
  const ay = SY + 72;
  parts.push(text(s.toLabel, TX, ay, { size: 24, font: "sans", fill: INK.inkSoft }));
  const nameBase = ay + 12 + name.size * 0.95;
  parts.push(text(name.text, TX, nameBase, { size: name.size, font: "sansBold", fill: p.ink }));
  const schoolBase = nameBase + 40;
  if (school) parts.push(text(school.text, TX, schoolBase, { size: school.size, font: "sans", fill: INK.inkSoft }));
  const headEnd = Math.max(school ? schoolBase : nameBase, stY + stH + 4);

  // Body: short letters get a bigger size; long ones are cut after as many
  // lines as fit above the signature. One family for the whole block.
  const TW = TX - TL;
  const fam = pickSans([s.body]);
  const sigMax = SY + SH - 46;
  const bodyTop = headEnd + 24;
  let size = 28;
  let lh = 53;
  let lines: string[] = [];
  for (const sz of [46, 42, 38, 35, 32, 30, 28]) {
    size = sz;
    lh = Math.round(sz * 1.9);
    const first = bodyTop + sz * 0.95;
    const max = Math.max(1, Math.floor((sigMax - first - lh * 0.95) / lh) + 1);
    const w = wrapText(s.body, TW, sz, "sans", max, fam);
    lines = w.lines;
    if (!w.truncated) break;
  }
  const firstBase = bodyTop + size * 0.95;
  const lastBase = firstBase + (lines.length - 1) * lh;
  // Faint ruled lines behind the body only.
  const rules: string[] = [];
  for (let i = 0; i < lines.length; i++) rules.push(`M${n(TL - 8)} ${n(firstBase + i * lh + size * 0.32)} H${n(TX + 8)}`);
  parts.push(`<path d="${rules.join(" ")}" stroke="${p.accent}" stroke-opacity="0.13" stroke-width="1.3"/>`);
  lines.forEach((line, i) => parts.push(text(line, TX, firstBase + i * lh, { size, font: "sans", fill: p.ink, family: fam })));

  // Closing right under the body: signature in Ruqaa (accent) + the date;
  // the rubber stamp slants across the bottom-end corner.
  const sigY = Math.min(sigMax, lastBase + Math.max(58, lh * 1.05));
  const sig = fitLine(s.signature, TW - 300, 34, 24, "handBold");
  parts.push(text(sig.text, TX, sigY, { size: sig.size, font: "handBold", fill: p.accent }));
  if (s.date) {
    // The estimate can run ~10% short on short names: keep a generous gap.
    const dx = TX - textWidth(sig.text, sig.size, "handBold") * 1.1 - 26;
    parts.push(text(s.date, dx, sigY - 2, { size: 19, font: "sans", fill: INK.inkMute }));
  }
  parts.push(rubberStamp(svg, TL + 122, SY + SH - 62, s.stamp, s.memory ? p.accent : mixHex(p.accent, INK.plum950, 0.1), -9, 30));

  svg.add(`<g transform="rotate(-1.2 ${n(scx)} ${n(scy)})">${parts.join("")}</g>`);

  svg.add(text(s.brand.host, 58, 604, { size: 20, font: "latinBold", fill: INK.plum, anchor: "start", rtl: false, opacity: 0.8 }));
  return svg.toString();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const FAN: { key: string; accent: string; gradient: [string, string] }[] = [
  { key: "plum", accent: "#691d4e", gradient: ["#a73784", "#691d4e"] },
  { key: "orange", accent: "#eb652c", gradient: ["#f7a64f", "#eb652c"] },
  { key: "gold", accent: "#c98a2e", gradient: ["#f7c87a", "#d9913a"] },
  { key: "magenta", accent: "#a73784", gradient: ["#d77fb8", "#a73784"] },
  { key: "cream", accent: "#8a5a3c", gradient: ["#f4ece0", "#d9bfa3"] },
];

/** A hand-drawn underline (slightly wavy, tapering) under a word ending at x1. */
function underline(x1: number, y: number, len: number, color: string, width: number): string {
  const x0 = x1 - len;
  return `<path d="M${n(x1 + 4)} ${n(y)} C${n(x1 - len * 0.3)} ${n(y + width * 1.4)} ${n(x0 + len * 0.35)} ${n(y - width * 0.8)} ${n(x0 - 6)} ${n(y + width * 0.9)}" stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" fill="none"/>`;
}

/** A pencil lying on the desk. */
function pencil(cx: number, cy: number, len: number, rot: number): string {
  const w = len * 0.11;
  const body = len * 0.68;
  const x = -len / 2;
  return (
    `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${rot})">` +
    `<rect x="${n(x)}" y="${n(-w / 2)}" width="${n(len * 0.1)}" height="${n(w)}" rx="${n(w * 0.3)}" fill="#a73784"/>` +
    `<rect x="${n(x + len * 0.09)}" y="${n(-w / 2)}" width="${n(len * 0.06)}" height="${n(w)}" fill="#d9bfa3"/>` +
    `<rect x="${n(x + len * 0.15)}" y="${n(-w / 2)}" width="${n(body)}" height="${n(w)}" fill="${INK.orange}"/>` +
    `<rect x="${n(x + len * 0.15)}" y="${n(-w / 2)}" width="${n(body)}" height="${n(w * 0.33)}" fill="#f59a6b"/>` +
    `<path d="M${n(x + len * 0.83)} ${n(-w / 2)} L${n(len / 2)} 0 L${n(x + len * 0.83)} ${n(w / 2)}Z" fill="#f4dcc0"/>` +
    `<path d="M${n(len / 2 - len * 0.055)} ${n(-w * 0.17)} L${n(len / 2)} 0 L${n(len / 2 - len * 0.055)} ${n(w * 0.17)}Z" fill="${INK.plumDeep}"/>` +
    `</g>`
  );
}

function searchSvg(s: OgSearchScene): string {
  const svg = new Svg();
  desk(svg, INK.orange);
  const R = 1128;

  if (s.total > 0) {
    // A little pile of envelopes in the wall's colours.
    const pile: [number, number, number, number][] = [
      [250, 250, 400, -14],
      [300, 372, 380, 7],
      [228, 420, 360, -4],
    ];
    pile.forEach(([x, y, w, r], i) => {
      svg.add(envelopeBack(svg, x, y, w, r, envelopeColors(FAN[i]), { seal: i === 2 ? "heart" : undefined, seed: `s${i}` }));
    });

    svg.add(logo(s.brand, R - logoWidth(s.brand, 34), 64, 34));
    const count = `${s.countNumber}`;
    const numSize = 132;
    const numW = textWidth(count, numSize, "sansBold");
    svg.add(text(count, R, 250, { size: numSize, font: "sansBold", fill: INK.orange }));
    svg.add(text(s.countLabel, R - numW - 22, 236, { size: 46, font: "sansBold", fill: INK.plum }));

    const q = fitLine(s.query, 560, 64, 34, "sansBold");
    svg.add(text(s.toLabel, R, 318, { size: 28, font: "sans", fill: INK.inkSoft }));
    const qBase = 318 + 16 + q.size * 0.95;
    svg.add(text(q.text, R, qBase, { size: q.size, font: "sansBold", fill: INK.plumDeep }));
    const qW = Math.min(560, textWidth(q.text, q.size, "sansBold"));
    svg.add(underline(R, qBase + 16, qW, INK.orange, 5));
    svg.add(text(s.tagline, R, qBase + 92, { size: 38, font: "sansBold", fill: "#a73784" }));
    svg.add(text(s.brand.host, R, 596, { size: 20, font: "latinBold", fill: INK.plum, anchor: "end", rtl: false, opacity: 0.8 }));
  } else {
    // Invitation: a blank sheet waiting for a letter, a pencil and an empty envelope.
    svg.add(envelopeBack(svg, 196, 430, 330, -10, envelopeColors(FAN[1]), { seed: "inv" }));
    const sx = 170;
    const sy = 70;
    svg.add(`<g transform="rotate(-5 ${sx + 150} ${sy + 190})">${sheet(svg, sx, sy, 300, 380)}</g>`);
    svg.add(pencil(400, 420, 290, -34));

    svg.add(logo(s.brand, R - logoWidth(s.brand, 34), 64, 34));
    const title = fitLine(s.emptyTitle, 600, 60, 40, "sansBold");
    svg.add(text(title.text, R, 214, { size: title.size, font: "sansBold", fill: INK.plum }));
    const lead = fitLine(s.emptyLead, 600, 40, 30, "sansBold");
    svg.add(text(lead.text, R, 296, { size: lead.size, font: "sansBold", fill: INK.orange }));
    const cta = fitLine(s.emptyCta, 520, 34, 26, "sansBold");
    svg.add(text(cta.text, R, 400, { size: cta.size, font: "sansBold", fill: INK.plumDeep }));
    svg.add(underline(R, 416, textWidth(cta.text, cta.size, "sansBold"), INK.orange, 5));
    svg.add(text(s.brand.host, R, 596, { size: 20, font: "latinBold", fill: INK.plum, anchor: "end", rtl: false, opacity: 0.8 }));
  }
  return svg.toString();
}

// ---------------------------------------------------------------------------
// Default (campaign)
// ---------------------------------------------------------------------------

function defaultSvg(s: OgDefaultScene): string {
  const svg = new Svg();
  desk(svg, "#a73784");

  // A spread of envelopes in every card colour, one sealed on top.
  const spread: [number, number, number, number][] = [
    [150, 150, 300, -16],
    [360, 110, 260, 9],
    [110, 400, 290, 8],
    [330, 470, 300, -7],
    [520, 300, 250, 14],
  ];
  spread.forEach(([x, y, w, r], i) => {
    svg.add(envelopeBack(svg, x, y, w, r, envelopeColors(FAN[i]), { seed: `d${i}`, shadow: 0.26 }));
  });
  svg.add(envelopeBack(svg, 300, 300, 360, -3, envelopeColors(FAN[0]), { seal: "heart", seed: "hero" }));

  const R = 1128;
  svg.add(logo(s.brand, R - logoWidth(s.brand, 38), 60, 38));
  svg.add(text(s.eyebrow, R, 164, { size: 26, font: "sansBold", fill: INK.orange }));
  svg.add(text(s.titleLead, R, 248, { size: 76, font: "sansBold", fill: INK.plum }));
  // The shadda on «معلّم» rises well above the word: leave it room under the first line.
  const word = s.titleWord;
  svg.add(text(word, R, 394, { size: 104, font: "sansBold", fill: INK.orange }));
  svg.add(underline(R, 420, textWidth(word, 104, "sansBold"), INK.orange, 6));
  const lead = fitLine(s.lead, 560, 32, 24, "sans");
  svg.add(text(lead.text, R, 490, { size: lead.size, font: "sans", fill: INK.inkSoft }));
  svg.add(text(s.brand.host, R, 596, { size: 20, font: "latinBold", fill: INK.plum, anchor: "end", rtl: false, opacity: 0.8 }));
  return svg.toString();
}

export function buildOgSvg(scene: OgScene): string {
  switch (scene.kind) {
    case "letter":
      return letterSvg(scene);
    case "search":
      return searchSvg(scene);
    default:
      return defaultSvg(scene);
  }
}
