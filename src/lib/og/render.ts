// Server-only: turns a letter / search / the campaign into a 1200×630 PNG for
// link previews. Layout lives in ./svg (pure); this file maps domain data to a
// scene and rasterises it with resvg (proper Arabic shaping + bidi).
//
// Only public fields are read from the message — never `contact` or anything
// else a full record might carry.
//
// Rendering runs off the event loop (resvg's renderAsync uses the libuv pool),
// so a cache-miss render doesn't stall other requests on the instance. The
// native binding only accepts font *paths* (options are JSON-serialised; there
// is no fontBuffers outside the wasm build) — fontdb reads them per render,
// which costs ~0.1 ms; the paths and the logo data URI are resolved once.

import fs from "node:fs";
import path from "node:path";
import { renderAsync } from "@resvg/resvg-js";
import { cardStyle } from "@/lib/assets";
import { COPY, SITE_URL } from "@/lib/config";
import { displayTo, formatCount, fromName, stampFor } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";
import { buildOgSvg, OG_SANS, OG_W, stripEmoji, type OgBrand, type OgScene } from "./svg";

export type OgInput =
  | { kind: "default" }
  | { kind: "letter"; m: PublicMessage }
  | { kind: "search"; q: string; total: number };

const ASSETS = path.join(process.cwd(), "assets");

const FONT_FILES = [
  "Molhim-Regular.ttf",
  "Molhim-Bold.ttf",
  "IBMPlexSansArabic-Regular.ttf",
  "IBMPlexSansArabic-Bold.ttf",
  "ArefRuqaa-Regular.ttf",
  "ArefRuqaa-Bold.ttf",
].map((f) => path.join(ASSETS, "fonts", f));

const LOGO_FILE = path.join(ASSETS, "brand-thechefz-logo.png");
const LOGO_RATIO = 497 / 120;

const OG_COPY = {
  letterLabel: "إلى",
  memoryLabel: "إلى روح",
  countLabel: "رسالة شكر",
  searchTo: "إلى",
  tagline: "اكتشف وش كتبوا 💜",
  eyebrow: "يوم المعلم - ٥ أكتوبر",
  defaultLead: "اكتب رسالة شكر لمعلمك اللي أثّر فيك",
  postmarkTop: "يوم المعلم",
  postmarkBottom: "٥ أكتوبر",
};

function siteHost(): string {
  try {
    return new URL(SITE_URL).host;
  } catch {
    return SITE_URL.replace(/^https?:\/\//, "");
  }
}

let logoUri: string | null | undefined;
/** The official logo as a data: URI (read once). null when the file is missing → wordmark. */
function logoDataUri(): string | null {
  if (logoUri === undefined) {
    try {
      logoUri = `data:image/png;base64,${fs.readFileSync(LOGO_FILE).toString("base64")}`;
    } catch {
      logoUri = null;
    }
  }
  return logoUri;
}

function brand(): OgBrand {
  return {
    logo: logoDataUri(),
    logoRatio: LOGO_RATIO,
    wordmark: COPY.brand,
    host: siteHost(),
    postmarkTop: OG_COPY.postmarkTop,
    postmarkBottom: OG_COPY.postmarkBottom,
  };
}

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Riyadh",
});

function postedOn(iso: string): string {
  const t = new Date(iso);
  return Number.isFinite(t.getTime()) ? dateFmt.format(t) : "";
}

/** Maps domain data to plain scene data (all text emoji-free). */
export function sceneFor(input: OgInput): OgScene {
  if (input.kind === "letter") {
    const m = input.m;
    const style = cardStyle(m);
    const memory = Boolean(m.inMemory);
    const name = stripEmoji(fromName({ fromName: m.fromName })) || COPY.anonymousFrom;
    return {
      kind: "letter",
      toLabel: memory ? OG_COPY.memoryLabel : OG_COPY.letterLabel,
      toName: stripEmoji(displayTo({ title: m.title, toName: m.toName })),
      school: (m.school && stripEmoji(m.school)) || null,
      body: stripEmoji(m.body),
      signature: `— ${name}`,
      date: postedOn(m.createdAt),
      stamp: stripEmoji(stampFor({ inMemory: memory })),
      memory,
      palette: {
        key: style.key,
        accent: style.accent,
        bg: style.bg,
        ink: style.ink,
        gradient: style.gradient,
        icon: style.icon,
      },
      seed: m.id,
      brand: brand(),
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
      toLabel: OG_COPY.searchTo,
      query: q,
      tagline: stripEmoji(OG_COPY.tagline),
      emptyTitle: stripEmoji(COPY.emptySearchTitle),
      emptyLead: stripEmoji(COPY.emptySearch),
      emptyCta: stripEmoji(COPY.heroCtaWrite),
      brand: brand(),
    };
  }

  // "كلنا كان لنا معلّم": the last word is set big in orange.
  const title = stripEmoji(COPY.heroTitle);
  const cut = title.lastIndexOf(" ");
  return {
    kind: "default",
    eyebrow: OG_COPY.eyebrow,
    titleLead: cut > 0 ? title.slice(0, cut) : "",
    titleWord: cut > 0 ? title.slice(cut + 1) : title,
    lead: OG_COPY.defaultLead,
    brand: brand(),
  };
}

async function rasterize(svg: string): Promise<Buffer> {
  const img = await renderAsync(svg, {
    fitTo: { mode: "width", value: OG_W },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: OG_SANS },
    logLevel: "off",
  });
  return img.asPng();
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
    return `l:${m.id}:${fnv1a([m.title, m.toName, m.school, m.body, m.fromName, m.variant, m.inMemory, m.createdAt].join("\u0001"))}`;
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
