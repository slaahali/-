// JSON-file store for local development (DATA_DIR/letters.json). Single process
// only: an in-process mutex serialises writes, and each write goes to a temp file
// that is renamed over the original so a crash never leaves a half-written file.

import { promises as fs } from "node:fs";
import path from "node:path";
import { newId, variantFor } from "../ids";
import { getDataDir, getReportHideThreshold, isProduction, shouldSeedDemo } from "../server-config";
import { buildSearchText, matchesQuery, tokenizeQuery } from "../text/normalize";
import { normalizeContact } from "../validation";
import {
  TEACHER_TITLE_KEYS,
  type AdminFilter,
  type LikeResult,
  type ListQuery,
  type ListResult,
  type MessageStatus,
  type PublicMessage,
  type ReportReason,
  type TeacherTitle,
} from "../types";
import { decodeCursor, encodeCursor } from "./cursor";
import { buildDemoMessages } from "./demo-data";
import {
  MAX_ADMIN_PAGE_SIZE,
  clampLimit,
  clampOffset,
  compareNew,
  compareOld,
  compareTop,
  emptyCounts,
  isValidVariant,
  toPublic,
} from "./shared";
import type {
  AdminListOptions,
  AdminListResult,
  AdminPatch,
  AdminRecord,
  ExportFilter,
  MessageStore,
  NewMessage,
  RecentQuery,
} from "./types";

interface ReportEntry {
  by: string;
  reason: ReportReason;
  note: string | null;
  at: string;
}

interface FileData {
  version: 2;
  /** Full rows, including the private contact and the IP / device hashes. */
  messages: AdminRecord[];
  /** message id -> voter hashes */
  likes: Record<string, string[]>;
  /** message id -> one entry per reporter */
  reports: Record<string, ReportEntry[]>;
}

export interface FileStoreOptions {
  dir?: string;
  seedDemo?: boolean;
  reportHideThreshold?: number;
}

const FILE_NAME = "letters.json";
const STATUSES: readonly MessageStatus[] = ["published", "pending", "hidden"];
const REASONS: readonly ReportReason[] = ["inappropriate", "removal_request", "other"];
let warnedProduction = false;

function emptyData(): FileData {
  return { version: 2, messages: [], likes: {}, reports: {} };
}

function isErrno(e: unknown, code: string): boolean {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === code;
}

const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const bool = (v: unknown): boolean => v === true;
const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Brings a row written by an older version of the app (or edited by hand) up to
 * the current shape. Rows without the essentials are dropped.
 */
export function migrateRow(raw: unknown): AdminRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.toName !== "string" || typeof r.body !== "string") return null;
  const created = typeof r.createdAt === "string" ? Date.parse(r.createdAt) : NaN;
  if (!Number.isFinite(created)) return null;

  const title =
    typeof r.title === "string" && (TEACHER_TITLE_KEYS as string[]).includes(r.title)
      ? (r.title as TeacherTitle)
      : null;
  const school = strOrNull(r.school);
  const surpriseOptIn = bool(r.surpriseOptIn);
  return {
    id: r.id,
    title,
    toName: r.toName,
    school,
    body: r.body,
    fromName: strOrNull(r.fromName),
    likes: count(r.likes),
    createdAt: new Date(created).toISOString(),
    variant: isValidVariant(r.variant) ? r.variant : variantFor(r.id),
    inMemory: bool(r.inMemory),
    status: STATUSES.includes(r.status as MessageStatus) ? (r.status as MessageStatus) : "published",
    reports: count(r.reports),
    removalRequested: bool(r.removalRequested),
    reviewReason: strOrNull(r.reviewReason),
    starred: bool(r.starred),
    surpriseOptIn,
    contact: surpriseOptIn ? strOrNull(r.contact) : null,
    ipHash: strOrNull(r.ipHash),
    deviceHash: strOrNull(r.deviceHash),
    searchText:
      typeof r.searchText === "string" && r.searchText
        ? r.searchText
        : buildSearchText({ title, toName: r.toName, school }),
    moderation:
      r.moderation && typeof r.moderation === "object"
        ? (r.moderation as AdminRecord["moderation"])
        : null,
  };
}

function migrateReports(raw: unknown): Record<string, ReportEntry[]> {
  const out: Record<string, ReportEntry[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[id] = list
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .filter((e) => typeof e.by === "string")
      .map((e) => ({
        by: e.by as string,
        reason: REASONS.includes(e.reason as ReportReason) ? (e.reason as ReportReason) : "other",
        note: strOrNull(e.note),
        at: typeof e.at === "string" ? e.at : new Date(0).toISOString(),
      }));
  }
  return out;
}

function migrateLikes(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, list] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(list)) out[id] = list.filter((v): v is string => typeof v === "string");
  }
  return out;
}

function matchesFilter(m: AdminRecord, f: AdminFilter): boolean {
  switch (f) {
    case "published":
    case "pending":
    case "hidden":
      return m.status === f;
    case "reported":
      return m.reports > 0;
    case "removal":
      return m.removalRequested;
    case "starred":
      return m.starred;
    case "surprise":
      return m.surpriseOptIn;
    default:
      return true;
  }
}

const copy = (m: AdminRecord): AdminRecord => ({
  ...m,
  moderation: m.moderation ? { ...m.moderation } : null,
});

export class FileStore implements MessageStore {
  private readonly dir: string;
  private readonly file: string;
  private readonly seedDemo: boolean;
  private readonly threshold: number;
  private data: FileData | null = null;
  private loading: Promise<FileData> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: FileStoreOptions = {}) {
    this.dir = opts.dir ?? getDataDir();
    this.file = path.join(this.dir, FILE_NAME);
    this.seedDemo = opts.seedDemo ?? shouldSeedDemo();
    this.threshold = opts.reportHideThreshold ?? getReportHideThreshold();
    if (isProduction() && !warnedProduction) {
      warnedProduction = true;
      console.warn(
        "\n[store] ⚠️  DATABASE_URL is not set — using the local JSON file store " +
          `(${this.file}).\n[store] ⚠️  This is for development only: data is per-instance, ` +
          "not shared between servers, and lost on redeploy. Set DATABASE_URL.\n",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Loading / persistence
  // -------------------------------------------------------------------------

  private load(): Promise<FileData> {
    if (this.data) return Promise.resolve(this.data);
    if (!this.loading) {
      this.loading = this.readFromDisk()
        .then((d) => {
          this.data = d;
          return d;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  private async readFromDisk(): Promise<FileData> {
    let data: FileData;
    let dirty = false;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const rows = Array.isArray(parsed.messages) ? parsed.messages : [];
      const messages = rows.map(migrateRow).filter((m): m is AdminRecord => m !== null);
      data = {
        version: 2,
        messages,
        likes: migrateLikes(parsed.likes),
        reports: migrateReports(parsed.reports),
      };
      dirty = parsed.version !== 2 || messages.length !== rows.length;
    } catch (e) {
      if (isErrno(e, "ENOENT")) {
        data = emptyData();
      } else if (e instanceof SyntaxError) {
        const aside = `${this.file}.corrupt-${Date.now()}`;
        console.error(`[store] ${this.file} is not valid JSON; moved it to ${aside} and starting fresh.`);
        await fs.rename(this.file, aside).catch(() => {});
        data = emptyData();
      } else {
        throw e;
      }
    }

    if (data.messages.length === 0 && this.seedDemo) {
      data.messages = buildDemoMessages().map((d) => ({
        ...d,
        id: newId(),
        reports: 0,
        removalRequested: false,
        starred: false,
        ipHash: null,
        deviceHash: null,
        searchText: buildSearchText(d),
        moderation: null,
      }));
      dirty = true;
    }
    if (dirty) await this.writeToDisk(data);
    return data;
  }

  private async writeToDisk(data: FileData): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${newId(6)}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(data), "utf8");
      await fs.rename(tmp, this.file);
    } catch (e) {
      await fs.unlink(tmp).catch(() => {});
      throw e;
    }
  }

  /** Runs `fn` under the write lock, then persists. On failure the cache is dropped and reloaded next time. */
  private mutate<T>(fn: (data: FileData) => { result: T; changed: boolean }): Promise<T> {
    const run = async () => {
      const data = await this.load();
      const { result, changed } = fn(data);
      if (changed) {
        try {
          await this.writeToDisk(data);
        } catch (e) {
          this.data = null;
          throw e;
        }
      }
      return result;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private find(data: FileData, id: string): AdminRecord | undefined {
    return data.messages.find((m) => m.id === id);
  }

  private findPublished(data: FileData, id: string): AdminRecord | undefined {
    const m = this.find(data, id);
    return m?.status === "published" ? m : undefined;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  create(input: NewMessage): Promise<PublicMessage> {
    return this.mutate((data) => {
      let id = newId();
      while (this.find(data, id)) id = newId();
      const record: AdminRecord = {
        id,
        title: input.title,
        toName: input.toName,
        school: input.school,
        body: input.body,
        fromName: input.fromName,
        likes: 0,
        createdAt: new Date().toISOString(),
        variant: isValidVariant(input.variant) ? input.variant : variantFor(id),
        inMemory: input.inMemory,
        status: input.status,
        reports: 0,
        removalRequested: false,
        reviewReason: input.reviewReason,
        starred: false,
        surpriseOptIn: input.surpriseOptIn,
        contact: input.surpriseOptIn ? input.contact : null,
        ipHash: input.ipHash,
        deviceHash: input.deviceHash,
        searchText: buildSearchText(input),
        moderation: input.moderation,
      };
      data.messages.push(record);
      return { result: toPublic(record), changed: true };
    });
  }

  async get(id: string): Promise<PublicMessage | null> {
    const data = await this.load();
    const m = this.findPublished(data, id);
    return m ? toPublic(m) : null;
  }

  async list(q: ListQuery): Promise<ListResult> {
    const data = await this.load();
    const limit = clampLimit(q.limit);
    const tokens = q.q ? tokenizeQuery(q.q) : [];
    const matching = data.messages.filter(
      (m) => m.status === "published" && (tokens.length === 0 || matchesQuery(m.searchText, tokens)),
    );
    const total = matching.length;

    if (q.sort === "top") {
      const cursor = decodeCursor(q.cursor, "top");
      const offset = cursor?.k === "t" ? cursor.o : 0;
      const sorted = matching.sort(compareTop);
      const page = sorted.slice(offset, offset + limit);
      const next = offset + limit < sorted.length ? encodeCursor({ k: "t", o: offset + limit }) : null;
      return { items: page.map(toPublic), nextCursor: next, total };
    }

    const cursor = decodeCursor(q.cursor, "new");
    let sorted = matching.sort(compareNew);
    if (cursor?.k === "n") {
      const { t, i } = cursor;
      sorted = sorted.filter((m) => m.createdAt < t || (m.createdAt === t && m.id < i));
    }
    const page = sorted.slice(0, limit);
    const last = page[page.length - 1];
    const next =
      sorted.length > limit && last ? encodeCursor({ k: "n", t: last.createdAt, i: last.id }) : null;
    return { items: page.map(toPublic), nextCursor: next, total };
  }

  async count(): Promise<number> {
    const data = await this.load();
    return data.messages.reduce((n, m) => (m.status === "published" ? n + 1 : n), 0);
  }

  toggleLike(id: string, voterHash: string, like: boolean): Promise<LikeResult | null> {
    return this.mutate<LikeResult | null>((data) => {
      const m = this.findPublished(data, id);
      if (!m) return { result: null, changed: false };
      const voters = data.likes[id] ?? [];
      const has = voters.includes(voterHash);
      let changed = false;
      if (like && !has) {
        data.likes[id] = [...voters, voterHash];
        m.likes += 1;
        changed = true;
      } else if (!like && has) {
        data.likes[id] = voters.filter((v) => v !== voterHash);
        m.likes = Math.max(0, m.likes - 1);
        changed = true;
      }
      return { result: { likes: m.likes, liked: like }, changed };
    });
  }

  report(
    id: string,
    reporterHash: string,
    reason: ReportReason,
    note: string | null,
  ): Promise<{ hidden: boolean } | null> {
    return this.mutate<{ hidden: boolean } | null>((data) => {
      const m = this.find(data, id);
      if (!m) return { result: null, changed: false };
      const entries = (data.reports[id] ??= []);
      const prev = entries.find((r) => r.by === reporterHash);
      const done = (changed: boolean) => ({ result: { hidden: m.status !== "published" }, changed });

      if (reason === "removal_request") {
        // Each reporter can escalate to a removal request once.
        if (prev?.reason === "removal_request") return done(false);
        if (prev) {
          prev.reason = reason;
          prev.note = note ?? prev.note;
        } else {
          entries.push({ by: reporterHash, reason, note, at: new Date().toISOString() });
        }
        m.removalRequested = true;
        if (m.status !== "hidden") {
          m.status = "pending";
          m.reviewReason = "removal_request";
        }
        return done(true);
      }

      if (prev) return done(false);
      entries.push({ by: reporterHash, reason, note, at: new Date().toISOString() });
      const before = m.reports;
      m.reports = before + 1;
      // Only when crossing the threshold, so a moderator re-publishing it sticks.
      if (m.status === "published" && before < this.threshold && m.reports >= this.threshold) {
        m.status = "pending";
        m.reviewReason = "reports";
      }
      return done(true);
    });
  }

  async countRecent(o: RecentQuery): Promise<number> {
    if (!o.ipHash && !o.deviceHash) return 0;
    const data = await this.load();
    const since = new Date(o.sinceMs).toISOString();
    return data.messages.reduce(
      (n, m) =>
        m.createdAt >= since &&
        (!o.ipHash || m.ipHash === o.ipHash) &&
        (!o.deviceHash || m.deviceHash === o.deviceHash)
          ? n + 1
          : n,
      0,
    );
  }

  async adminList(o: AdminListOptions): Promise<AdminListResult> {
    const data = await this.load();
    const counts = emptyCounts();
    for (const m of data.messages) {
      for (const f of Object.keys(counts) as AdminFilter[]) if (matchesFilter(m, f)) counts[f]++;
    }

    const q = o.q?.trim() ?? "";
    const tokens = q ? tokenizeQuery(q) : [];
    const needle = normalizeContact(q) ?? q.toLowerCase();
    const items = data.messages.filter((m) => {
      if (!matchesFilter(m, o.filter)) return false;
      if (!q) return true;
      return (
        m.id === q ||
        (!!m.contact && m.contact.includes(needle)) ||
        (tokens.length > 0 && matchesQuery(m.searchText, tokens))
      );
    });
    items.sort(
      o.filter === "pending"
        ? compareOld
        : o.filter === "reported"
          ? (a, b) => b.reports - a.reports || compareNew(a, b)
          : compareNew,
    );
    const offset = clampOffset(o.offset);
    const limit = clampLimit(o.limit, MAX_ADMIN_PAGE_SIZE);
    return {
      items: items.slice(offset, offset + limit).map(copy),
      total: items.length,
      counts,
    };
  }

  adminUpdate(id: string, patch: AdminPatch): Promise<boolean> {
    return this.mutate((data) => {
      const m = this.find(data, id);
      if (!m) return { result: false, changed: false };
      if (patch.status) {
        m.status = patch.status;
        if (patch.status === "published") m.reviewReason = null;
      }
      if (typeof patch.starred === "boolean") m.starred = patch.starred;
      return { result: true, changed: true };
    });
  }

  adminDelete(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const idx = data.messages.findIndex((x) => x.id === id);
      if (idx === -1) return { result: false, changed: false };
      data.messages.splice(idx, 1);
      delete data.likes[id];
      delete data.reports[id];
      return { result: true, changed: true };
    });
  }

  async adminExport(filter: ExportFilter): Promise<AdminRecord[]> {
    const data = await this.load();
    return data.messages
      .filter((m) => matchesFilter(m, filter))
      .sort(compareNew)
      .map(copy);
  }
}
