// Browser only: draws a 1080×1920 story image of a letter on a <canvas> and
// shares it (Web Share with files) or downloads it.
//
// Fonts come from next/font, whose family names are hashed — read them from the
// --font-plex / --font-ruqaa CSS variables and load each weight before drawing.
// The 3D icon is drawn from the same-origin copy only (a CDN image would taint
// the canvas and break toBlob).

import { ICONS, cardStyle, type CardStyle } from "@/lib/assets";
import { COPY, HASHTAG, SITE_URL } from "@/lib/config";
import { fromName, stampFor, toLine } from "@/lib/format";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";
import { isAbortError, letterPayload } from "./links";

const W = 1080;
const H = 1920;
const FILE_NAME = "thechefz-teacher-letter.png";

const INK = {
  plumDeep: "#2b0a20",
  paper: "#fffdf9",
  inkSoft: "#6b5462",
  orange: "#eb652c",
  plum: "#691d4e",
};

type Ctx = CanvasRenderingContext2D;
interface Fonts {
  plex: string;
  ruqaa: string;
}

// --- small utils -------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function cssFamily(varName: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

async function loadFonts(f: Fonts): Promise<void> {
  if (!document.fonts?.load) return;
  const sample = "أبجد هوز شكراً abc 123";
  const specs = [`400 36px ${f.plex}`, `700 64px ${f.plex}`, `400 48px ${f.ruqaa}`, `700 48px ${f.ruqaa}`];
  await Promise.race([Promise.allSettled(specs.map((s) => document.fonts.load(s, sample))), sleep(2000)]);
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

function seeded(seedText: string) {
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

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function mix(a: string, b: string, t: number): [number, number, number] {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * t)) as [number, number, number];
}

/** White on the background where it reads well, deep plum where the gradient is too light. */
function inkOn(style: CardStyle, t: number): string {
  const L = luminance(mix(style.gradient[0], style.gradient[1], t));
  return 1.05 / (L + 0.05) >= 2.5 ? "#ffffff" : INK.plumDeep;
}

const EMOJI_RE = /\p{Extended_Pictographic}|[︎️‍]/gu;
const noEmoji = (s: string) => s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();

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

function heart(ctx: Ctx, cx: number, cy: number, size: number, fill: string) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.fill(
    new Path2D(
      "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    ),
  );
  ctx.restore();
}

function sparkle(ctx: Ctx, cx: number, cy: number, r: number, fill: string) {
  const k = r * 0.18;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(cx + k, cy - k, cx + k, cy - k, cx + r, cy);
  ctx.bezierCurveTo(cx + k, cy + k, cx + k, cy + k, cx, cy + r);
  ctx.bezierCurveTo(cx - k, cy + k, cx - k, cy + k, cx - r, cy);
  ctx.bezierCurveTo(cx - k, cy - k, cx - k, cy - k, cx, cy - r);
  ctx.fillStyle = fill;
  ctx.fill();
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

/** Word wrap with measureText (ctx.font must be set). Keeps the writer's line breaks. */
function wrap(ctx: Ctx, text: string, maxWidth: number, keepBlankLines = true): string[] {
  const out: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n").map((p) => p.replace(/[ \t]+/g, " ").trim());
  for (const p of paragraphs) {
    if (!p) {
      if (keepBlankLines && out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    let cur = "";
    for (const word of p.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        cur = next;
        continue;
      }
      if (cur) out.push(cur);
      if (ctx.measureText(word).width <= maxWidth) {
        cur = word;
      } else {
        let piece = "";
        for (const ch of word) {
          if (piece && ctx.measureText(piece + ch).width > maxWidth) {
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

// --- drawing -----------------------------------------------------------------

function drawBackground(ctx: Ctx, style: CardStyle, memory: boolean, rand: () => number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, style.gradient[0]);
  g.addColorStop(1, style.gradient[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    const [cr, cg, cb] = hexRgb(color);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
    rg.addColorStop(0.6, `rgba(${cr},${cg},${cb},${alpha * 0.4})`);
    rg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(W * 0.86, H * 0.08, 620, "#ffffff", memory ? 0.22 : 0.3);
  blob(W * 0.05, H * 0.5, 680, "#ffffff", 0.16);
  blob(W * 0.9, H * 0.9, 640, memory ? "#ffffff" : "#f7a64f", memory ? 0.12 : 0.26);
  blob(W * 0.15, H * 0.97, 520, "#ffffff", 0.12);

  // Faint folded letters drifting in the background.
  const count = memory ? 7 : 16;
  ctx.save();
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = 60 + rand() * (H - 120);
    const w = 60 + rand() * 90;
    const h = w * 0.64;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rand() - 0.5) * 1.2);
    ctx.globalAlpha = (memory ? 0.08 : 0.1) + rand() * (memory ? 0.06 : 0.12);
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 3;
    if (i % 3 === 2) {
      // a lone folded corner (triangle)
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      ctx.lineTo(0, h / 3);
      ctx.closePath();
      ctx.fill();
    } else {
      roundRect(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, -h / 2 + 3);
      ctx.lineTo(0, h * 0.1);
      ctx.lineTo(w / 2 - 3, -h / 2 + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();

  if (!memory) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      sparkle(ctx, 40 + rand() * (W - 80), 40 + rand() * (H - 80), 8 + rand() * 14, "#ffffff");
    }
    ctx.restore();
  }
}

function drawHeader(ctx: Ctx, f: Fonts, style: CardStyle, memory: boolean, y0: number) {
  const ink = inkOn(style, 0.15);
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = `700 76px ${f.plex}`;
  ctx.fillText(COPY.brand, W / 2, y0 + 68);

  const sub = memory ? "في ذكرى 🤍" : "يوم المعلم 💜";
  ctx.font = `700 38px ${f.plex}`;
  const sw = ctx.measureText(sub).width + 64;
  roundRect(ctx, W / 2 - sw / 2, y0 + 96, sw, 64, 32);
  ctx.fillStyle = ink === "#ffffff" ? "rgba(255,255,255,0.2)" : "rgba(43,10,32,0.08)";
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.fillText(sub, W / 2, y0 + 141);
  ctx.restore();
}

interface CardLayout {
  h: number;
  toLines: string[];
  toSize: number;
  school: string | null;
  bodyLines: string[];
  bodySize: number;
  lh: number;
  toBase: number;
  schoolBase: number;
  divider: number;
  bodyBase: number;
  sigBase: number;
  signature: string;
  sigSize: number;
}

const HEADER_H = 230; // brand + pill, then the gap above the card
const FOOTER_H = 310; // CTA + host pill + hashtag below the card
const CARD_W = 900;
const CARD_MIN_H = 820;
const CARD_MAX_H = 1140;
const TX = CARD_W - 104; // text right edge (after the margin rule)
const TL = 92;
const TW = TX - TL;
const TO_W = TX - 210; // leave room for the icon sticker at the top-left

function layoutCard(ctx: Ctx, m: PublicMessage, f: Fonts): CardLayout {
  const plex = (w: number) => (s: number) => `${w} ${s}px ${f.plex}`;
  const ruqaa = (w: number) => (s: number) => `${w} ${s}px ${f.ruqaa}`;

  const to = toLine(m);
  let toSize = fitSize(ctx, to, plex(700), TO_W, 68, 50);
  let toLines = [to];
  if (ctx.measureText(to).width > TO_W) {
    toSize = 50;
    ctx.font = plex(700)(toSize);
    toLines = wrap(ctx, to, TO_W);
    if (toLines.length > 2) toLines = [toLines[0], ellipsize(ctx, toLines.slice(1).join(" "), TO_W)];
  }
  const toBase = 150;
  const toLast = toBase + (toLines.length - 1) * toSize * 1.25;

  let school: string | null = m.school?.trim() || null;
  if (school) {
    ctx.font = plex(400)(36);
    if (ctx.measureText(school).width > TW) school = ellipsize(ctx, school, TW);
  }
  const schoolBase = toLast + 62;
  const divider = (school ? schoolBase : toLast) + 48;
  const bodyTop = divider + 34;

  const signature = `— ${fromName(m)}`;
  // Signature baseline must stay above the stamp zone at the bottom-left.
  const sigLimit = CARD_MAX_H - 200;

  let bodySize = 34;
  let lh = Math.round(bodySize * 1.72);
  let bodyLines: string[] = [];
  for (let size = 54; size >= 34; size -= 2) {
    ctx.font = ruqaa(400)(size);
    const lines = wrap(ctx, m.body, TW);
    const l = Math.round(size * 1.72);
    const firstBase = bodyTop + size * 1.15;
    const sig = firstBase + (lines.length - 1) * l + Math.max(78, l * 1.15);
    bodySize = size;
    lh = l;
    bodyLines = lines;
    if (sig <= sigLimit) break;
  }
  const bodyBase = bodyTop + bodySize * 1.15;
  const sigGap = Math.max(78, lh * 1.15);
  if (bodyBase + (bodyLines.length - 1) * lh + sigGap > sigLimit) {
    // Still too long at the smallest size: drop blank lines, then cut with "…".
    ctx.font = ruqaa(400)(bodySize);
    const max = Math.max(1, Math.floor((sigLimit - sigGap - bodyBase) / lh) + 1);
    const compact = wrap(ctx, m.body, TW, false);
    bodyLines = compact.slice(0, max);
    if (compact.length > max) bodyLines[max - 1] = ellipsize(ctx, bodyLines[max - 1], TW);
  }
  const sigBase = bodyBase + (bodyLines.length - 1) * lh + sigGap;
  const sigSize = fitSize(ctx, signature, ruqaa(700), 540, Math.min(54, bodySize + 6), 34);
  const h = Math.max(CARD_MIN_H, Math.min(CARD_MAX_H, sigBase + 250));

  return { h, toLines, toSize, school, bodyLines, bodySize, lh, toBase, schoolBase, divider, bodyBase, sigBase, signature, sigSize };
}

function drawCard(
  ctx: Ctx,
  L: CardLayout,
  m: PublicMessage,
  f: Fonts,
  style: CardStyle,
  icon: HTMLImageElement | null,
  top: number,
) {
  ctx.save();
  ctx.translate(W / 2, top + L.h / 2);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.translate(-CARD_W / 2, -L.h / 2);

  // Paper + shadow
  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.32)";
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 34;
  roundRect(ctx, 0, 0, CARD_W, L.h, 40);
  ctx.fillStyle = INK.paper;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, 0, 0, CARD_W, L.h, 40);
  ctx.clip();
  // Ruled lines aligned with the body baselines.
  ctx.strokeStyle = "rgba(105,29,78,0.08)";
  ctx.lineWidth = 2;
  const phase = L.bodyBase + 13;
  for (let y = phase - Math.floor((phase - 40) / L.lh) * L.lh; y < L.h - 10; y += L.lh) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_W, y);
    ctx.stroke();
  }
  // Orange margin rule on the right (reading-start) side + accent band.
  ctx.strokeStyle = "rgba(235,101,44,0.32)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CARD_W - 70, 0);
  ctx.lineTo(CARD_W - 70, L.h);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, 0, CARD_W, 16);
  ctx.restore();

  // Text
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = style.ink;
  ctx.font = `700 ${L.toSize}px ${f.plex}`;
  L.toLines.forEach((line, i) => ctx.fillText(line, TX, L.toBase + i * L.toSize * 1.25));

  if (L.school) {
    ctx.fillStyle = INK.inkSoft;
    ctx.font = `400 36px ${f.plex}`;
    ctx.fillText(L.school, TX, L.schoolBase);
  }

  // Divider: short accent rule + heart, right-aligned.
  ctx.strokeStyle = style.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(TX, L.divider);
  ctx.lineTo(TX - 120, L.divider);
  ctx.stroke();
  ctx.globalAlpha = 1;
  heart(ctx, TX - 146, L.divider, 26, style.accent);

  ctx.fillStyle = style.ink;
  ctx.font = `400 ${L.bodySize}px ${f.ruqaa}`;
  L.bodyLines.forEach((line, i) => {
    if (line) ctx.fillText(line, TX, L.bodyBase + i * L.lh);
  });

  ctx.fillStyle = style.accent;
  ctx.font = `700 ${L.sigSize}px ${f.ruqaa}`;
  const sig = ctx.measureText(L.signature).width > 540 ? ellipsize(ctx, L.signature, 540) : L.signature;
  ctx.fillText(sig, TX, L.sigBase);

  // Rubber stamp, bottom-left, −8°.
  const stamp = noEmoji(stampFor(m));
  ctx.save();
  ctx.translate(250, L.h - 120);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.font = `700 52px ${f.ruqaa}`;
  ctx.textAlign = "center";
  const sw = ctx.measureText(stamp).width + 84;
  const sh = 104;
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 6;
  roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 18);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  roundRect(ctx, -sw / 2 + 11, -sh / 2 + 11, sw - 22, sh - 22, 11);
  ctx.stroke();
  ctx.fillStyle = style.accent;
  ctx.fillText(stamp, 0, 18);
  ctx.restore();

  // 3D icon sticker on the top-left corner.
  if (icon) {
    ctx.save();
    ctx.translate(70, 10);
    ctx.rotate((10 * Math.PI) / 180);
    ctx.shadowColor = "rgba(43,10,32,0.28)";
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 16;
    const size = 230;
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  ctx.restore();
}

function drawFooter(ctx: Ctx, f: Fonts, style: CardStyle, y0: number) {
  const ink = inkOn(style, 0.85);
  ctx.save();
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillStyle = ink;
  ctx.font = `700 50px ${f.plex}`;
  ctx.fillText("اكتب رسالة لمعلمك 👇", W / 2, y0 + 110);

  let host = SITE_URL;
  try {
    host = new URL(SITE_URL).host;
  } catch {
    /* keep as is */
  }
  ctx.direction = "ltr";
  ctx.font = `700 42px ${f.plex}`;
  const hw = ctx.measureText(host).width + 88;
  ctx.save();
  ctx.shadowColor = "rgba(43,10,32,0.22)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, W / 2 - hw / 2, y0 + 144, hw, 88, 44);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = INK.plum;
  ctx.fillText(host, W / 2, y0 + 203);

  ctx.direction = "rtl";
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.92;
  ctx.font = `700 38px ${f.plex}`;
  ctx.fillText(HASHTAG, W / 2, y0 + 298);
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
  const memory = Boolean(m.inMemory);
  const fonts: Fonts = {
    plex: cssFamily("--font-plex", '"IBM Plex Sans Arabic", system-ui, sans-serif'),
    ruqaa: cssFamily("--font-ruqaa", '"Aref Ruqaa", serif'),
  };
  const [, icon] = await Promise.all([loadFonts(fonts), loadImage(ICONS[style.icon].local, 1500)]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  drawBackground(ctx, style, memory, seeded(m.id));
  // Header, card and footer are centred as one group (short letters → shorter card).
  const card = layoutCard(ctx, m, fonts);
  const y0 = Math.max(90, (H - (card.h + HEADER_H + FOOTER_H)) / 2);
  drawHeader(ctx, fonts, style, memory, y0);
  drawCard(ctx, card, m, fonts, style, icon, y0 + HEADER_H);
  drawFooter(ctx, fonts, style, y0 + HEADER_H + card.h);
  return canvasToBlob(canvas);
}

// Rendering takes a moment (fonts, icon); callers can warm it up on hover/focus
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
