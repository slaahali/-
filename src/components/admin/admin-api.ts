// Browser-side client for the admin API (contract in src/lib/types.ts).
// The token only ever travels in the Authorization header — never in a URL.

import {
  TEACHER_TITLES,
  type AdminFilter,
  type MessageRecord,
  type MessageStatus,
  type ModerationRecord,
  type TeacherTitle,
} from "@/lib/types";
import { normalizeCounts } from "./admin-model";

/** What the admin endpoints return per letter (the server strips ipHash; we drop it too). */
export type AdminMessage = Omit<MessageRecord, "ipHash" | "searchText"> & {
  /** A moderator re-published it after a removal request; later ones only flag it. */
  removalKept?: boolean;
};

export interface AdminListParams {
  filter: AdminFilter;
  q?: string;
  limit: number;
  offset: number;
}

export interface AdminListResponse {
  items: AdminMessage[];
  total: number;
  counts: Record<AdminFilter, number>;
}

export interface AdminPatch {
  status?: MessageStatus;
  starred?: boolean;
}

export type ExportFilter = "starred" | "surprise";

export type AdminErrorKind = "unauthorized" | "rate_limited" | "not_found" | "network" | "server";

export class AdminApiError extends Error {
  readonly kind: AdminErrorKind;
  readonly status: number;
  /** Seconds, for rate_limited. */
  readonly retryAfter: number | null;

  constructor(kind: AdminErrorKind, status: number, retryAfter: number | null = null) {
    super(`admin api: ${kind} (${status})`);
    this.name = "AdminApiError";
    this.kind = kind;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const isUnauthorized = (err: unknown): boolean =>
  err instanceof AdminApiError && err.kind === "unauthorized";

/** Arabic, admin-facing description of a failed call. */
export function describeError(err: unknown): string {
  if (!(err instanceof AdminApiError)) return "صار خطأ غير متوقع، حاول مرة ثانية";
  switch (err.kind) {
    case "unauthorized":
      return "الرمز غير صحيح";
    case "rate_limited":
      return err.retryAfter
        ? `محاولات كثيرة، جرّب بعد ${Math.max(1, Math.ceil(err.retryAfter / 60))} دقيقة`
        : "محاولات كثيرة، جرّب بعد شوي";
    case "not_found":
      return "الرسالة ما عادت موجودة";
    case "network":
      return "تعذر الاتصال بالخادم — تأكد من الإنترنت وحاول مرة ثانية";
    case "server":
      return "صار خطأ في الخادم، حاول مرة ثانية";
  }
}

export function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

export function buildListQuery(p: AdminListParams): string {
  const sp = new URLSearchParams({
    filter: p.filter,
    limit: String(p.limit),
    offset: String(Math.max(0, Math.trunc(p.offset))),
  });
  const q = p.q?.trim();
  if (q) sp.set("q", q);
  return sp.toString();
}

async function errorFrom(res: Response): Promise<AdminApiError> {
  if (res.status === 401 || res.status === 403) return new AdminApiError("unauthorized", res.status);
  if (res.status === 404) return new AdminApiError("not_found", 404);
  if (res.status === 429) {
    let retry = Number(res.headers.get("retry-after"));
    if (!Number.isFinite(retry) || retry <= 0) {
      try {
        const body = (await res.json()) as { retryAfter?: unknown };
        retry = typeof body.retryAfter === "number" ? body.retryAfter : NaN;
      } catch {
        retry = NaN;
      }
    }
    return new AdminApiError("rate_limited", 429, Number.isFinite(retry) && retry > 0 ? retry : null);
  }
  return new AdminApiError("server", res.status);
}

async function adminFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store", credentials: "same-origin" });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new AdminApiError("network", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

export async function listMessages(
  token: string,
  params: AdminListParams,
  signal?: AbortSignal,
): Promise<AdminListResponse> {
  const res = await adminFetch(token, `/api/admin/messages?${buildListQuery(params)}`, { signal });
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new AdminApiError("server", res.status);
  }
  return normalizeListResponse(raw);
}

export async function patchMessage(token: string, id: string, patch: AdminPatch): Promise<void> {
  await adminFetch(token, `/api/admin/messages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteMessage(token: string, id: string): Promise<void> {
  await adminFetch(token, `/api/admin/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchExport(
  token: string,
  filter: ExportFilter,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await adminFetch(token, `/api/admin/export?filter=${filter}`);
  const blob = await res.blob();
  return { blob, filename: filenameFromDisposition(res.headers.get("content-disposition")) };
}

/** Parses `attachment; filename*=UTF-8''…` / `filename="…"`. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      return sanitizeFilename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header);
  const name = plain ? (plain[2] ?? plain[1]).trim() : "";
  return name ? sanitizeFilename(name) : null;
}

function sanitizeFilename(name: string): string | null {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return clean || null;
}

/** Triggers a browser download of `blob` without navigating. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ---------------------------------------------------------------------------
// Response normalisation. The API is built in parallel, so be forgiving about
// missing optional fields and never keep anything we don't render (ipHash).
// ---------------------------------------------------------------------------

const STATUSES: ReadonlyArray<MessageStatus> = ["published", "pending", "hidden"];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function normalizeModeration(v: unknown): ModerationRecord | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const layer = r.layer === "wordlist" || r.layer === "ai" ? r.layer : "none";
  return {
    layer,
    flagged: r.flagged === true,
    suspicious: r.suspicious === true,
    reason: typeof r.reason === "string" && r.reason ? r.reason : undefined,
  };
}

export function normalizeItem(raw: unknown): AdminMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  const title =
    typeof r.title === "string" && r.title in TEACHER_TITLES ? (r.title as TeacherTitle) : null;
  return {
    id: r.id,
    title,
    toName: str(r.toName),
    school: strOrNull(r.school),
    body: str(r.body),
    fromName: strOrNull(r.fromName),
    likes: num(r.likes),
    createdAt: str(r.createdAt),
    variant: num(r.variant),
    inMemory: r.inMemory === true,
    status: STATUSES.includes(r.status as MessageStatus) ? (r.status as MessageStatus) : "pending",
    reports: num(r.reports),
    removalRequested: r.removalRequested === true,
    removalKept: r.removalKept === true,
    reviewReason: strOrNull(r.reviewReason),
    starred: r.starred === true,
    surpriseOptIn: r.surpriseOptIn === true,
    contact: strOrNull(r.contact),
    moderation: normalizeModeration(r.moderation),
  };
}

export function normalizeListResponse(raw: unknown): AdminListResponse {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(r.items)
    ? r.items.map(normalizeItem).filter((m): m is AdminMessage => m !== null)
    : [];
  return { items, total: Math.max(num(r.total), items.length), counts: normalizeCounts(r.counts) };
}
