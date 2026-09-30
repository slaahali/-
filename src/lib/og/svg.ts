// Pure SVG layouts for the 1200×630 link-preview images (/api/og*).
// Deliberately import-free: the route handlers rasterise it with resvg, and it
// can be exercised from a plain node script for visual checks.
//
// resvg quirks (verified with the bundled fonts):
//  - Arabic shapes fine, but the paragraph direction defaults to LTR, so numbers,
//    dashes, «», "…" and Latin runs land on the wrong side. Every Arabic line is
//    wrapped in RLE…PDF (U+202B/U+202C) and anchored with text-anchor end/middle.
//  - Changing font-family inside one Arabic <text> fails to lay out, so mixed
//    fonts are separate <text> elements.
//  - There is no emoji font: emoji must be stripped (they render as tofu).

export const OG_W = 1200;
export const OG_H = 630;
export const OG_SANS = "IBM Plex Sans Arabic";
export const OG_HAND = "Aref Ruqaa";

export interface OgPalette {
  accent: string;
  bg: string;
  ink: string;
  gradient: [string, string];
}

export interface OgLetterScene {
  kind: "letter";
  /** Small label above the addressee: "رسالة شكر" / "في ذكرى". */
  label: string;
  /** toLine(m): "إلى: أستاذة نورة" / "إلى روح أستاذة نورة". */
  to: string;
  school: string | null;
  body: string;
  /** "— اسم المرسل" */
  signature: string;
  stamp: string;
  memory: boolean;
  palette: OgPalette;
  brandLine: string;
  host: string;
}

export interface OgSearchScene {
  kind: "search";
  total: number;
  /** "12 رسالة شكر" — the number is highlighted. */
  countNumber: string;
  countLabel: string;
  /** "إلى «نورة»" — only rendered when total > 0. */
  toQuery: string;
  tagline: string;
  /** Invitation (total = 0). */
  emptyTitle: string;
  emptyLead: string;
  emptyCta: string;
  brandLine: string;
  host: string;
}

export interface OgDefaultScene {
  kind: "default";
  badge: string;
  titleLead: string;
  titleWord: string;
  lead: string;
  brandLine: string;
  host: string;
}

export type OgScene = OgLetterScene | OgSearchScene | OgDefaultScene;

const C = {
  plum: "#691d4e",
  plumDeep: "#3d0f2d",
  plum600: "#86285f",
  plum100: "#f4e6ee",
  magenta: "#a73784",
  orange: "#eb652c",
  orange100: "#fde6db",
  gold: "#f7a64f",
  canvas: "#fbf7f2",
  cream2: "#f4ece0",
  paper: "#fffdf9",
  inkSoft: "#6b5462",
  line: "#ecdfd5",
  lineStrong: "#dccbbd",
};

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

export type OgFont = "sans" | "sansBold" | "hand" | "handBold";

// Average advance per character in em, calibrated against the bundled TTFs
// (slightly generous so estimated lines never overflow).
const EM: Record<OgFont, { ar: number; lat: number; sp: number }> = {
  sans: { ar: 0.47, lat: 0.56, sp: 0.25 },
  sansBold: { ar: 0.5, lat: 0.6, sp: 0.26 },
  hand: { ar: 0.38, lat: 0.52, sp: 0.22 },
  handBold: { ar: 0.39, lat: 0.55, sp: 0.22 },
};

/** Estimated rendered width in px. */
export function textWidth(s: string, size: number, font: OgFont): number {
  const m = EM[font];
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed)) continue; // tashkeel
    if (c === 0x20) w += m.sp;
    else if ((c >= 0x0600 && c <= 0x06ff) || (c >= 0x0750 && c <= 0x077f) || (c >= 0xfb50 && c <= 0xfeff)) w += m.ar;
    else w += m.lat;
  }
  return w * size;
}

const ELLIPSIS = "…";

function ellipsize(line: string, maxWidth: number, size: number, font: OgFont): string {
  let s = line.trimEnd();
  while (s && textWidth(s + ELLIPSIS, size, font) > maxWidth) {
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
): { lines: string[]; truncated: boolean } {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const push = (l: string) => lines.push(l);
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, size, font) <= maxWidth) {
      cur = next;
      continue;
    }
    if (cur) push(cur);
    if (textWidth(word, size, font) <= maxWidth) {
      cur = word;
    } else {
      // One very long "word" (URL, repeated letters…): hard-break it.
      let piece = "";
      for (const ch of word) {
        if (textWidth(piece + ch, size, font) > maxWidth && piece) {
          push(piece);
          piece = "";
        }
        piece += ch;
      }
      cur = piece;
    }
  }
  if (cur) push(cur);
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], maxWidth, size, font);
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
  extra?: string;
}

function text(s: string, x: number, y: number, o: TextOpts): string {
  if (!s) return "";
  const family = o.font.startsWith("hand") ? OG_HAND : OG_SANS;
  const weight = o.font.endsWith("Bold") ? 700 : 400;
  const content = escapeXml(s);
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${family}" font-weight="${weight}" font-size="${n(o.size)}"` +
    ` fill="${o.fill}" text-anchor="${o.anchor ?? "end"}"` +
    (o.opacity != null ? ` fill-opacity="${o.opacity}"` : "") +
    (o.extra ? ` ${o.extra}` : "") +
    `>${o.rtl === false ? content : `‫${content}‬`}</text>`
  );
}

const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

function heart(cx: number, cy: number, size: number, fill: string, extra = ""): string {
  const s = size / 24;
  return `<path d="${HEART_PATH}" transform="translate(${n(cx - 12 * s)} ${n(cy - 12.2 * s)}) scale(${f3(s)})" fill="${fill}" ${extra}/>`;
}

function sparkle(cx: number, cy: number, r: number, fill: string, opacity = 1): string {
  const k = r * 0.18;
  return `<path d="M${n(cx)} ${n(cy - r)} C${n(cx + k)} ${n(cy - k)} ${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} C${n(cx + k)} ${n(cy + k)} ${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + r)} C${n(cx - k)} ${n(cy + k)} ${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} C${n(cx - k)} ${n(cy - k)} ${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - r)}Z" fill="${fill}" fill-opacity="${opacity}"/>`;
}

/**
 * Soft drop shadow for big rounded rects, built from stacked translucent rects.
 * Looks close to a blur and is ~10× cheaper for resvg than feDropShadow at this size.
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
  id(prefix: string) {
    return `${prefix}${++this.ids}`;
  }
  add(...parts: string[]) {
    this.body.push(...parts);
  }
  /** Soft round glow. */
  blob(cx: number, cy: number, r: number, color: string, opacity: number) {
    const id = this.id("g");
    this.defs.push(
      `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="0.55" stop-color="${color}" stop-opacity="${f3(opacity * 0.45)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    );
    this.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#${id})"/>`);
  }
  shadow(blur: number, dy: number, color: string, opacity: number): string {
    const id = this.id("s");
    this.defs.push(
      `<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`,
    );
    return `url(#${id})`;
  }
  linear(a: string, b: string, x2 = 1, y2 = 1): string {
    const id = this.id("l");
    this.defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }
  toString() {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">` +
      `<defs>${this.defs.join("")}</defs>${this.body.join("")}</svg>`
    );
  }
}

/** A folded paper letter seen from the back (flap + heart seal), centred on cx,cy. */
function envelope(
  svg: Svg,
  cx: number,
  cy: number,
  w: number,
  rot: number,
  o: { seal: string; opacity?: number; shadow?: boolean; tint?: string },
): string {
  const h = w * 0.64;
  const x = -w / 2;
  const y = -h / 2;
  const filter = o.shadow ? ` filter="${svg.shadow(w * 0.06, w * 0.05, C.plum, 0.16)}"` : "";
  return (
    `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${rot})" opacity="${o.opacity ?? 1}">` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(w * 0.05)}" fill="${o.tint ?? C.paper}" stroke="${C.lineStrong}" stroke-width="${n(Math.max(1, w * 0.008))}"${filter}/>` +
    `<path d="M${n(x + w * 0.02)} ${n(y + h * 0.03)} L0 ${n(h * 0.08)} L${n(-x - w * 0.02)} ${n(y + h * 0.03)}" fill="${C.cream2}" stroke="${C.lineStrong}" stroke-width="${n(Math.max(1, w * 0.008))}" stroke-linejoin="round"/>` +
    `<path d="M${n(x + w * 0.02)} ${n(-y - h * 0.03)} L${n(-w * 0.1)} ${n(h * 0.12)} M${n(-x - w * 0.02)} ${n(-y - h * 0.03)} L${n(w * 0.1)} ${n(h * 0.12)}" stroke="${C.line}" stroke-width="${n(Math.max(1, w * 0.008))}" fill="none"/>` +
    heart(0, h * 0.08, w * 0.17, o.seal) +
    `</g>`
  );
}

function footerHost(svg: Svg, host: string, x: number, y: number, anchor: "start" | "end" | "middle" = "start") {
  svg.add(text(host, x, y, { size: 21, font: "sansBold", fill: C.plum600, anchor, rtl: false, opacity: 0.85 }));
}

// ---------------------------------------------------------------------------
// Letter
// ---------------------------------------------------------------------------

function letterSvg(s: OgLetterScene): string {
  const svg = new Svg();
  const p = s.palette;
  const memory = s.memory;

  svg.add(`<rect width="${OG_W}" height="${OG_H}" fill="${C.canvas}"/>`);
  svg.blob(120, 60, 420, p.gradient[0], memory ? 0.3 : 0.4);
  svg.blob(1150, 640, 460, p.gradient[1], memory ? 0.18 : 0.26);
  if (!memory) svg.blob(1030, 10, 240, C.gold, 0.2);

  // Paper
  const PX = 262;
  const PY = 38;
  const PW = 884;
  const PH = 510;
  const PR = PX + PW;
  const paperClip = svg.id("c");
  svg.defs.push(`<clipPath id="${paperClip}"><rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="26"/></clipPath>`);
  svg.add(
    softShadow(PX, PY, PW, PH, 26, { color: C.plum, opacity: 0.2, spread: 34, dy: 16 }),
    `<rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" rx="26" fill="${C.paper}"/>`,
  );

  // Text column (right-aligned, after the margin rule).
  const TX = PR - 66;
  const TL = PX + 96;
  const TW = TX - TL;

  const pillFont: OgFont = "sansBold";
  const pillSize = 20;
  const pillH = 36;
  const pillW = textWidth(s.label, pillSize, pillFont) + 34;
  const to = fitLine(s.to, TW, 56, 34, "sansBold");
  const school = s.school ? fitLine(s.school, TW, 25, 25, "sans") : null;

  // Short letters get a bigger hand-written body and sit centred on the page;
  // long ones shrink to 33px and are cut after as many lines as fit.
  const availTop = PY + 34;
  const availH = PY + PH - 26 - availTop;
  const layout = (size: number, lineCount: number) => {
    const lh = Math.round(size * 1.66);
    const toBase = pillH + 14 + to.size * 0.92;
    const headEnd = school ? toBase + 42 : toBase;
    const firstBody = headEnd + lh * 0.95 + 8;
    const sig = firstBody + (Math.max(1, lineCount) - 1) * lh + Math.max(56, lh * 0.92);
    return { size, lh, toBase, schoolBase: toBase + 42, firstBody, sig, height: sig + 10 };
  };
  let lines: string[] = [];
  let L = layout(33, 1);
  for (const size of [44, 40, 36, 33]) {
    const wrapped = wrapText(s.body, TW, size, "hand", 99).lines;
    const l = layout(size, wrapped.length);
    lines = wrapped;
    L = l;
    if (l.height <= availH) break;
  }
  if (L.height > availH) {
    let max = lines.length;
    while (max > 1 && layout(33, max).height > availH) max--;
    lines = wrapText(s.body, TW, 33, "hand", max).lines;
    L = layout(33, lines.length);
  }
  const y0 = availTop + Math.max(0, (availH - L.height) * 0.42);

  // Ruled lines aligned to the body baselines + orange margin rule + accent band.
  const rules: string[] = [];
  const phase = y0 + L.firstBody + 13;
  for (let y = phase - Math.ceil((phase - PY) / L.lh) * L.lh; y < PY + PH - 8; y += L.lh) {
    if (y > PY + 22) rules.push(`M${PX} ${n(y)} H${PR}`);
  }
  svg.add(
    `<g clip-path="url(#${paperClip})">` +
      `<path d="${rules.join(" ")}" stroke="${C.plum}" stroke-opacity="0.07" stroke-width="1.5"/>` +
      `<path d="M${PR - 40} ${PY} V${PY + PH}" stroke="${C.orange}" stroke-opacity="0.28" stroke-width="2"/>` +
      `<rect x="${PX}" y="${PY}" width="${PW}" height="10" fill="${p.accent}"/>` +
      `</g>`,
  );

  // Label pill
  svg.add(
    `<rect x="${n(TX - pillW)}" y="${n(y0)}" width="${n(pillW)}" height="${pillH}" rx="18" fill="${p.bg}" stroke="${p.accent}" stroke-opacity="0.25"/>`,
    text(s.label, TX - 17, y0 + 25, { size: pillSize, font: pillFont, fill: p.accent }),
  );

  svg.add(text(to.text, TX, y0 + L.toBase, { size: to.size, font: "sansBold", fill: p.ink }));
  if (school) svg.add(text(school.text, TX, y0 + L.schoolBase, { size: school.size, font: "sans", fill: C.inkSoft }));
  lines.forEach((line, i) => {
    svg.add(text(line, TX, y0 + L.firstBody + i * L.lh, { size: L.size, font: "hand", fill: p.ink }));
  });
  const sig = fitLine(s.signature, TW - 250, Math.min(36, L.size), 24, "handBold");
  svg.add(text(sig.text, TX, y0 + L.sig, { size: sig.size, font: "handBold", fill: p.accent }));

  // Illustration card on the end (left) side, overlapping the paper edge.
  const IW = 250;
  const IH = 322;
  const IX = 60;
  const IY = 104;
  const icx = IX + IW / 2;
  const icy = IY + IH / 2;
  const grad = svg.linear(p.gradient[0], p.gradient[1], 0.6, 1);
  const glow = svg.id("g");
  svg.defs.push(
    `<radialGradient id="${glow}"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
  );
  const illo: string[] = [
    softShadow(IX, IY, IW, IH, 28, { color: memory ? "#2f2734" : C.plum, opacity: 0.3, spread: 30, dy: 16 }),
    `<rect x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="28" fill="${grad}"/>`,
    `<rect x="${IX + 10}" y="${IY + 10}" width="${IW - 20}" height="${IH - 20}" rx="20" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1.5"/>`,
    `<circle cx="${icx}" cy="${icy - 8}" r="118" fill="url(#${glow})"/>`,
    envelope(svg, icx, icy - 6, 158, 8, { seal: memory ? p.accent : C.orange, shadow: true }),
  ];
  if (!memory) {
    illo.push(
      sparkle(IX + 52, IY + 62, 15, "#fff", 0.9),
      sparkle(IX + IW - 46, IY + IH - 70, 11, "#fff", 0.8),
      sparkle(IX + IW - 64, IY + 58, 7, "#fff", 0.7),
    );
  } else {
    illo.push(heart(icx, IY + IH - 56, 24, "#fff", `fill-opacity="0.85"`));
  }
  svg.add(`<g transform="rotate(-6 ${icx} ${icy})">${illo.join("")}</g>`);

  // Rubber stamp across the illustration card and the paper edge.
  const stampText = s.stamp;
  const stampSize = 32;
  const sw = textWidth(stampText, stampSize, "handBold") + 52;
  const sh = 66;
  const scx = 262;
  const scy = 470;
  svg.add(
    `<g transform="rotate(-8 ${scx} ${scy})" opacity="0.9">` +
      `<rect x="${n(scx - sw / 2)}" y="${scy - sh / 2}" width="${n(sw)}" height="${sh}" rx="12" fill="${C.paper}" fill-opacity="0.55" stroke="${p.accent}" stroke-width="3.5"/>` +
      `<rect x="${n(scx - sw / 2 + 6)}" y="${scy - sh / 2 + 6}" width="${n(sw - 12)}" height="${sh - 12}" rx="8" fill="none" stroke="${p.accent}" stroke-width="1.5"/>` +
      text(stampText, scx, scy + stampSize * 0.36, { size: stampSize, font: "handBold", fill: p.accent, anchor: "middle" }) +
      `</g>`,
  );

  // Footer
  svg.add(heart(PR - 10, 593, 20, memory ? p.accent : C.orange));
  svg.add(text(s.brandLine, PR - 28, 600, { size: 22, font: "sansBold", fill: C.plum }));
  footerHost(svg, s.host, 60, 600);
  return svg.toString();
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** A wavy "handwriting" stroke running right-to-left from x1. */
function scribble(x1: number, y: number, len: number): string {
  let d = `M${n(x1)} ${n(y)}`;
  let x = x1;
  for (let i = 0; x > x1 - len; i++) {
    const nx = Math.max(x1 - len, x - 13);
    d += ` Q${n((x + nx) / 2)} ${n(y + (i % 2 ? 4 : -4))} ${n(nx)} ${n(y)}`;
    x = nx;
  }
  return d;
}

function paperSheet(
  svg: Svg,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
  band: string | null,
  lines: number[],
  lineColor: string,
): string {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const clip = svg.id("c");
  svg.defs.push(`<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="22"/></clipPath>`);
  const rules: string[] = [];
  for (let yy = y + 58; yy < y + h - 12; yy += 34) rules.push(`M${n(x)} ${n(yy)} H${n(x + w)}`);
  const strokes = lines.map((len, i) => scribble(x + w - 40, y + 64 + i * 34, len)).join(" ");
  return (
    `<g transform="rotate(${rot} ${n(cx)} ${n(cy)})">` +
    softShadow(x, y, w, h, 22, { color: C.plum, opacity: 0.2, spread: 26, dy: 12 }) +
    `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="22" fill="${C.paper}"/>` +
    `<g clip-path="url(#${clip})">` +
    `<path d="${rules.join(" ")}" stroke="${C.plum}" stroke-opacity="0.07" stroke-width="1.5"/>` +
    `<path d="M${n(x + w - 26)} ${n(y)} V${n(y + h)}" stroke="${C.orange}" stroke-opacity="0.28" stroke-width="2"/>` +
    (band ? `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="9" fill="${band}"/>` : "") +
    `</g>` +
    (strokes
      ? `<path d="${strokes}" stroke="${lineColor}" stroke-opacity="0.5" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
      : "") +
    `</g>`
  );
}

function pencil(cx: number, cy: number, len: number, rot: number): string {
  const w = len * 0.13;
  const body = len * 0.68;
  const x = -len / 2;
  return (
    `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${rot})">` +
    `<rect x="${n(x)}" y="${n(-w / 2)}" width="${n(len * 0.1)}" height="${n(w)}" rx="${n(w * 0.3)}" fill="${C.magenta}"/>` +
    `<rect x="${n(x + len * 0.09)}" y="${n(-w / 2)}" width="${n(len * 0.06)}" height="${n(w)}" fill="#d9bfa3"/>` +
    `<rect x="${n(x + len * 0.15)}" y="${n(-w / 2)}" width="${n(body)}" height="${n(w)}" fill="${C.orange}"/>` +
    `<rect x="${n(x + len * 0.15)}" y="${n(-w / 2)}" width="${n(body)}" height="${n(w * 0.33)}" fill="#f59a6b"/>` +
    `<path d="M${n(x + len * 0.83)} ${n(-w / 2)} L${n(len / 2)} 0 L${n(x + len * 0.83)} ${n(w / 2)}Z" fill="#f4dcc0"/>` +
    `<path d="M${n(len / 2 - len * 0.055)} ${n(-w * 0.17)} L${n(len / 2)} 0 L${n(len / 2 - len * 0.055)} ${n(w * 0.17)}Z" fill="${C.plumDeep}"/>` +
    `</g>`
  );
}

function searchSvg(s: OgSearchScene): string {
  const svg = new Svg();
  svg.add(`<rect width="${OG_W}" height="${OG_H}" fill="${C.canvas}"/>`);
  svg.blob(150, 120, 440, C.magenta, 0.22);
  svg.blob(1120, 620, 460, C.orange, 0.2);
  svg.blob(1060, 40, 260, C.gold, 0.2);

  const R = 1130;
  const colW = 610;

  if (s.total > 0) {
    // Fanned stack of letters.
    svg.add(
      paperSheet(svg, 262, 330, 246, 316, -14, C.magenta, [120, 150, 90, 136], C.magenta),
      paperSheet(svg, 292, 322, 246, 316, -3, C.orange, [150, 110, 160, 70], C.orange),
      paperSheet(svg, 322, 336, 246, 316, 8, C.plum, [140, 160, 100, 150, 120], C.plum),
    );
    svg.add(`<g transform="rotate(8 322 336)">${heart(322, 336 + 118, 44, C.orange, `filter="${svg.shadow(4, 3, C.orange, 0.35)}"`)}</g>`);
    svg.add(sparkle(128, 132, 16, C.gold), sparkle(448, 540, 12, C.orange, 0.8), sparkle(470, 126, 9, C.magenta, 0.7));

    // Brand pill
    const brandW = textWidth(s.brandLine, 20, "sansBold") + 36;
    svg.add(
      `<rect x="${n(R - brandW)}" y="112" width="${n(brandW)}" height="38" rx="19" fill="${C.orange100}"/>`,
      text(s.brandLine, R - 18, 138, { size: 20, font: "sansBold", fill: C.orange }),
    );

    // "12 رسالة شكر": a size-only tspan keeps the bidi run intact.
    const countY = 284;
    svg.add(
      `<text x="${R}" y="${countY}" font-family="${OG_SANS}" font-weight="700" font-size="64" fill="${C.plum}" text-anchor="end">` +
        `\u202B<tspan font-size="108" fill="${C.orange}">${escapeXml(s.countNumber)}</tspan> ${escapeXml(s.countLabel)}\u202C</text>`,
    );

    const q = fitLine(s.toQuery, colW, 54, 32, "sansBold");
    const qY = countY + 28 + q.size * 1.1;
    svg.add(text(q.text, R, qY, { size: q.size, font: "sansBold", fill: C.plumDeep }));
    svg.add(text(s.tagline, R, qY + 86, { size: 50, font: "handBold", fill: C.magenta }));

    footerHost(svg, s.host, R, 590, "end");
  } else {
    // Invitation: a blank sheet waiting for a letter + a pencil.
    svg.add(paperSheet(svg, 300, 322, 280, 356, -6, null, [], C.plum));
    svg.add(`<g transform="rotate(-6 300 322)">${heart(300 + 96, 322 - 130, 34, C.orange, `fill-opacity="0.9"`)}</g>`);
    svg.add(
      `<g filter="${svg.shadow(8, 10, C.plum, 0.25)}">${pencil(330, 386, 300, -38)}</g>`,
    );
    svg.add(sparkle(118, 150, 16, C.gold), sparkle(500, 520, 12, C.orange, 0.8), sparkle(486, 120, 9, C.magenta, 0.7));

    const brandW = textWidth(s.brandLine, 20, "sansBold") + 36;
    svg.add(
      `<rect x="${n(R - brandW)}" y="104" width="${n(brandW)}" height="38" rx="19" fill="${C.orange100}"/>`,
      text(s.brandLine, R - 18, 130, { size: 20, font: "sansBold", fill: C.orange }),
    );
    const title = fitLine(s.emptyTitle, colW, 62, 40, "sansBold");
    svg.add(text(title.text, R, 238, { size: title.size, font: "sansBold", fill: C.plum }));
    const lead = fitLine(s.emptyLead, colW, 54, 36, "handBold");
    svg.add(text(lead.text, R, 322, { size: lead.size, font: "handBold", fill: C.orange }));

    const ctaSize = 28;
    const ctaW = textWidth(s.emptyCta, ctaSize, "sansBold") + 72;
    svg.add(
      softShadow(R - ctaW, 386, ctaW, 68, 34, { color: C.orange, opacity: 0.4, spread: 20, dy: 10 }),
      `<rect x="${n(R - ctaW)}" y="386" width="${n(ctaW)}" height="68" rx="34" fill="${C.orange}"/>`,
      text(s.emptyCta, R - 36, 430, { size: ctaSize, font: "sansBold", fill: "#fff" }),
    );
    footerHost(svg, s.host, R, 560, "end");
  }
  return svg.toString();
}

// ---------------------------------------------------------------------------
// Default (campaign)
// ---------------------------------------------------------------------------

function defaultSvg(s: OgDefaultScene): string {
  const svg = new Svg();
  svg.add(`<rect width="${OG_W}" height="${OG_H}" fill="${C.canvas}"/>`);
  svg.blob(600, 330, 520, "#ffffff", 0.9);
  svg.blob(110, 90, 380, C.magenta, 0.2);
  svg.blob(1110, 560, 420, C.orange, 0.22);
  svg.blob(1080, 60, 260, C.gold, 0.22);
  svg.blob(130, 600, 300, C.orange, 0.12);

  // Floating letters around the edges (small + faint = far away).
  const letters: [number, number, number, number, string, number][] = [
    [120, 160, 150, -14, C.orange, 1],
    [248, 470, 118, 10, C.magenta, 1],
    [70, 420, 70, 18, C.plum, 0.55],
    [330, 90, 64, 8, C.orange, 0.5],
    [1070, 150, 138, 12, C.plum, 1],
    [945, 470, 112, -10, C.orange, 1],
    [1140, 380, 74, -18, C.magenta, 0.6],
    [860, 70, 58, -6, C.magenta, 0.45],
    [1150, 560, 60, 14, C.orange, 0.45],
    [60, 560, 56, -8, C.magenta, 0.45],
  ];
  for (const [x, y, w, r, seal, o] of letters) {
    svg.add(envelope(svg, x, y, w, r, { seal, opacity: o, shadow: o === 1 }));
  }
  svg.add(
    sparkle(410, 180, 12, C.gold),
    sparkle(800, 200, 9, C.orange, 0.8),
    sparkle(780, 520, 13, C.magenta, 0.6),
    sparkle(420, 520, 8, C.orange, 0.7),
  );

  const cx = 600;
  const badgeSize = 21;
  const badgeW = textWidth(s.badge, badgeSize, "sansBold") + 44;
  svg.add(
    `<rect x="${n(cx - badgeW / 2)}" y="100" width="${n(badgeW)}" height="42" rx="21" fill="${C.orange100}" stroke="${C.orange}" stroke-opacity="0.25"/>`,
    text(s.badge, cx, 128, { size: badgeSize, font: "sansBold", fill: C.orange, anchor: "middle" }),
  );
  // Two-line lockup: the Ruqaa word's shadda rises ~1.15em above its baseline.
  svg.add(text(s.titleLead, cx, 232, { size: 70, font: "sansBold", fill: C.plum, anchor: "middle" }));
  svg.add(text(s.titleWord, cx, 404, { size: 128, font: "handBold", fill: C.orange, anchor: "middle" }));
  const lead = fitLine(s.lead, 660, 30, 22, "sans");
  svg.add(text(lead.text, cx, 476, { size: lead.size, font: "sans", fill: C.inkSoft, anchor: "middle" }));

  const hostW = textWidth(s.host, 21, "sansBold") + 48;
  svg.add(
    `<rect x="${n(cx - hostW / 2)}" y="508" width="${n(hostW)}" height="46" rx="23" fill="#fff" stroke="${C.line}" stroke-width="1.5"/>`,
  );
  footerHost(svg, s.host, cx, 538, "middle");
  svg.add(text(s.brandLine, cx, 600, { size: 20, font: "sansBold", fill: C.plum, anchor: "middle", opacity: 0.8 }));
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
