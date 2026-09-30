// Shared domain types + API contracts. Imported by both server and client code,
// so this file must stay free of Node-only imports.

export const TEACHER_TITLES = {
  ustadh: "أستاذ",
  ustadha: "أستاذة",
  dr_m: "الدكتور",
  dr_f: "الدكتورة",
} as const;

export type TeacherTitle = keyof typeof TEACHER_TITLES;

export const TEACHER_TITLE_KEYS = Object.keys(TEACHER_TITLES) as TeacherTitle[];

/** Field names a visitor can type into. Used for validation + moderation errors. */
export type Field = "toName" | "school" | "body" | "fromName";

/** Input limits (characters, after cleaning). Shared by the form + the API. */
export const LIMITS = {
  toName: { min: 2, max: 40 },
  school: { min: 0, max: 70 },
  body: { min: 10, max: 600 },
  fromName: { min: 0, max: 40 },
} as const;

/** Number of visual variants a letter can take (accent colour + 3D icon). */
export const VARIANT_COUNT = 6;

/** What a visitor submits. Already cleaned (trimmed / whitespace-normalised) server side. */
export interface CreateMessageInput {
  title: TeacherTitle | null;
  toName: string;
  school: string | null;
  body: string;
  fromName: string | null;
}

/** Safe-to-publish shape. Never contains IP hashes, report counts, or status. */
export interface PublicMessage {
  id: string;
  title: TeacherTitle | null;
  toName: string;
  school: string | null;
  body: string;
  fromName: string | null;
  likes: number;
  /** ISO-8601 */
  createdAt: string;
  /** 0..VARIANT_COUNT-1, derived from the id. Drives card colour + icon. */
  variant: number;
}

export type MessageStatus = "published" | "hidden";

export interface ModerationRecord {
  layer: "wordlist" | "ai" | "none";
  flagged: boolean;
  reason?: string;
}

/** Full row as stored. Only ever returned by admin endpoints. */
export interface MessageRecord extends PublicMessage {
  status: MessageStatus;
  reports: number;
  ipHash: string | null;
  /** normalizeArabic(title + toName + school) — what search matches against */
  searchText: string;
  moderation: ModerationRecord | null;
}

export type SortMode = "new" | "top";

export interface ListQuery {
  q?: string;
  sort: SortMode;
  /** Opaque cursor returned by a previous page. */
  cursor?: string | null;
  limit: number;
}

export interface ListResult {
  items: PublicMessage[];
  nextCursor: string | null;
  /** Total matching messages (for "N رسالة" counters). */
  total: number;
}

// ---------------------------------------------------------------------------
// HTTP API contract
// ---------------------------------------------------------------------------
//
// GET  /api/messages?q=&sort=new|top&cursor=&limit=     -> 200 ListResult
// POST /api/messages            body CreateMessageBody  -> 201 { message: PublicMessage } | ApiError
// GET  /api/messages/:id                                -> 200 { message: PublicMessage } | 404
// POST /api/messages/:id/like   body { like: boolean }  -> 200 LikeResult | ApiError
// POST /api/messages/:id/report body { reason?: string }-> 200 { ok: true } | ApiError
// GET  /api/og            -> image/png 1200x630 (campaign default)
// GET  /api/og/:id        -> image/png 1200x630 (one letter)
// GET  /api/admin/messages?status=all|published|hidden|reported&q=&limit=&offset=  (Bearer ADMIN_TOKEN)
//                         -> 200 { items: MessageRecord[]; total: number }
// PATCH  /api/admin/messages/:id  body { status: MessageStatus } -> 200 { ok: true }
// DELETE /api/admin/messages/:id                                -> 200 { ok: true }

export interface CreateMessageBody {
  title: TeacherTitle | null;
  toName: string;
  school?: string | null;
  body: string;
  fromName?: string | null;
  /** Honeypot. Real visitors never fill it; bots do. */
  website?: string;
}

export interface LikeResult {
  likes: number;
  liked: boolean;
}

export type ApiError =
  | { error: "validation"; fields: Partial<Record<Field, string>> }
  | { error: "moderation"; fields: Field[]; message: string }
  | { error: "rate_limited"; retryAfter: number; message: string }
  | { error: "not_found" }
  | { error: "unauthorized" }
  | { error: "bad_request"; message?: string }
  | { error: "server"; message?: string };
