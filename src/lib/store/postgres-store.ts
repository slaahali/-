// Postgres store (production). Uses the `postgres` driver with tagged-template
// queries only — user input is always a bound parameter, never spliced into SQL.

import postgres from "postgres";
import { newId, variantFor } from "../ids";
import { getDatabaseUrl, getReportHideThreshold } from "../server-config";
import { buildSearchText, tokenizeQuery } from "../text/normalize";
import { normalizeContact } from "../validation";
import type {
  AdminFilter,
  LikeResult,
  ListQuery,
  ListResult,
  MessageStatus,
  ModerationRecord,
  PublicMessage,
  ReportReason,
  TeacherTitle,
} from "../types";
import { decodeCursor, encodeCursor } from "./cursor";
import { SCHEMA_VERSION, schemaStatements } from "./schema";
import {
  MAX_ADMIN_PAGE_SIZE,
  clampLimit,
  clampOffset,
  emptyCounts,
  escapeLike,
  isValidVariant,
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

type Sql = postgres.Sql;

interface Row {
  id: string;
  title: string | null;
  to_name: string;
  school: string | null;
  body: string;
  from_name: string | null;
  likes: number;
  created_at: Date;
  variant: number;
  in_memory: boolean;
}

interface FullRow extends Row {
  status: string;
  reports: number;
  removal_requested: boolean;
  review_reason: string | null;
  starred: boolean;
  surprise_opt_in: boolean;
  contact: string | null;
  ip_hash: string | null;
  device_hash: string | null;
  search_text: string;
  moderation: ModerationRecord | null;
}

// Survive dev hot reloads without leaking connection pools.
const globalForPg = globalThis as typeof globalThis & {
  __letters_pg?: { sql: Sql; url: string };
};

function getClient(): Sql {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  const cached = globalForPg.__letters_pg;
  if (cached && cached.url === url) return cached.sql;
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required for pgbouncer / Supabase transaction pooler.
    prepare: false,
    onnotice: () => {},
  });
  globalForPg.__letters_pg = { sql, url };
  return sql;
}

const STATUSES: readonly MessageStatus[] = ["published", "pending", "hidden"];

function toPublicRow(r: Row): PublicMessage {
  return {
    id: r.id,
    title: (r.title as TeacherTitle | null) ?? null,
    toName: r.to_name,
    school: r.school,
    body: r.body,
    fromName: r.from_name,
    likes: Number(r.likes),
    createdAt: new Date(r.created_at).toISOString(),
    variant: Number(r.variant),
    inMemory: r.in_memory === true,
  };
}

function toRecord(r: FullRow): AdminRecord {
  return {
    ...toPublicRow(r),
    status: STATUSES.includes(r.status as MessageStatus) ? (r.status as MessageStatus) : "hidden",
    reports: Number(r.reports),
    removalRequested: r.removal_requested === true,
    reviewReason: r.review_reason,
    starred: r.starred === true,
    surpriseOptIn: r.surprise_opt_in === true,
    contact: r.contact,
    ipHash: r.ip_hash,
    deviceHash: r.device_hash,
    searchText: r.search_text,
    moderation: r.moderation ?? null,
  };
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: unknown }).code === "23505";
}

export class PostgresStore implements MessageStore {
  private schemaReady: Promise<void> | null = null;
  private readonly threshold: number;

  constructor(opts: { reportHideThreshold?: number } = {}) {
    this.threshold = opts.reportHideThreshold ?? getReportHideThreshold();
  }

  /** Applies db/schema.sql once per process. Retries on the next call if it fails. */
  ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.applySchema().catch((e) => {
        this.schemaReady = null;
        throw e;
      });
    }
    return this.schemaReady;
  }

  private async applySchema(): Promise<void> {
    const sql = getClient();
    // Already current? Skip the DDL (and its table locks) entirely.
    const [cur] = await sql<{ v: string | null }[]>`
      select obj_description(to_regclass('messages'), 'pg_class') as v`;
    if (SCHEMA_VERSION && cur?.v === SCHEMA_VERSION) return;

    try {
      await sql.begin(async (tx) => {
        // Serialise concurrent cold starts (CREATE ... IF NOT EXISTS can race).
        await tx`select pg_advisory_xact_lock(${7_231_005})`;
        for (const st of schemaStatements()) {
          if (!st.optional) {
            await tx.unsafe(st.sql);
            continue;
          }
          try {
            await tx.savepoint((sp) => sp.unsafe(st.sql));
          } catch (e) {
            console.warn(`[store] optional schema step skipped: ${(e as Error).message}`);
          }
        }
      });
    } catch (e) {
      // No DDL rights (schema applied separately with `npm run db:schema`)? Fine if the tables exist.
      const [row] = await sql<{ ok: boolean }[]>`
        select to_regclass('messages') is not null
           and to_regclass('message_likes') is not null
           and to_regclass('message_reports') is not null as ok`;
      if (!row?.ok) throw e;
      console.warn(`[store] could not apply schema (${(e as Error).message}); tables exist, continuing.`);
    }
  }

  private async db(): Promise<Sql> {
    await this.ensureSchema();
    return getClient();
  }

  private searchPatterns(q: string | undefined): string[] {
    return q ? tokenizeQuery(q).map((t) => `%${escapeLike(t)}%`) : [];
  }

  async create(input: NewMessage): Promise<PublicMessage> {
    const sql = await this.db();
    const searchText = buildSearchText(input);
    const moderation = input.moderation
      ? sql.json(input.moderation as unknown as postgres.JSONValue)
      : null;
    const contact = input.surpriseOptIn ? input.contact : null;
    for (let attempt = 0; ; attempt++) {
      const id = newId();
      const variant = isValidVariant(input.variant) ? input.variant : variantFor(id);
      try {
        // created_at comes from JS (ms precision) so keyset cursors round-trip exactly.
        const [row] = await sql<Row[]>`
          insert into messages
            (id, title, to_name, school, body, from_name, variant, in_memory,
             status, review_reason, surprise_opt_in, contact,
             ip_hash, device_hash, search_text, moderation, created_at)
          values
            (${id}, ${input.title}, ${input.toName}, ${input.school}, ${input.body}, ${input.fromName},
             ${variant}, ${input.inMemory},
             ${input.status}, ${input.reviewReason}, ${input.surpriseOptIn}, ${contact},
             ${input.ipHash}, ${input.deviceHash}, ${searchText}, ${moderation}, ${new Date()})
          returning id, title, to_name, school, body, from_name, likes, created_at, variant, in_memory`;
        return toPublicRow(row);
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 3) continue;
        throw e;
      }
    }
  }

  async get(id: string): Promise<PublicMessage | null> {
    const sql = await this.db();
    const [row] = await sql<Row[]>`
      select id, title, to_name, school, body, from_name, likes, created_at, variant, in_memory
      from messages
      where id = ${id} and status = 'published'`;
    return row ? toPublicRow(row) : null;
  }

  async list(q: ListQuery): Promise<ListResult> {
    const sql = await this.db();
    const limit = clampLimit(q.limit);
    const patterns = this.searchPatterns(q.q);
    const search = patterns.length
      ? sql`and search_text ilike all(${sql.array(patterns)}::text[])`
      : sql``;

    const totalQuery = sql<{ n: number }[]>`
      select count(*)::int as n from messages where status = 'published' ${search}`;

    let rowsQuery: Promise<Row[]>;
    let nextFrom: (rows: Row[]) => string | null;

    if (q.sort === "top") {
      const cursor = decodeCursor(q.cursor, "top");
      const offset = cursor?.k === "t" ? cursor.o : 0;
      rowsQuery = sql<Row[]>`
        select id, title, to_name, school, body, from_name, likes, created_at, variant, in_memory
        from messages
        where status = 'published' ${search}
        order by likes desc, created_at desc, id desc
        limit ${limit + 1} offset ${offset}`;
      nextFrom = (rows) => (rows.length > limit ? encodeCursor({ k: "t", o: offset + limit }) : null);
    } else {
      const cursor = decodeCursor(q.cursor, "new");
      const after =
        cursor?.k === "n" ? sql`and (created_at, id) < (${new Date(cursor.t)}, ${cursor.i})` : sql``;
      rowsQuery = sql<Row[]>`
        select id, title, to_name, school, body, from_name, likes, created_at, variant, in_memory
        from messages
        where status = 'published' ${search} ${after}
        order by created_at desc, id desc
        limit ${limit + 1}`;
      nextFrom = (rows) => {
        if (rows.length <= limit) return null;
        const last = rows[limit - 1];
        return encodeCursor({ k: "n", t: new Date(last.created_at).toISOString(), i: last.id });
      };
    }

    const [rows, [total]] = await Promise.all([rowsQuery, totalQuery]);
    return {
      items: rows.slice(0, limit).map(toPublicRow),
      nextCursor: nextFrom(rows),
      total: total?.n ?? 0,
    };
  }

  async count(): Promise<number> {
    const sql = await this.db();
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from messages where status = 'published'`;
    return row?.n ?? 0;
  }

  async toggleLike(id: string, voterHash: string, like: boolean): Promise<LikeResult | null> {
    const sql = await this.db();
    return sql.begin(async (tx) => {
      const [m] = await tx<{ likes: number }[]>`
        select likes from messages where id = ${id} and status = 'published'`;
      if (!m) return null;
      if (like) {
        const ins = await tx`
          insert into message_likes (message_id, voter_hash) values (${id}, ${voterHash})
          on conflict do nothing
          returning 1`;
        if (ins.count === 0) return { likes: Number(m.likes), liked: true };
        const [u] = await tx<{ likes: number }[]>`
          update messages set likes = likes + 1 where id = ${id} returning likes`;
        return { likes: Number(u.likes), liked: true };
      }
      const del = await tx`
        delete from message_likes where message_id = ${id} and voter_hash = ${voterHash}
        returning 1`;
      if (del.count === 0) return { likes: Number(m.likes), liked: false };
      const [u] = await tx<{ likes: number }[]>`
        update messages set likes = greatest(likes - 1, 0) where id = ${id} returning likes`;
      return { likes: Number(u.likes), liked: false };
    });
  }

  async report(
    id: string,
    reporterHash: string,
    reason: ReportReason,
    note: string | null,
  ): Promise<{ hidden: boolean } | null> {
    const sql = await this.db();
    const threshold = this.threshold;
    return sql.begin(async (tx) => {
      const [m] = await tx<{ status: string }[]>`
        select status from messages where id = ${id} for update`;
      if (!m) return null;
      const unchanged = { hidden: m.status !== "published" };
      const [prev] = await tx<{ reason: string | null }[]>`
        select reason from message_reports
        where message_id = ${id} and reporter_hash = ${reporterHash}`;

      if (reason === "removal_request") {
        // Each reporter can escalate to a removal request once.
        if (prev?.reason === "removal_request") return unchanged;
        if (prev) {
          await tx`
            update message_reports set reason = ${reason}, note = coalesce(${note}, note)
            where message_id = ${id} and reporter_hash = ${reporterHash}`;
        } else {
          await tx`
            insert into message_reports (message_id, reporter_hash, reason, note)
            values (${id}, ${reporterHash}, ${reason}, ${note})`;
        }
        const [u] = await tx<{ status: string }[]>`
          update messages
          set removal_requested = true,
              status = case when status = 'hidden' then status else 'pending' end,
              review_reason = case when status = 'hidden' then review_reason else 'removal_request' end
          where id = ${id}
          returning status`;
        return { hidden: u.status !== "published" };
      }

      if (prev) return unchanged;
      await tx`
        insert into message_reports (message_id, reporter_hash, reason, note)
        values (${id}, ${reporterHash}, ${reason}, ${note})`;
      // Back to review only when crossing the threshold, so a moderator re-publishing it sticks.
      const [u] = await tx<{ status: string }[]>`
        update messages
        set reports = reports + 1,
            status = case
              when status = 'published' and reports < ${threshold} and reports + 1 >= ${threshold}
              then 'pending' else status end,
            review_reason = case
              when status = 'published' and reports < ${threshold} and reports + 1 >= ${threshold}
              then 'reports' else review_reason end
        where id = ${id}
        returning status`;
      return { hidden: u.status !== "published" };
    });
  }

  async countRecent(o: RecentQuery): Promise<number> {
    if (!o.ipHash && !o.deviceHash) return 0;
    const sql = await this.db();
    const byIp = o.ipHash ? sql`and ip_hash = ${o.ipHash}` : sql``;
    const byDevice = o.deviceHash ? sql`and device_hash = ${o.deviceHash}` : sql``;
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from messages
      where created_at >= ${new Date(o.sinceMs)} ${byIp} ${byDevice}`;
    return row?.n ?? 0;
  }

  private filterCond(sql: Sql, f: AdminFilter) {
    switch (f) {
      case "published":
      case "pending":
      case "hidden":
        return sql`status = ${f}`;
      case "reported":
        return sql`reports > 0`;
      case "removal":
        return sql`removal_requested`;
      case "starred":
        return sql`starred`;
      case "surprise":
        return sql`surprise_opt_in`;
      default:
        return sql`true`;
    }
  }

  async adminList(o: AdminListOptions): Promise<AdminListResult> {
    const sql = await this.db();
    const limit = clampLimit(o.limit, MAX_ADMIN_PAGE_SIZE);
    const offset = clampOffset(o.offset);
    const q = o.q?.trim() ?? "";
    const patterns = this.searchPatterns(q);
    const contactLike = `%${escapeLike(normalizeContact(q) ?? q.toLowerCase())}%`;

    const where = this.filterCond(sql, o.filter);
    const searchCond = !q
      ? sql``
      : patterns.length
        ? sql`and (id = ${q} or contact like ${contactLike}
                   or search_text ilike all(${sql.array(patterns)}::text[]))`
        : sql`and (id = ${q} or contact like ${contactLike})`;
    const order =
      o.filter === "pending"
        ? sql`order by created_at asc, id asc`
        : o.filter === "reported"
          ? sql`order by reports desc, created_at desc, id desc`
          : sql`order by created_at desc, id desc`;

    const [rows, [total], [c]] = await Promise.all([
      sql<FullRow[]>`
        select * from messages
        where ${where} ${searchCond}
        ${order}
        limit ${limit} offset ${offset}`,
      sql<{ n: number }[]>`
        select count(*)::int as n from messages where ${where} ${searchCond}`,
      sql<Record<string, number>[]>`
        select count(*)::int as n_all,
               count(*) filter (where status = 'published')::int as n_published,
               count(*) filter (where status = 'pending')::int as n_pending,
               count(*) filter (where status = 'hidden')::int as n_hidden,
               count(*) filter (where reports > 0)::int as n_reported,
               count(*) filter (where removal_requested)::int as n_removal,
               count(*) filter (where starred)::int as n_starred,
               count(*) filter (where surprise_opt_in)::int as n_surprise
        from messages`,
    ]);

    const counts = emptyCounts();
    for (const f of Object.keys(counts) as AdminFilter[]) counts[f] = Number(c?.[`n_${f}`] ?? 0);
    return { items: rows.map(toRecord), total: total?.n ?? 0, counts };
  }

  async adminUpdate(id: string, patch: AdminPatch): Promise<boolean> {
    const sql = await this.db();
    const status = patch.status ?? null;
    const starred = typeof patch.starred === "boolean" ? patch.starred : null;
    const res = await sql`
      update messages
      set status = coalesce(${status}::text, status),
          starred = coalesce(${starred}::boolean, starred),
          review_reason = case when ${status}::text = 'published' then null else review_reason end
      where id = ${id}
      returning 1`;
    return res.count > 0;
  }

  async adminDelete(id: string): Promise<boolean> {
    const sql = await this.db();
    const res = await sql`delete from messages where id = ${id} returning 1`;
    return res.count > 0;
  }

  async adminExport(filter: ExportFilter): Promise<AdminRecord[]> {
    const sql = await this.db();
    const rows = await sql<FullRow[]>`
      select * from messages
      where ${this.filterCond(sql, filter)}
      order by created_at desc, id desc`;
    return rows.map(toRecord);
  }
}
