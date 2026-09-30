// Server-side gate for `?q=` coming from shared links. The query ends up in the
// page title, the share preview and the invitation copy next to the brand, so
// only let it through when it is a real, clean search.

import { checkText } from "@/lib/moderation";
import { tokenizeQuery } from "@/lib/text/normalize";

export const MAX_QUERY = 60;

/**
 * First value only, control / zero-width / bidi-override characters removed
 * (they could reorder text in a preview), whitespace collapsed, ≤ 60 chars.
 */
export function readQueryParam(v: string | string[] | undefined | null): string {
  const raw = Array.isArray(v) ? v[0] : v;
  if (!raw) return "";
  const clean = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...clean].slice(0, MAX_QUERY).join("").trim();
}

/**
 * The query to search + display, or "" when it shouldn't be used: nothing left
 * after dropping honorifics/punctuation (would match every letter), or it
 * fails the content filter (profanity, phone numbers, links…).
 */
export function safeSearchQuery(v: string | string[] | undefined | null): string {
  const q = readQueryParam(v);
  if (!q) return "";
  if (tokenizeQuery(q).length === 0) return "";
  if (!checkText(q, { kind: "name" }).ok) return "";
  return q;
}
