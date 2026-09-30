// Pure helpers for the wall (no React, no DOM) so they can be unit tested.

import { tokenizeQuery } from "@/lib/text/normalize";
import type { PublicMessage } from "@/lib/types";

/** Queries shorter than this (after trimming) don't hit the API. */
export const MIN_QUERY = 2;
/** Page size, same as getInitialWall() on the server. */
export const PAGE_SIZE = 18;

// Leading honorifics people type before a name: أستاذ/أستاذة/الأستاذ(ة), د./دكتور(ة)/الدكتور(ة),
// المعلم(ة)/معلم(ة), أ./ا., مس/ميس. Hamza and ة/ه variants included.
const HONORIFIC_RE =
  /^(?:(?:(?:ال)?[اأإآ]ستاذ[ةه]?|(?:ال)?دكتور[ةه]?|(?:ال)?معلم[ةه]?|مس|ميس|مستر)(?:\s+|$)|(?:د|أ|ا)\s*\.\s*)/u;

/**
 * The name to prefill the form with from a search query: trims, drops quotes and
 * leading honorifics ("الأستاذة نورة" → "نورة", "د.سعد" → "سعد").
 */
export function cleanQueryName(q: string): string {
  let s = q
    .replace(/[«»"“”']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(HONORIFIC_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Which query the list should reflect for what's typed: empty → unfiltered,
 * too short → keep whatever is applied now, otherwise the trimmed text.
 */
export function effectiveQuery(typed: string, applied: string): string {
  const t = typed.trim();
  if (!t) return "";
  if (t.length < MIN_QUERY) return applied;
  // Only honorifics/punctuation ("أستاذ", "!!") would match every letter.
  return tokenizeQuery(t).length > 0 ? t : "";
}

/** Append `more` to `list`, skipping ids already present (pages can overlap). */
export function mergeUnique(list: PublicMessage[], more: PublicMessage[]): PublicMessage[] {
  const seen = new Set(list.map((m) => m.id));
  const out = list.slice();
  for (const m of more) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * The address to show for a settled search, or null when the current page
 * isn't the home page (never rewrite /m/:id permalinks). Keeps other params
 * (utm…) and the #letters hash.
 */
export function wallSearchUrl(
  loc: { pathname: string; search: string; hash: string },
  q: string,
): string | null {
  if (loc.pathname !== "/") return null;
  const sp = new URLSearchParams(loc.search);
  const t = q.trim();
  if (t) sp.set("q", t);
  else sp.delete("q");
  const qs = sp.toString();
  return `/${qs ? `?${qs}` : ""}${loc.hash === "#letters" ? loc.hash : ""}`;
}

/** Small alternating tilt so the wall looks hand-pinned (degrees). */
export function tiltFor(index: number): number {
  return index % 2 === 0 ? -0.6 : 0.6;
}

/**
 * Rough "will this be clamped at 7 lines?" guess used before the card can
 * measure itself (SSR). ~38 Arabic chars per line at card width.
 */
export function looksLong(body: string, lines = 7, charsPerLine = 38): boolean {
  let count = 0;
  for (const para of body.split("\n")) {
    count += Math.max(1, Math.ceil(para.length / charsPerLine));
    if (count > lines) return true;
  }
  return false;
}

/** Pronoun for "أرسل له/لها هدية" from the teacher's title. */
export function isFemaleTitle(title: PublicMessage["title"]): boolean {
  return title === "ustadha" || title === "dr_f";
}
