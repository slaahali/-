// Server-only: turns a letter / search / the campaign into a 1200×630 PNG for
// link previews. Layout lives in ./svg (pure); this file maps domain data to a
// scene and rasterises it with resvg (proper Arabic shaping + bidi).
//
// Only public fields are read from the message — never `contact` or anything
// else a full record might carry.

import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { cardStyle } from "@/lib/assets";
import { COPY, SITE_URL } from "@/lib/config";
import { formatCount, fromName, stampFor, toLine } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";
import { buildOgSvg, OG_SANS, OG_W, stripEmoji, type OgScene } from "./svg";

export type OgInput =
  | { kind: "default" }
  | { kind: "letter"; m: PublicMessage }
  | { kind: "search"; q: string; total: number };

const FONT_FILES = [
  "IBMPlexSansArabic-Regular.ttf",
  "IBMPlexSansArabic-Bold.ttf",
  "ArefRuqaa-Regular.ttf",
  "ArefRuqaa-Bold.ttf",
].map((f) => path.join(process.cwd(), "assets/fonts", f));

const OG_COPY = {
  brandLine: `${COPY.brand} · يوم المعلم`,
  letterLabel: "رسالة شكر",
  memoryLabel: "في ذكرى",
  countLabel: "رسالة شكر",
  tagline: "اكتشف وش كتبوا 💜",
  defaultLead: "اكتب رسالة شكر لمعلمك اللي أثّر فيك",
};

function siteHost(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return SITE_URL.replace(/^https?:\/\//, "");
  }
}

/** Maps domain data to plain scene data (all text emoji-free). */
export function sceneFor(input: OgInput): OgScene {
  const host = siteHost();
  const brandLine = OG_COPY.brandLine;

  if (input.kind === "letter") {
    const m = input.m;
    const style = cardStyle(m);
    const memory = Boolean(m.inMemory);
    const name = stripEmoji(fromName({ fromName: m.fromName })) || COPY.anonymousFrom;
    return {
      kind: "letter",
      label: memory ? OG_COPY.memoryLabel : OG_COPY.letterLabel,
      to: stripEmoji(toLine({ title: m.title, toName: m.toName, inMemory: memory })),
      school: (m.school && stripEmoji(m.school)) || null,
      body: stripEmoji(m.body),
      signature: `— ${name}`,
      stamp: stripEmoji(stampFor({ inMemory: memory })),
      memory,
      palette: { accent: style.accent, bg: style.bg, ink: style.ink, gradient: style.gradient },
      brandLine,
      host,
    };
  }

  if (input.kind === "search") {
    const q = stripEmoji(input.q);
    const total = Math.max(0, Math.trunc(input.total) || 0);
    return {
      kind: "search",
      total,
      countNumber: formatCount(total),
      countLabel: OG_COPY.countLabel,
      toQuery: q ? `إلى «${q}»` : "",
      tagline: stripEmoji(OG_COPY.tagline),
      emptyTitle: stripEmoji(COPY.emptySearchTitle),
      emptyLead: stripEmoji(COPY.emptySearch),
      emptyCta: stripEmoji(COPY.heroCtaWrite),
      brandLine,
      host,
    };
  }

  // "كلنا كان لنا معلّم": the last word is set big in Ruqaa.
  const title = stripEmoji(COPY.heroTitle);
  const cut = title.lastIndexOf(" ");
  return {
    kind: "default",
    badge: stripEmoji(COPY.badge.replace(/\s*✨\s*/g, " · ")),
    titleLead: cut > 0 ? title.slice(0, cut) : "",
    titleWord: cut > 0 ? title.slice(cut + 1) : title,
    lead: OG_COPY.defaultLead,
    brandLine: stripEmoji(COPY.footerCampaign),
    host,
  };
}

function rasterize(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_W },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: OG_SANS },
    logLevel: "off",
  });
  return resvg.render().asPng();
}

// --- tiny in-memory LRU (per server instance; the CDN does the heavy lifting)

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 150;
const cache = new Map<string, { at: number; png: Promise<Buffer> }>();

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function cacheKey(input: OgInput): string {
  if (input.kind === "letter") {
    const m = input.m;
    return `l:${m.id}:${fnv1a([m.title, m.toName, m.school, m.body, m.fromName, m.variant, m.inMemory].join("\u0001"))}`;
  }
  // The invitation never shows q, so every no-result search shares one entry.
  if (input.kind === "search") return input.total >= 1 ? `s:${Math.trunc(input.total)}:${input.q}` : "s:0";
  return "d";
}

export function renderOgPng(input: OgInput): Promise<Buffer> {
  const key = cacheKey(input);
  const now = Date.now();
  const hit = cache.get(key);
  cache.delete(key);
  if (hit && now - hit.at < TTL_MS) {
    cache.set(key, hit); // refresh recency
    return hit.png;
  }

  const png = Promise.resolve().then(() => rasterize(buildOgSvg(sceneFor(input))));
  cache.set(key, { at: now, png });
  png.catch(() => {
    if (cache.get(key)?.png === png) cache.delete(key);
  });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return png;
}

// Short CDN life: a letter that gets hidden (removal request / moderator) should
// stop unfurling within minutes, not hours.
export const OG_CACHE_CONTROL = "public, max-age=300, s-maxage=600, stale-while-revalidate=300";

/** PNG response with the shared cache headers. */
export function ogResponse(png: Buffer): Response {
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      "Cache-Control": OG_CACHE_CONTROL,
    },
  });
}

/** Last resort when rendering itself fails (e.g. fonts missing from the deployment). */
export function ogError(e: unknown): Response {
  console.error("[og] render failed", e);
  return new Response("OG image unavailable", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
