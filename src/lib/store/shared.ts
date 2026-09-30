import { VARIANT_COUNT, type AdminFilter, type MessageRecord, type PublicMessage } from "../types";
import type { AdminRecord } from "./types";

export const MAX_PAGE_SIZE = 50;
export const MAX_ADMIN_PAGE_SIZE = 100;

export const ADMIN_FILTERS: readonly AdminFilter[] = [
  "all",
  "published",
  "pending",
  "hidden",
  "reported",
  "removal",
  "starred",
  "surprise",
];

export function isAdminFilter(v: unknown): v is AdminFilter {
  return typeof v === "string" && (ADMIN_FILTERS as readonly string[]).includes(v);
}

export function emptyCounts(): Record<AdminFilter, number> {
  return { all: 0, published: 0, pending: 0, hidden: 0, reported: 0, removal: 0, starred: 0, surprise: 0 };
}

export function clampLimit(n: number, max: number = MAX_PAGE_SIZE): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : Math.min(12, max);
}

export function clampOffset(n: number): number {
  return Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.floor(n))) : 0;
}

export function isValidVariant(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < VARIANT_COUNT;
}

/**
 * The only shape public responses may carry: an explicit allow-list, so private
 * fields (contact, hashes, status, reports…) can never leak by accident.
 */
export function toPublic(r: PublicMessage): PublicMessage {
  return {
    id: r.id,
    title: r.title,
    toName: r.toName,
    school: r.school,
    body: r.body,
    fromName: r.fromName,
    likes: r.likes,
    createdAt: r.createdAt,
    variant: r.variant,
    inMemory: r.inMemory === true,
  };
}

/** Admin payloads never carry the IP / device hashes. */
export function toAdminItem(r: MessageRecord | AdminRecord): Omit<MessageRecord, "ipHash"> {
  const { ipHash: _ip, deviceHash: _device, ...rest } = r as AdminRecord;
  void _ip;
  void _device;
  return rest;
}

/** Escapes LIKE/ILIKE wildcards (default escape char is backslash). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** createdAt desc, id desc (ISO strings from toISOString compare lexicographically). */
export function compareNew(a: PublicMessage, b: PublicMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

/** createdAt asc, id asc — the review queue. */
export function compareOld(a: PublicMessage, b: PublicMessage): number {
  return -compareNew(a, b);
}

/** likes desc, then createdAt desc, id desc. */
export function compareTop(a: PublicMessage, b: PublicMessage): number {
  return b.likes - a.likes || compareNew(a, b);
}
