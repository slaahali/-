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

/** Public field names a visitor can type into. Used for validation + moderation errors. */
export type Field = "toName" | "school" | "body" | "fromName";
/** Every validated input, including the private surprise contact. */
export type InputField = Field | "contact";

/** Input limits (characters, after cleaning). Shared by the form + the API. */
export const LIMITS = {
  toName: { min: 2, max: 40 },
  school: { min: 0, max: 70 },
  body: { min: 10, max: 600 },
  fromName: { min: 0, max: 40 },
  contact: { min: 0, max: 80 },
} as const;

/**
 * Number of card colours a writer can pick from (index into CARD_COLORS in
 * ./assets.ts). Stored as `variant` for historical reasons.
 */
export const VARIANT_COUNT = 6;

/** What a visitor submits. Already cleaned (trimmed / whitespace-normalised) server side. */
export interface CreateMessageInput {
  title: TeacherTitle | null;
  toName: string;
  school: string | null;
  body: string;
  fromName: string | null;
  /** Card colour chosen by the writer, 0..VARIANT_COUNT-1. */
  variant: number;
  /** "في ذكرى" — the teacher has passed away; shown with a calm, respectful style. */
  inMemory: boolean;
  /** Writer agrees to be contacted if their letter is picked for an on-camera gift surprise. */
  surpriseOptIn: boolean;
  /** PRIVATE phone/email for the surprise. Never published. Only set when surpriseOptIn. */
  contact: string | null;
}

/** Safe-to-publish shape. Never contains contact info, IP hashes, report counts, or status. */
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
  /** Card colour, 0..VARIANT_COUNT-1 (ignored visually when inMemory). */
  variant: number;
  inMemory: boolean;
}

/**
 * published — visible on the wall
 * pending   — waiting for a human (flagged as suspicious, review-all mode, or a
 *             removal request by the person named). Not visible.
 * hidden    — rejected / taken down by a moderator. Not visible.
 */
export type MessageStatus = "published" | "pending" | "hidden";

export interface ModerationRecord {
  layer: "wordlist" | "ai" | "none";
  flagged: boolean;
  /** Set when the filter let it through but wasn't sure (→ human review). */
  suspicious?: boolean;
  reason?: string;
}

export type ReportReason = "inappropriate" | "removal_request" | "other";

/** Full row as stored. Only ever returned by admin endpoints (minus ipHash). */
export interface MessageRecord extends PublicMessage {
  status: MessageStatus;
  reports: number;
  /** The person named asked for it to be taken down (auto-moved to pending). */
  removalRequested: boolean;
  /** Why it is waiting for review, e.g. "suspicious: …", "review_all", "removal_request". */
  reviewReason: string | null;
  /** Shortlisted by the team (e.g. for the gift-surprise video content). */
  starred: boolean;
  surpriseOptIn: boolean;
  contact: string | null;
  ipHash: string | null;
  /** normalizeArabic(toName + school) — what search matches against */
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

export type AdminFilter =
  | "all"
  | "published"
  | "pending"
  | "hidden"
  | "reported"
  | "removal"
  | "starred"
  | "surprise";

// ---------------------------------------------------------------------------
// HTTP API contract
// ---------------------------------------------------------------------------
//
// GET  /api/messages?q=&sort=new|top&cursor=&limit=     -> 200 ListResult
// POST /api/messages            body CreateMessageBody  -> 201 CreateMessageResponse | ApiError
// GET  /api/messages/:id                                -> 200 { message: PublicMessage } | 404 (published only)
// POST /api/messages/:id/like   body { like: boolean }  -> 200 LikeResult | ApiError
// POST /api/messages/:id/report body ReportBody         -> 200 { ok: true; hidden: boolean } | ApiError
// GET  /api/og                  -> image/png 1200x630 (campaign default)
// GET  /api/og/:id              -> image/png 1200x630 (one letter)
// GET  /api/og/search?q=        -> image/png 1200x630 ("N رسائل إلى …" / invitation)
// GET  /api/admin/messages?filter=AdminFilter&q=&limit=&offset=  (Bearer ADMIN_TOKEN)
//                         -> 200 { items: MessageRecord[]; total: number; counts: Record<AdminFilter, number> }
// PATCH  /api/admin/messages/:id  body { status?: MessageStatus; starred?: boolean } -> 200 { ok: true }
// DELETE /api/admin/messages/:id                                -> 200 { ok: true }
// GET  /api/admin/export?filter=starred|surprise  -> text/csv (UTF-8 BOM) with contact details

export interface CreateMessageBody {
  title: TeacherTitle | null;
  toName: string;
  school?: string | null;
  body: string;
  fromName?: string | null;
  variant?: number;
  inMemory?: boolean;
  surpriseOptIn?: boolean;
  contact?: string | null;
  /** Honeypot. Real visitors never fill it; bots do. */
  website?: string;
}

export interface CreateMessageResponse {
  message: PublicMessage;
  /** "pending" → waiting for human review; the permalink 404s until approved. */
  status: "published" | "pending";
}

export interface ReportBody {
  reason: ReportReason;
  note?: string | null;
}

export interface LikeResult {
  likes: number;
  liked: boolean;
}

export type ApiError =
  | { error: "validation"; fields: Partial<Record<InputField, string>> }
  | { error: "moderation"; fields: Field[]; message: string }
  | { error: "rate_limited"; retryAfter: number; message: string }
  | { error: "not_found" }
  | { error: "unauthorized" }
  | { error: "bad_request"; message?: string }
  | { error: "server"; message?: string };
