// Pure helpers for the moderation dashboard (no React, no DOM) — unit tested.

import type { AdminFilter, MessageStatus, ModerationRecord } from "@/lib/types";
import type { AdminMessage, AdminPatch, ExportFilter } from "./admin-api";

export const PAGE_SIZE = 25;
export const POLL_MS = 60_000;
export const SEARCH_DEBOUNCE_MS = 350;
export const TOKEN_KEY = "tcz_admin_token";
export const ADMIN_TITLE = "لوحة الإشراف | ذا شفز";

export interface AdminTab {
  filter: AdminFilter;
  label: string;
  /** How a non-zero count is highlighted: review = orange, alert = red. */
  tone: "review" | "alert" | "neutral";
  empty: string;
}

/** Tab order: the review queue first, then things needing attention, then the rest. */
export const ADMIN_TABS: ReadonlyArray<AdminTab> = [
  { filter: "pending", label: "بانتظار المراجعة", tone: "review", empty: "ما فيه رسائل بانتظار المراجعة 🎉" },
  { filter: "reported", label: "مُبلّغ عنها", tone: "alert", empty: "ما فيه بلاغات 👌" },
  { filter: "removal", label: "طلبات حذف", tone: "alert", empty: "ما فيه طلبات حذف" },
  { filter: "starred", label: "مميزة ⭐", tone: "neutral", empty: "ما ميّزت أي رسالة للحين — اضغط ☆ على الرسائل اللي تعجبك" },
  { filter: "surprise", label: "مرشحة للمفاجأة 🎁", tone: "neutral", empty: "ما فيه رسائل وافق أصحابها على التواصل للحين" },
  { filter: "published", label: "منشورة", tone: "neutral", empty: "ما فيه رسائل منشورة" },
  { filter: "hidden", label: "مخفية", tone: "neutral", empty: "ما فيه رسائل مخفية" },
  { filter: "all", label: "الكل", tone: "neutral", empty: "ما فيه رسائل للحين" },
];

export const ADMIN_FILTERS: ReadonlyArray<AdminFilter> = ADMIN_TABS.map((t) => t.filter);

export const tabFor = (f: AdminFilter): AdminTab => ADMIN_TABS.find((t) => t.filter === f) ?? ADMIN_TABS[0];

export const STATUS_LABELS: Record<MessageStatus, string> = {
  published: "منشورة",
  pending: "بانتظار المراجعة",
  hidden: "مخفية",
};

/** The private surprise contact is only ever rendered in these tabs. */
export const showsPrivate = (f: AdminFilter): boolean => f === "starred" || f === "surprise";

/** Review tabs show the full letter body by default — you can't approve what you haven't read. */
export const expandsByDefault = (f: AdminFilter): boolean =>
  f === "pending" || f === "reported" || f === "removal";

export function emptyCounts(): Record<AdminFilter, number> {
  return Object.fromEntries(ADMIN_FILTERS.map((f) => [f, 0])) as Record<AdminFilter, number>;
}

export function normalizeCounts(raw: unknown): Record<AdminFilter, number> {
  const out = emptyCounts();
  if (raw && typeof raw === "object") {
    for (const f of ADMIN_FILTERS) {
      const v = (raw as Record<string, unknown>)[f];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[f] = Math.trunc(v);
    }
  }
  return out;
}

/** Whether a letter belongs in a tab (mirrors the server-side filters). */
export function matchesFilter(filter: AdminFilter, m: AdminMessage): boolean {
  switch (filter) {
    case "all":
      return true;
    case "published":
    case "pending":
    case "hidden":
      return m.status === filter;
    case "reported":
      return m.reports > 0;
    case "removal":
      return m.removalRequested;
    case "starred":
      return m.starred;
    case "surprise":
      return m.surpriseOptIn;
  }
}

/** Tab counts after a letter changes from `before` to `after` (null = didn't exist / deleted). */
export function countsDelta(
  counts: Record<AdminFilter, number>,
  before: AdminMessage | null,
  after: AdminMessage | null,
): Record<AdminFilter, number> {
  const next = { ...counts };
  for (const f of ADMIN_FILTERS) {
    const d = (after && matchesFilter(f, after) ? 1 : 0) - (before && matchesFilter(f, before) ? 1 : 0);
    if (d) next[f] = Math.max(0, next[f] + d);
  }
  return next;
}

/** +1 / 0 / −1: how the current tab's total changes. */
export function membershipDelta(
  filter: AdminFilter,
  before: AdminMessage | null,
  after: AdminMessage | null,
): number {
  return (after && matchesFilter(filter, after) ? 1 : 0) - (before && matchesFilter(filter, before) ? 1 : 0);
}

/**
 * Local mirror of the server's update: publishing clears the review reason and,
 * after a removal request, marks the letter as kept.
 */
export function applyPatch(m: AdminMessage, patch: AdminPatch): AdminMessage {
  return {
    ...m,
    ...(patch.status !== undefined ? { status: patch.status } : null),
    ...(patch.status === "published" ? { reviewReason: null } : null),
    ...(patch.status !== undefined ? { removalKept: patch.status === "published" && m.removalRequested } : null),
    ...(patch.starred !== undefined ? { starred: patch.starred } : null),
  };
}

/** The patch that reverts `patch` on `before`. */
export function inversePatch(before: AdminMessage, patch: AdminPatch): AdminPatch {
  const inv: AdminPatch = {};
  if (patch.status !== undefined) inv.status = before.status;
  if (patch.starred !== undefined) inv.starred = before.starred;
  return inv;
}

/**
 * Puts a letter's new state into the visible list:
 * present + still in tab → replaced · present + left the tab / deleted → removed ·
 * absent + belongs in tab (undo / rollback) → re-inserted near `hintIndex`.
 */
export function placeItem(
  list: ReadonlyArray<AdminMessage>,
  id: string,
  next: AdminMessage | null,
  filter: AdminFilter,
  hintIndex: number,
): AdminMessage[] {
  const i = list.findIndex((m) => m.id === id);
  const keep = next !== null && matchesFilter(filter, next);
  if (i >= 0) {
    if (keep) return list.map((m, j) => (j === i ? next : m));
    return list.filter((_, j) => j !== i);
  }
  if (!keep) return list.slice();
  const at = Math.min(Math.max(0, hintIndex), list.length);
  return [...list.slice(0, at), next, ...list.slice(at)];
}

/** The review queue reads oldest first; other tabs keep the server order. */
export function orderForTab(filter: AdminFilter, items: ReadonlyArray<AdminMessage>): AdminMessage[] {
  if (filter !== "pending") return items.slice();
  return items
    .map((m, i) => ({ m, i, t: Date.parse(m.createdAt) }))
    .sort((a, b) => (Number.isFinite(a.t) && Number.isFinite(b.t) && a.t !== b.t ? a.t - b.t : a.i - b.i))
    .map((x) => x.m);
}

/** Id to focus after `id` leaves the list: the next one, else the previous one. */
export function neighbourId(list: ReadonlyArray<AdminMessage>, id: string): string | null {
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return null;
  return list[i + 1]?.id ?? list[i - 1]?.id ?? null;
}

export function stepId(list: ReadonlyArray<AdminMessage>, id: string | null, step: 1 | -1): string | null {
  if (list.length === 0) return null;
  const i = id ? list.findIndex((m) => m.id === id) : -1;
  if (i < 0) return list[step === 1 ? 0 : list.length - 1].id;
  return list[Math.min(list.length - 1, Math.max(0, i + step))].id;
}

// ------------------------------------------------------------- pagination ---

/** 1-based range label parts for "عرض 26–50 من 120". */
export function pageRange(offset: number, shown: number, total: number) {
  if (shown === 0) return { from: 0, to: 0, total };
  return { from: offset + 1, to: offset + shown, total: Math.max(total, offset + shown) };
}

/**
 * Where the next page starts. Items acted on (published/hidden in the queue)
 * have already left this page server-side, so what's still shown is what
 * precedes the next page.
 */
export const nextOffset = (offset: number, shown: number): number => offset + shown;
export const prevOffset = (offset: number, pageSize: number = PAGE_SIZE): number => Math.max(0, offset - pageSize);

/** Offset to reload when the current page was emptied by moderation actions. */
export function refillOffset(offset: number, total: number, pageSize: number = PAGE_SIZE): number {
  if (total <= 0) return 0;
  if (offset < total) return offset;
  return Math.floor((total - 1) / pageSize) * pageSize;
}

// -------------------------------------------------------------- shortcuts ---

export type ShortcutAction = "publish" | "hide" | "star" | "next" | "prev";

// Physical keys (event.code) so the shortcuts also work with an Arabic layout.
const SHORTCUT_CODES: Record<string, ShortcutAction> = {
  KeyA: "publish",
  KeyH: "hide",
  KeyS: "star",
  KeyJ: "next",
  KeyK: "prev",
};

export function shortcutFor(e: {
  code?: string;
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  if (e.code && SHORTCUT_CODES[e.code]) return SHORTCUT_CODES[e.code];
  const k = e.key?.length === 1 ? e.key.toUpperCase() : "";
  return k ? (SHORTCUT_CODES[`Key${k}`] ?? null) : null;
}

// ----------------------------------------------------------------- labels ---

const LAYER_LABELS: Record<ModerationRecord["layer"], string> = {
  wordlist: "قائمة الكلمات",
  ai: "الفحص الذكي",
  none: "بدون فحص",
};

const REASON_LABELS: Record<string, string> = {
  profanity: "ألفاظ غير لائقة",
  contact_info: "بيانات تواصل",
  link: "رابط",
  spam: "سبام / تكرار",
  ai_flagged: "رصد آلي",
};

const reasonLabel = (r: string): string => REASON_LABELS[r.trim()] ?? r.trim();

/** Human wording for MessageRecord.reviewReason ("suspicious: …", "review_all", "removal_request"…). */
export function humanReviewReason(reason: string | null): string | null {
  const r = reason?.trim();
  if (!r) return null;
  if (r === "review_all") return "وضع مراجعة كل الرسائل";
  if (r === "removal_request") return "طلب حذف من الشخص المذكور";
  if (r === "removal_request_again") return "طلب حذف جديد بعد ما أبقيتوها منشورة";
  if (/^report/.test(r)) return "وصلت حد البلاغات";
  const suspicious = /^suspicious\s*:?\s*([\s\S]*)$/.exec(r);
  if (suspicious) return suspicious[1] ? `اشتباه من الفلتر: ${reasonLabel(suspicious[1])}` : "اشتباه من الفلتر";
  return reasonLabel(r);
}

/** One-line summary of the automatic filter's verdict, or null when there's nothing to say. */
export function moderationSummary(mod: ModerationRecord | null): string | null {
  if (!mod) return null;
  const parts = [LAYER_LABELS[mod.layer]];
  if (mod.flagged) parts.push("مرفوضة آلياً");
  else if (mod.suspicious) parts.push("غير متأكد");
  else parts.push("سليمة");
  if (mod.reason) parts.push(reasonLabel(mod.reason));
  return parts.join(" · ");
}

const absoluteFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatAbsolute(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? absoluteFmt.format(new Date(t)) : "";
}

export function exportFilename(filter: ExportFilter, now: Date = new Date()): string {
  const d = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  return `thechefz-teachers-day-${filter}-${d}.csv`;
}

// ------------------------------------------------------------------- misc ---

/** Runs `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function runPool<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
