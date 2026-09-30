// Browser only: draws a 1080×1920 story image of a letter on a <canvas> and
// shares it (Web Share with files) or downloads it.
//
// The look follows the V2 stationery direction: the writer's colour is the
// envelope, the letter is a cream sheet pulled out of it (short letters peek
// out less, so the envelope grows and nothing looks empty), with a letterhead
// logo, a perforated postage stamp + postmark, a wax seal on the envelope and a
// slanted rubber stamp.
//
// Fonts come from next/font, whose family names are hashed — read them from the
// --font-molhim / --font-plex / --font-ruqaa CSS variables and load each weight
// before drawing. Molhim first with Plex after it: the canvas falls back per
// glyph, so Latin letters and «» — … come from Plex. Images (logo, seal, stamp
// icon) are same-origin only (a CDN image would taint the canvas and break
// toBlob); each one has a drawn fallback.

import { ICONS, cardStyle, sealFor, type CardStyle } from "@/lib/assets";
import { COPY, HASHTAG, SITE_URL } from "@/lib/config";
import { displayTo, fromName, stampFor } from "@/lib/format";
import {
  DOVE_PATH,
  HEART_PATH,
  ICON_ART,
  INK,
  cancelWaves,
  envelopeColors,
  hexRgb,
  mixHex,
  perforatedPath,
  seeded,
  waxBlobPath,
  type EnvelopeColors,
} from "@/lib/og/art";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";
import { isAbortError, letterPayload } from "./links";

const W = 1080;
const H = 1920;
const FILE_NAME = "thechefz-teacher-letter.png";
const LOGO_SRC = "/brand/thechefz-logo.webp";
const LOGO_RATIO = 497 / 120;

const T = {
  to: "إلى",
  toMemory: "إلى روح",
  cta: "اكتب رسالة لمعلمك",
  postmarkTop: "يوم المعلم",
  postmarkBottom: "٥ أكتوبر",
};

type Ctx = CanvasRenderingContext2D;
interface Fonts {
  sans: string;
  latin: string;
  hand: string;
}
interface Images {
  logo: HTMLImageElement | null;
  seal: HTMLImageElement | null;
  icon: HTMLImageElement | null;
}

// --- small utils -------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rad = (deg: number) => (deg * Math.PI) / 180;

function cssFamily(varName: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || "";
}

function fontsFromCss(): Fonts {
  const molhim = cssFamily("--font-molhim") || '"Molhim"';
  const plex = cssFamily("--font-plex") || '"IBM Plex Sans Arabic"';
  const ruqaa = cssFamily("--font-ruqaa") || '"Aref Ruqaa"';
  return {
    sans: `${molhim}, ${plex}, system-ui, sans-serif`,
    latin: `${plex}, system-ui, sans-serif`,
    hand: `${ruqaa}, ${molhim}, serif`,
  };
}

async function loadFonts(f: Fonts): Promise<void> {
  if (!document.fonts?.load) return;
  const sample = "أبجد هوز شكراً abc 123 «»";
  const specs = [`400 40px ${f.sans}`, `700 64px ${f.sans}`, `700 40px ${f.latin}`, `700 48px ${f.hand}`];
  await Promise.race([Promise.allSettled(specs.map((s) => document.fonts.load(s, sample))), sleep(2500)]);
}

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (v: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.decoding = "async";
    img.onload = () => finish(img.naturalWidth > 0 ? img : null);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

const EMOJI_RE = /\p{Extended_Pictographic}|[︎️‍]/gu;
const noEmoji = (s: string) => s.replace(EMOJI_RE, "").replace(/[ \t]+/g, " ").trim();

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws a 24-grid motif path centred on (cx, cy). */
function motif(ctx: Ctx, d: string, cx: number, cy: number, size: number, fill: string) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

/** Tiny tiled specks for a paper-grain feel (a repeating tile keeps the PNG small). */
function grainPattern(ctx: Ctx, color: string, alpha: number): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 180;
  tile.height = 180;
  const t = tile.getContext("2d");
  if (!t) return null;
  const rand = seeded(`grain${color}`);
  t.fillStyle = color;
  for (let i = 0; i < 260; i++) {
    t.globalAlpha = alpha * (0.3 + rand() * 0.7);
    const s = 1 + rand() * 2.2;
    t.fillRect(Math.floor(rand() * 180), Math.floor(rand() * 180), s, s);
  }
  t.globalAlpha = alpha * 0.8;
  t.strokeStyle = color;
  t.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const x = rand() * 180;
    const y = rand() * 180;
    const a = rand() * Math.PI;
    const l = 5 + rand() * 9;
    t.beginPath();
    t.moveTo(x, y);
    t.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    t.stroke();
  }
  return ctx.createPattern(tile, "repeat");
}

// --- text layout -------------------------------------------------------------

const ELLIPSIS = "…";

function ellipsize(ctx: Ctx, line: string, maxWidth: number): string {
  let s = line.trimEnd();
  while (s && ctx.measureText(s + ELLIPSIS).width > maxWidth) {
    const cut = s.lastIndexOf(" ");
    s = cut > 0 ? s.slice(0, cut).trimEnd() : Array.from(s).slice(0, -1).join("");
  }
  return s + ELLIPSIS;
}

/**
 * Word wrap with measureText (ctx.font must be set). Keeps the writer's line
 * breaks. `widthFor(i)` lets the first lines be narrower (beside the stamp).
 */
function wrap(ctx: Ctx, text: string, widthFor: (line: number) => number, keepBlankLines = true): string[] {
  const out: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n").map((p) => p.replace(/[ \t]+/g, " ").trim());
  for (const p of paragraphs) {
    if (!p) {
      if (keepBlankLines && out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let cur = "";
    for (const word of p.split(" ")) {
      const max = widthFor(out.length);
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= max) {
        cur = next;
        continue;
      }
      if (cur) out.push(cur);
      if (ctx.measureText(word).width <= widthFor(out.length)) {
        cur = word;
      } else {
        let piece = "";
        for (const ch of word) {
          if (piece && ctx.measureText(piece + ch).width > widthFor(out.length)) {
            out.push(piece);
            piece = "";
          }
          piece += ch;
        }
        cur = piece;
      }
    }
    if (cur) out.push(cur);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** Largest size in [min, max] at which `text` fits on one line (min if none). */
function fitSize(ctx: Ctx, text: string, font: (size: number) => string, maxWidth: number, max: number, min: number) {
  for (let size = max; size > min; size -= 2) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = font(min);
  return min;
}

// --- geometry ----------------------------------------------------------------

const SHEET_X = 92;
const SHEET_W = W - SHEET_X * 2;
const SHEET_TOP = 150;
const TX = SHEET_X + SHEET_W - 74; // text start (right edge)
const TL = SHEET_X + 70; // text end (left edge)
const TW = TX - TL;
const STAMP = { x: TL - 4, y: SHEET_TOP + 112, w: 150, h: 184 };
const PM_R = 58;
const PM_X = STAMP.x + STAMP.w + 10;
const POCKET_MIN = 1030;
const POCKET_MAX = 1340;

interface Layout {
  toLabel: string;
  nameLines: string[];
  nameSize: number;
  nameBase: number;
  school: string | null;
  schoolBase: number;
  bodyLines: string[];
  bodySize: number;
  lh: number;
  bodyBase: number;
  signature: string;
  sigSize: number;
  sigBase: number;
  date: string;
  /** Where the sheet disappears into the envelope. */
  pocket: number;
}

const dateFmt = () =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });

function layout(ctx: Ctx, m: PublicMessage, f: Fonts): Layout {
  const sans = (w: number) => (s: number) => `${w} ${s}px ${f.sans}`;
  const hand = (w: number) => (s: number) => `${w} ${s}px ${f.hand}`;
  const memory = Boolean(m.inMemory);

  // Address block: «إلى» small, the name big (two lines if it must), the school.
  const name = noEmoji(displayTo(m));
  const nameFirstW = TX - (PM_X + PM_R + 34);
  let nameSize = fitSize(ctx, name, sans(700), nameFirstW, 88, 60);
  let nameLines = [name];
  if (ctx.measureText(name).width > nameFirstW) {
    for (nameSize = 64; nameSize >= 48; nameSize -= 4) {
      ctx.font = sans(700)(nameSize);
      nameLines = wrap(ctx, name, (i) => (i === 0 ? nameFirstW : TW));
      if (nameLines.length <= 2) break;
    }
    if (nameLines.length > 2) nameLines = [nameLines[0], ellipsize(ctx, nameLines.slice(1).join(" "), TW)];
  }
  const labelBase = SHEET_TOP + 172;
  const nameBase = labelBase + 20 + nameSize * 0.98;
  const nameLast = nameBase + (nameLines.length - 1) * nameSize * 1.3;

  let school: string | null = m.school ? noEmoji(m.school) || null : null;
  const schoolBase = nameLast + 64;
  if (school) {
    ctx.font = sans(400)(38);
    const maxW = nameLines.length > 1 ? TW : nameFirstW;
    if (ctx.measureText(school).width > maxW) school = ellipsize(ctx, school, maxW);
  }
  const headEnd = Math.max(school ? schoolBase : nameLast, STAMP.y + STAMP.h + 10);

  // Body: as big as fits (short letters get up to 60px), then the signature
  // right under it; the sheet ends where the content ends.
  const bodyTop = headEnd + 44;
  const sigMax = POCKET_MAX - 150;
  const body = noEmoji(m.body);
  let bodySize = 34;
  let lh = 66;
  let bodyLines: string[] = [];
  const sigGap = (l: number) => Math.max(96, l * 1.15);
  for (let size = 60; size >= 34; size -= 2) {
    ctx.font = sans(400)(size);
    const lines = wrap(ctx, body, () => TW);
    const l = Math.round(size * 1.95);
    bodySize = size;
    lh = l;
    bodyLines = lines;
    if (bodyTop + size + (lines.length - 1) * l + sigGap(l) <= sigMax) break;
  }
  const bodyBase = bodyTop + bodySize;
  if (bodyBase + (bodyLines.length - 1) * lh + sigGap(lh) > sigMax) {
    // Still too long at the smallest size: drop blank lines, then cut with "…".
    ctx.font = sans(400)(bodySize);
    const max = Math.max(1, Math.floor((sigMax - sigGap(lh) - bodyBase) / lh) + 1);
    const compact = wrap(ctx, body, () => TW, false);
    bodyLines = compact.slice(0, max);
    if (compact.length > max) bodyLines[max - 1] = ellipsize(ctx, bodyLines[max - 1], TW);
  }
  const sigBase = bodyBase + (bodyLines.length - 1) * lh + sigGap(lh);
  const signature = `— ${noEmoji(fromName(m)) || COPY.anonymousFrom}`;
  const sigSize = fitSize(ctx, signature, hand(700), TW * 0.62, 60, 40);

  let date = "";
  const t = new Date(m.createdAt);
  if (Number.isFinite(t.getTime())) date = dateFmt().format(t);

  const pocket = Math.round(Math.min(POCKET_MAX, Math.max(POCKET_MIN, sigBase + 170)));
  return {
    toLabel: memory ? T.toMemory : T.to,
    nameLines,
    nameSize,
    nameBase,
    school,
    schoolBase,
    bodyLines,
    bodySize,
    lh,
    bodyBase,
    signature,
    sigSize,
    sigBase,
    date,
    pocket,
  };
}

// --- drawing: backdrop + envelope -------------------------------------------

function drawBackdrop(ctx: Ctx, env: EnvelopeColors) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixHex(env.base, "#ffffff", 0.16));
  g.addColorStop(0.55, env.base);
  g.addColorStop(1, mixHex(env.base, "#000000", 0.1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.08, 0, W * 0.5, H * 0.08, W * 0.9);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/** The open top flap, behind the sheet: only its slanted sides show. */
function drawOpenFlap(ctx: Ctx, env: EnvelopeColors, pocket: number) {
  const left = -40;
  const right = W + 40;
  const apexY = pocket - 700;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.moveTo(left, pocket);
  ctx.lineTo(W / 2, apexY);
  ctx.lineTo(right, pocket);
  ctx.closePath();
  ctx.fillStyle = env.dark;
  ctx.fill();
  ctx.restore();
  // The lining catches a little light along the fold.
  const g = ctx.createLinearGradient(0, apexY, 0, pocket);
  g.addColorStop(0, rgba(env.deep, 0.0));
  g.addColorStop(1, rgba(env.deep, 0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(left, pocket);
  ctx.lineTo(W / 2, apexY);
  ctx.lineTo(right, pocket);
  ctx.closePath();
  ctx.fill();
}

/** The envelope's back (pocket) in front of the sheet: side flaps + bottom flap. */
function drawPocket(ctx: Ctx, env: EnvelopeColors, pocket: number, grain: CanvasPattern | null) {
  const left = -40;
  const right = W + 40;
  const bottom = H + 60;
  const apexY = pocket + 150;
  const sideY = pocket + 330;

  // Shadow the sheet casts as it goes into the envelope.
  const inner = ctx.createLinearGradient(0, pocket - 70, 0, pocket);
  inner.addColorStop(0, "rgba(43,10,32,0)");
  inner.addColorStop(1, "rgba(43,10,32,0.2)");
  ctx.fillStyle = inner;
  ctx.fillRect(SHEET_X - 10, pocket - 70, SHEET_W + 20, 70);

  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.28)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = -6;
  ctx.fillStyle = env.base;
  ctx.fillRect(left, pocket, right - left, bottom - pocket);
  ctx.restore();

  // Side flaps (lighter), meeting under the bottom flap.
  ctx.fillStyle = env.light;
  ctx.beginPath();
  ctx.moveTo(left, pocket);
  ctx.lineTo(W / 2 - 40, sideY);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(right, pocket);
  ctx.lineTo(W / 2 + 40, sideY);
  ctx.lineTo(right, bottom);
  ctx.closePath();
  ctx.fill();

  // Bottom flap with a soft shadow on the side flaps.
  const flap = new Path2D(`M${left} ${bottom}L${W / 2} ${apexY}L${right} ${bottom}Z`);
  ctx.save();
  ctx.shadowColor = rgba(env.deep, 0.45);
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = -4;
  ctx.fillStyle = env.base;
  ctx.fill(flap);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, apexY, 0, bottom);
  shade.addColorStop(0, rgba("#ffffff", 0.06));
  shade.addColorStop(1, rgba(env.deep, 0.12));
  ctx.fillStyle = shade;
  ctx.fill(flap);

  // Seams + the pocket's top edge.
  ctx.strokeStyle = rgba(env.deep, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(W / 2, apexY);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.strokeStyle = rgba("#ffffff", 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, pocket + 1);
  ctx.lineTo(right, pocket + 1);
  ctx.stroke();

  if (grain) {
    ctx.fillStyle = grain;
    ctx.fillRect(left, pocket, right - left, bottom - pocket);
  }
}

function drawWaxSeal(ctx: Ctx, env: EnvelopeColors, img: HTMLImageElement | null, memory: boolean, cx: number, cy: number, r: number, seed: string) {
  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.4)";
  ctx.shadowBlur = r * 0.35;
  ctx.shadowOffsetY = r * 0.14;
  if (img) {
    const s = r * 2.3;
    ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
    return;
  }
  const blob = new Path2D(waxBlobPath(cx, cy, r, seeded(seed)));
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, env.waxLight);
  g.addColorStop(0.55, env.wax);
  g.addColorStop(1, env.waxDark);
  ctx.fillStyle = g;
  ctx.fill(blob);
  ctx.restore();

  ctx.save();
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, env.waxDark);
  ring.addColorStop(1, env.waxLight);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = env.wax;
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = ring;
  ctx.stroke();
  const d = memory ? DOVE_PATH : HEART_PATH;
  const m = r * (memory ? 1 : 0.9);
  const k = r * 0.045;
  motif(ctx, d, cx + k, cy + k, m, env.waxLight);
  motif(ctx, d, cx - k, cy - k, m, env.waxDark);
  motif(ctx, d, cx, cy, m, mixHex(env.wax, "#ffffff", 0.1));
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, cy - r * 0.5, r * 0.2, r * 0.1, rad(-35), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fill();
  ctx.restore();
}

// --- drawing: the sheet -------------------------------------------------------

function drawSheet(ctx: Ctx, pocket: number, grain: CanvasPattern | null) {
  const h = pocket - SHEET_TOP + 40; // runs on into the envelope
  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.3)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, SHEET_X, SHEET_TOP, SHEET_W, h, 8);
  ctx.fillStyle = INK.paper;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, SHEET_X, SHEET_TOP, SHEET_W, h, 8);
  ctx.clip();
  // Triangle-fold creases: two soft diagonals meeting at the top centre.
  const apexX = SHEET_X + SHEET_W / 2;
  const reach = SHEET_W / 2 + 60;
  ctx.fillStyle = "rgba(43,10,32,0.022)";
  ctx.beginPath();
  ctx.moveTo(SHEET_X, SHEET_TOP);
  ctx.lineTo(apexX, SHEET_TOP);
  ctx.lineTo(SHEET_X, SHEET_TOP + reach);
  ctx.closePath();
  ctx.fill();
  for (const x2 of [SHEET_X - 20, SHEET_X + SHEET_W + 20]) {
    ctx.strokeStyle = "rgba(43,10,32,0.075)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(apexX, SHEET_TOP);
    ctx.lineTo(x2, SHEET_TOP + reach);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(apexX + 2, SHEET_TOP + 1);
    ctx.lineTo(x2 + 2, SHEET_TOP + reach + 1);
    ctx.stroke();
  }
  if (grain) {
    ctx.fillStyle = grain;
    ctx.fillRect(SHEET_X, SHEET_TOP, SHEET_W, h);
  }
  ctx.restore();
}

function drawLetterhead(ctx: Ctx, f: Fonts, logo: HTMLImageElement | null) {
  const h = 50;
  const y = SHEET_TOP + 40;
  if (logo) {
    const w = h * LOGO_RATIO;
    ctx.drawImage(logo, TX - w, y, w, h);
    return;
  }
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = INK.plum;
  ctx.font = `700 46px ${f.sans}`;
  ctx.fillText(COPY.brand, TX, y + h - 8);
  ctx.restore();
}

/** Draws a line of text along a circle by slicing it into 1px columns (keeps Arabic shaping). */
function arcText(ctx: Ctx, s: string, font: string, color: string, cx: number, cy: number, r: number, top: boolean) {
  const off = document.createElement("canvas");
  const o = off.getContext("2d");
  if (!o) return;
  o.font = font;
  const w = Math.ceil(o.measureText(s).width) + 6;
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "24");
  const h = Math.ceil(size * 1.7);
  off.width = w;
  off.height = h;
  o.font = font;
  o.direction = "rtl";
  o.textAlign = "center";
  o.fillStyle = color;
  const base = h * 0.72;
  o.fillText(s, w / 2, base);
  const span = w / r;
  for (let x = 0; x < w; x++) {
    const t = (x + 0.5) / w - 0.5;
    const a = top ? -Math.PI / 2 + t * span : Math.PI / 2 - t * span;
    ctx.save();
    ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
    ctx.drawImage(off, x, 0, 1, h, -0.6, -base, 1.4, h);
    ctx.restore();
  }
}

function drawStampAndPostmark(ctx: Ctx, f: Fonts, style: CardStyle, icon: HTMLImageElement | null, memory: boolean) {
  const { x, y, w, h } = STAMP;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad(-3));
  ctx.translate(-cx, -cy);
  const edge = new Path2D(perforatedPath(x, y, w, h, w * 0.045, w / 9));
  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.22)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#fffefa";
  ctx.fill(edge);
  ctx.restore();

  const inset = w * 0.1;
  const iw = w - inset * 2;
  const ih = h - inset * 2 - h * 0.15;
  const tint = memory ? mixHex(style.bg, style.accent, 0.12) : mixHex(style.bg, style.gradient[0], 0.35);
  ctx.fillStyle = tint;
  ctx.fillRect(x + inset, y + inset, iw, ih);
  ctx.strokeStyle = rgba(style.accent, 0.35);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + inset + 4, y + inset + 4, iw - 8, ih - 8);
  const size = Math.min(iw, ih) * (icon ? 1 : 0.84);
  const ix = cx - size / 2;
  const iy = y + inset + (ih - size) / 2;
  if (icon) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + inset, y + inset, iw, ih);
    ctx.clip();
    ctx.drawImage(icon, ix - size * 0.06, iy - size * 0.06, size * 1.12, size * 1.12);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(ix, iy);
    ctx.scale(size / 64, size / 64);
    for (const part of ICON_ART[style.icon]) {
      const p = new Path2D(part.d);
      if (part.fill) {
        ctx.fillStyle = part.fill;
        ctx.fill(p);
      }
      if (part.stroke) {
        ctx.strokeStyle = part.stroke;
        ctx.lineWidth = part.sw ?? 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(p);
      }
    }
    ctx.restore();
  }
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = style.accent;
  ctx.font = `700 ${Math.round(h * 0.085)}px ${f.sans}`;
  ctx.fillText(COPY.brand, cx, y + h - inset * 0.95);
  ctx.restore();

  // Postmark: ink rings with the day on the rings, a heart, and the waves
  // running back across the stamp.
  const pcx = PM_X;
  const pcy = y + h * 0.64;
  const ink = INK.plum950;
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = ink;
  ctx.lineWidth = PM_R * 0.05;
  ctx.beginPath();
  ctx.arc(pcx, pcy, PM_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = PM_R * 0.035;
  ctx.beginPath();
  ctx.arc(pcx, pcy, PM_R * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  const pmFont = `700 ${Math.round(PM_R * 0.3)}px ${f.sans}`;
  arcText(ctx, T.postmarkTop, pmFont, ink, pcx, pcy, PM_R * 0.66, true);
  arcText(ctx, T.postmarkBottom, pmFont, ink, pcx, pcy, PM_R * 0.66, false);
  motif(ctx, HEART_PATH, pcx, pcy, PM_R * 0.42, ink);
  ctx.lineWidth = PM_R * 0.045;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(cancelWaves(pcx - PM_R * 1.08, pcy - PM_R * 0.36, x - 26 - (pcx - PM_R * 1.08), 4, PM_R * 0.24, PM_R * 0.07)));
  ctx.restore();
}

function drawText(ctx: Ctx, L: Layout, f: Fonts, style: CardStyle) {
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = INK.inkSoft;
  ctx.font = `400 38px ${f.sans}`;
  ctx.fillText(L.toLabel, TX, SHEET_TOP + 172);

  ctx.fillStyle = style.ink;
  ctx.font = `700 ${L.nameSize}px ${f.sans}`;
  L.nameLines.forEach((line, i) => ctx.fillText(line, TX, L.nameBase + i * L.nameSize * 1.3));

  if (L.school) {
    ctx.fillStyle = INK.inkSoft;
    ctx.font = `400 38px ${f.sans}`;
    ctx.fillText(L.school, TX, L.schoolBase);
  }

  // Faint ruled lines behind the body only, aligned to its baselines.
  ctx.strokeStyle = rgba(style.accent, 0.14);
  ctx.lineWidth = 2;
  L.bodyLines.forEach((_, i) => {
    const y = Math.round(L.bodyBase + i * L.lh + L.bodySize * 0.34) + 0.5;
    ctx.beginPath();
    ctx.moveTo(TL - 10, y);
    ctx.lineTo(TX + 10, y);
    ctx.stroke();
  });

  ctx.fillStyle = style.ink;
  ctx.font = `400 ${L.bodySize}px ${f.sans}`;
  L.bodyLines.forEach((line, i) => {
    if (line) ctx.fillText(line, TX, L.bodyBase + i * L.lh);
  });

  ctx.fillStyle = style.accent;
  ctx.font = `700 ${L.sigSize}px ${f.hand}`;
  const sigMax = TW * 0.62;
  const sig = ctx.measureText(L.signature).width > sigMax ? ellipsize(ctx, L.signature, sigMax) : L.signature;
  ctx.fillText(sig, TX, L.sigBase);
  const sigW = ctx.measureText(sig).width;
  if (L.date) {
    ctx.fillStyle = INK.inkMute;
    ctx.font = `400 30px ${f.sans}`;
    ctx.fillText(L.date, TX - sigW - 30, L.sigBase - 4);
  }
  ctx.restore();
}

/** Slanted rubber stamp with a double border; ink worn off in specks. */
function drawRubberStamp(ctx: Ctx, f: Fonts, label: string, color: string, cx: number, cy: number) {
  const size = 58;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return;
  measure.font = `700 ${size}px ${f.hand}`;
  const sw = Math.ceil(measure.measureText(label).width + size * 1.5);
  const sh = size * 2;
  const pad = 12;
  const off = document.createElement("canvas");
  off.width = sw + pad * 2;
  off.height = sh + pad * 2;
  const o = off.getContext("2d");
  if (!o) return;
  o.strokeStyle = color;
  o.fillStyle = color;
  o.lineWidth = size * 0.11;
  roundRect(o, pad, pad, sw, sh, size * 0.3);
  o.stroke();
  o.lineWidth = size * 0.045;
  roundRect(o, pad + size * 0.22, pad + size * 0.22, sw - size * 0.44, sh - size * 0.44, size * 0.16);
  o.stroke();
  o.font = `700 ${size}px ${f.hand}`;
  o.direction = "rtl";
  o.textAlign = "center";
  o.fillText(label, pad + sw / 2, pad + sh / 2 + size * 0.36);
  // Wear: knock specks out of the ink.
  const rand = seeded(label);
  o.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 170; i++) {
    o.globalAlpha = 0.35 + rand() * 0.65;
    o.beginPath();
    o.arc(rand() * off.width, rand() * off.height, 0.8 + rand() * 2.6, 0, Math.PI * 2);
    o.fill();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad(-9));
  ctx.globalAlpha = 0.88;
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(off, -off.width / 2, -off.height / 2);
  ctx.restore();
}

const FOOTER = { cta: 318, label: 44, labelH: 96, tag: 96 };
/** Hashtag baseline relative to the pocket line. */
const FOOTER_END = FOOTER.cta + FOOTER.label + FOOTER.labelH + FOOTER.tag;

/** How far to move the letter down (0 for long letters, up to 120px for short ones). */
function storyShift(pocket: number): number {
  return Math.max(0, Math.min(120, H - 110 - (pocket + FOOTER_END)));
}

function drawFooter(ctx: Ctx, f: Fonts, env: EnvelopeColors, pocket: number) {
  const ctaY = pocket + FOOTER.cta;
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = env.ink;
  ctx.font = `700 56px ${f.sans}`;
  ctx.fillText(T.cta, W / 2, ctaY);

  // The link on a cream address label, stuck on slightly crooked.
  let host = SITE_URL;
  try {
    host = new URL(SITE_URL).host;
  } catch {
    /* keep as is */
  }
  ctx.font = `700 42px ${f.latin}`;
  const lw = Math.min(W - 160, ctx.measureText(host).width + 96);
  const lh = FOOTER.labelH;
  const ly = ctaY + FOOTER.label;
  ctx.save();
  ctx.translate(W / 2, ly + lh / 2);
  ctx.rotate(rad(-1.5));
  ctx.shadowColor = "rgba(43,10,32,0.25)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = rgba(INK.plum, 0.16);
  ctx.lineWidth = 2;
  ctx.strokeRect(-lw / 2 + 8, -lh / 2 + 8, lw - 16, lh - 16);
  ctx.direction = "ltr";
  ctx.fillStyle = INK.plum;
  ctx.fillText(host, 0, 15);
  ctx.restore();

  // Plex: Molhim's "#" is a tiny dot.
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = env.ink;
  ctx.font = `700 40px ${f.latin}`;
  ctx.fillText(HASHTAG, W / 2, Math.min(H - 70, ly + lh + FOOTER.tag));
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** 1080×1920 PNG of the letter for Instagram / Snapchat stories. */
export async function renderStoryCard(m: PublicMessage): Promise<Blob> {
  const style = cardStyle(m);
  const env = envelopeColors(style);
  const memory = Boolean(m.inMemory);
  const fonts = fontsFromCss();
  const [, logo, seal, icon] = await Promise.all([
    loadFonts(fonts),
    loadImage(LOGO_SRC, 1500),
    loadImage(sealFor(m).local, 1500),
    loadImage(ICONS[style.icon].local, 1500),
  ]);
  const img: Images = { logo, seal, icon };

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const L = layout(ctx, m, fonts);
  const paperGrain = grainPattern(ctx, INK.plum, 0.05);
  const envGrain = grainPattern(ctx, INK.plum950, 0.08);

  drawBackdrop(ctx, env);
  if (envGrain) {
    ctx.fillStyle = envGrain;
    ctx.fillRect(0, 0, W, H);
  }
  // Stories cover the top ~250px (progress bar, profile) and the bottom (reply
  // bar): when a short letter leaves room at the bottom, move the whole letter
  // down so the letterhead and the stamp clear the profile row.
  ctx.save();
  ctx.translate(0, storyShift(L.pocket));
  drawOpenFlap(ctx, env, L.pocket);
  drawSheet(ctx, L.pocket, paperGrain);
  drawLetterhead(ctx, fonts, img.logo);
  drawStampAndPostmark(ctx, fonts, style, img.icon, memory);
  drawText(ctx, L, fonts, style);
  drawPocket(ctx, env, L.pocket, envGrain);
  // The rubber stamp lands across the sheet's bottom corner and the envelope edge.
  drawRubberStamp(ctx, fonts, noEmoji(stampFor(m)), memory ? style.accent : mixHex(style.accent, INK.plum950, 0.1), TL + 190, L.pocket - 40);
  drawWaxSeal(ctx, env, img.seal, memory, W / 2, L.pocket + 150, 86, m.id);
  drawFooter(ctx, fonts, env, L.pocket);
  ctx.restore();
  return canvasToBlob(canvas);
}

// Rendering takes a moment (fonts, images); callers can warm it up on hover/focus
// so the share sheet opens while the tap still counts as a user gesture.
const blobs = new Map<string, Promise<Blob>>();

function storyBlob(m: PublicMessage): Promise<Blob> {
  const key = `${m.id}:${m.variant}:${m.inMemory ? 1 : 0}`;
  let p = blobs.get(key);
  if (!p) {
    p = renderStoryCard(m);
    blobs.set(key, p);
    p.catch(() => blobs.delete(key));
    while (blobs.size > 4) blobs.delete(blobs.keys().next().value as string);
  }
  return p;
}

/** Starts rendering in the background (safe to call repeatedly). */
export function prepareStoryCard(m: PublicMessage): void {
  if (typeof document === "undefined") return;
  storyBlob(m).catch(() => {});
}

/** The (cached) story image, e.g. for a thumbnail in the share sheet. */
export function storyCardBlob(m: PublicMessage): Promise<Blob> {
  return storyBlob(m);
}

function download(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAME;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function shareOrDownloadStoryCard(m: PublicMessage): Promise<"shared" | "downloaded" | "failed"> {
  let blob: Blob;
  try {
    blob = await storyBlob(m);
  } catch {
    return "failed";
  }
  const p = letterPayload(m);
  if (typeof File === "function" && typeof navigator.share === "function") {
    const file = new File([blob], FILE_NAME, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: p.title, text: `${p.text} ${p.url}` });
        track("story_download", { id: m.id });
        return "shared";
      } catch (e) {
        // Closing the share sheet is a choice, not a failure: don't also download.
        if (isAbortError(e)) return "shared";
        // NotAllowedError (gesture expired) etc. → fall back to a download.
      }
    }
  }
  try {
    download(blob);
    track("story_download", { id: m.id });
    return "downloaded";
  } catch {
    return "failed";
  }
}
