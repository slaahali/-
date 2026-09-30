// Share targets for letters and search results: payloads, social intent URLs,
// clipboard + Web Share helpers and analytics. Browser helpers are no-ops (or
// return false) during SSR so components can import this freely.

import { COPY, HASHTAG, permalink, searchLink } from "@/lib/config";
import { displayTo, shareTextFor } from "@/lib/format";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";

export type ShareChannel = "native" | "whatsapp" | "x" | "telegram" | "snapchat" | "copy" | "story";

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

/** What is being shared — decides the analytics event. */
export type ShareTarget = { kind: "letter"; id: string } | { kind: "search"; q: string };

type LetterLike = Pick<PublicMessage, "id" | "title" | "toName" | "inMemory">;

export const shareUrl = (m: Pick<PublicMessage, "id">) => permalink(m.id);

export function letterPayload(m: LetterLike): SharePayload {
  const to = displayTo(m);
  return {
    title: m.inMemory ? COPY.memoryShareText(to) : COPY.shareTitle(to),
    text: shareTextFor(m),
    url: shareUrl(m),
  };
}

export function searchPayload(q: string, count: number): SharePayload {
  const text = COPY.shareSearchText(q.trim(), count);
  return { title: text, text, url: searchLink(q) };
}

// --- intent URLs -------------------------------------------------------------

const enc = encodeURIComponent;
const hashtag = () => HASHTAG.replace(/^#/, "").trim();

export function whatsappUrl(p: SharePayload): string {
  return `https://wa.me/?text=${enc(`${p.text} ${p.url}`)}`;
}

export function xUrl(p: SharePayload): string {
  const tag = hashtag();
  return `https://x.com/intent/post?text=${enc(p.text)}&url=${enc(p.url)}${tag ? `&hashtags=${enc(tag)}` : ""}`;
}

export function telegramUrl(p: SharePayload): string {
  return `https://t.me/share/url?url=${enc(p.url)}&text=${enc(p.text)}`;
}

export function snapchatUrl(p: SharePayload): string {
  return `https://www.snapchat.com/scan?attachmentUrl=${enc(p.url)}`;
}

// --- analytics ---------------------------------------------------------------

export function trackShare(target: ShareTarget, channel: ShareChannel): void {
  if (target.kind === "letter") track("letter_share", { id: target.id, channel });
  else track("search_share", { q: target.q, channel });
}

// --- browser APIs ------------------------------------------------------------

export function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** "cancelled" when the visitor closed the share sheet (AbortError) — not an error. */
export async function nativeShare(p: SharePayload): Promise<"shared" | "cancelled" | "failed"> {
  if (!canNativeShare()) return "failed";
  const data: ShareData = { title: p.title, text: p.text, url: p.url };
  try {
    if (navigator.canShare && !navigator.canShare(data)) return "failed";
    await navigator.share(data);
    return "shared";
  } catch (e) {
    return isAbortError(e) ? "cancelled" : "failed";
  }
}

/** Clipboard API first, then the old textarea + execCommand trick (older iOS / insecure contexts). */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied / not focused — try the fallback */
  }
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  // 16px avoids the iOS zoom; kept in the viewport so the page doesn't jump.
  ta.style.cssText = "position:fixed;top:0;inset-inline-start:0;width:1px;height:1px;opacity:0;font-size:16px;";
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}

// --- one-call actions (share + track) ------------------------------------------

/** Native share with tracking. Returns the outcome so callers can fall back. */
export async function shareNative(target: ShareTarget, p: SharePayload) {
  const result = await nativeShare(p);
  if (result === "shared") trackShare(target, "native");
  return result;
}

/** Copies the link and tracks it. */
export async function shareCopy(target: ShareTarget, p: SharePayload): Promise<boolean> {
  const ok = await copyToClipboard(p.url);
  if (ok) trackShare(target, "copy");
  return ok;
}
