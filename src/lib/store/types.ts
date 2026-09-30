import type {
  AdminFilter,
  CreateMessageInput,
  LikeResult,
  ListQuery,
  ListResult,
  MessageRecord,
  MessageStatus,
  ModerationRecord,
  PublicMessage,
  ReportReason,
} from "../types";

export type NewMessage = Omit<CreateMessageInput, "variant"> & {
  /** Card colour picked by the writer; null → derived from the id (variantFor). */
  variant: number | null;
  ipHash: string | null;
  deviceHash: string | null;
  status: "published" | "pending";
  reviewReason: string | null;
  moderation: ModerationRecord | null;
};

/**
 * A stored row as admin reads see it. The route handlers strip `ipHash` and
 * `deviceHash` before anything leaves the server.
 */
export type AdminRecord = MessageRecord & {
  deviceHash: string | null;
  /**
   * A moderator re-published it after a removal request: later removal
   * requests only flag it for review (reviewReason "removal_request_again").
   */
  removalKept: boolean;
  /** Last removal request (ISO) — the removal tab lists the latest first. */
  flaggedAt: string | null;
};

export interface AdminListOptions {
  filter: AdminFilter;
  /** Exact id, contact substring, or name/school search (tokenizeQuery semantics). */
  q?: string;
  limit: number;
  offset: number;
}

export interface AdminListResult {
  items: AdminRecord[];
  /** Matching the filter + q. */
  total: number;
  /** Per-filter totals over the whole table (ignores q) for the tab badges. */
  counts: Record<AdminFilter, number>;
}

export interface AdminPatch {
  status?: MessageStatus;
  starred?: boolean;
}

export type ExportFilter = "starred" | "surprise";

export interface RecentQuery {
  ipHash?: string | null;
  deviceHash?: string | null;
  sinceMs: number;
}

export interface Voter {
  /** Hash of the device cookie (freshly minted for cookie-less clients). */
  voterHash: string;
  ipHash: string | null;
  /** The request carried no device cookie. */
  newDevice: boolean;
}

export interface ReportInput extends Voter {
  reason: ReportReason;
  note: string | null;
}

export interface ReportOutcome {
  hidden: boolean;
  /** A new removal request over the daily per-device / per-IP cap: nothing was recorded. */
  limited?: boolean;
}

/** New removal requests per device / per IP in 24h. */
export const REMOVAL_REQUESTS_PER_DEVICE_DAY = 3;
export const REMOVAL_REQUESTS_PER_IP_DAY = 5;
export const DAY_MS = 24 * 60 * 60_000;

/**
 * Persistence for letters. Public reads only ever see `published` letters.
 * Two implementations: Postgres (production) and a JSON file (local dev).
 */
export interface MessageStore {
  create(input: NewMessage): Promise<PublicMessage>;
  /** Published only. */
  get(id: string): Promise<PublicMessage | null>;
  /**
   * Published only. `q` is matched with tokenizeQuery + matchesQuery semantics
   * (every token is a substring of searchText). "new" pages with a keyset cursor
   * on (createdAt desc, id desc); "top" orders by likes desc, createdAt desc,
   * id desc with an offset cursor. Invalid cursors return the first page.
   */
  list(q: ListQuery): Promise<ListResult>;
  /** Published letters. */
  count(): Promise<number>;
  /**
   * Idempotent per voter. A like from a cookie-less client (`newDevice`) is only
   * counted when no other cookie-less like came from the same IP for this letter
   * in the last 24h; otherwise it is acknowledged without counting.
   * null when the letter doesn't exist / isn't published.
   */
  toggleLike(id: string, like: boolean, who: Voter): Promise<LikeResult | null>;
  /**
   * One report per reporter per letter, where a reporter is a device OR an IP:
   * a report whose device or IP already reported this letter changes nothing.
   * `removal_request` moves the letter to pending at once (removalRequested=true,
   * reviewReason "removal_request") — unless a moderator already kept it after
   * one (removalKept), then it is only flagged ("removal_request_again"). New
   * removal requests are capped per device and per IP per day (`limited`).
   * Other reasons count towards REPORT_HIDE_THRESHOLD and move a published
   * letter to pending (reviewReason "reports") when the count crosses it — only
   * on crossing, so a moderator re-publishing it sticks.
   * `hidden` is true when the letter is no longer public. null when it doesn't exist.
   */
  report(id: string, input: ReportInput): Promise<ReportOutcome | null>;
  /** Letters (any status) created at or after `sinceMs` matching every hash given. 0 when none given. */
  countRecent(o: RecentQuery): Promise<number>;
  /** pending: oldest first (a queue) · reported: most reports first · removal: latest request first · others: newest first. */
  adminList(o: AdminListOptions): Promise<AdminListResult>;
  /**
   * Publishing clears reviewReason (removalRequested is kept for the audit trail)
   * and, after a removal request, sets removalKept. false when missing.
   */
  adminUpdate(id: string, patch: AdminPatch): Promise<boolean>;
  adminDelete(id: string): Promise<boolean>;
  /** Every letter (any status) that is starred / opted in to the surprise, newest first. */
  adminExport(filter: ExportFilter): Promise<AdminRecord[]>;
}
