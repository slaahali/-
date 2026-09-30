// The Postgres schema, applied once per process by the Postgres store.
// Mirrors db/schema.sql verbatim (kept in the bundle so deployments don't depend
// on file tracing); schema.test.ts fails if the two drift apart.

export const SCHEMA_SQL = `-- Teacher's Day Letters — Postgres schema.
-- Idempotent: safe to run on every deploy (npm run db:schema). The app also
-- applies it once per process (src/lib/store/schema.ts mirrors this file; a test
-- keeps them in sync) and skips it when the version comment at the end matches —
-- checked again after taking the advisory lock, so only one instance migrates.
-- Databases created by older versions are migrated with ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS messages (
  id                text PRIMARY KEY,
  title             text NULL,
  to_name           text NOT NULL,
  school            text NULL,
  body              text NOT NULL,
  from_name         text NULL,
  variant           smallint NOT NULL DEFAULT 0,
  in_memory         boolean NOT NULL DEFAULT false,
  likes             integer NOT NULL DEFAULT 0,
  reports           integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'published',
  removal_requested boolean NOT NULL DEFAULT false,
  review_reason     text NULL,
  starred           boolean NOT NULL DEFAULT false,
  -- A moderator re-published it after a removal request: later ones only flag it.
  removal_kept      boolean NOT NULL DEFAULT false,
  flagged_at        timestamptz NULL,
  surprise_opt_in   boolean NOT NULL DEFAULT false,
  -- PRIVATE phone/email for the gift surprise: only admin endpoints read it.
  contact           text NULL,
  ip_hash           text NULL,
  device_hash       text NULL,
  search_text       text NOT NULL DEFAULT '',
  moderation        jsonb NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS variant smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_memory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS removal_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text NULL,
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surprise_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact text NULL,
  ADD COLUMN IF NOT EXISTS device_hash text NULL,
  ADD COLUMN IF NOT EXISTS removal_kept boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz NULL;

-- Older versions only allowed published/hidden. Replaced only when it differs;
-- NOT VALID skips re-scanning old rows (the old check was stricter anyway).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'messages'::regclass
      AND conname = 'messages_status_check'
      AND pg_get_constraintdef(oid) LIKE '%pending%'
  ) THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
    ALTER TABLE messages
      ADD CONSTRAINT messages_status_check CHECK (status IN ('published', 'pending', 'hidden')) NOT VALID;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS message_likes (
  message_id  text NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  voter_hash  text NOT NULL,
  -- Only set for likes from cookie-less clients (one per letter per IP per day).
  ip_hash     text NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, voter_hash)
);

ALTER TABLE message_likes
  ADD COLUMN IF NOT EXISTS ip_hash text NULL;

CREATE TABLE IF NOT EXISTS message_reports (
  message_id    text NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  reporter_hash text NOT NULL,
  ip_hash       text NULL,
  reason        text NULL,
  note          text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reporter_hash)
);

ALTER TABLE message_reports
  ADD COLUMN IF NOT EXISTS reason text NULL,
  ADD COLUMN IF NOT EXISTS note text NULL,
  ADD COLUMN IF NOT EXISTS ip_hash text NULL;

-- One cookie-less like per letter per IP per day.
CREATE INDEX IF NOT EXISTS message_likes_ip_idx ON message_likes (message_id, ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

-- A reporter is a device or an IP: dedupe per letter by IP too.
CREATE INDEX IF NOT EXISTS message_reports_ip_idx ON message_reports (message_id, ip_hash)
  WHERE ip_hash IS NOT NULL;

-- Daily caps on removal requests per IP / device.
CREATE INDEX IF NOT EXISTS message_reports_removal_ip_idx ON message_reports (ip_hash, created_at DESC)
  WHERE reason = 'removal_request';

CREATE INDEX IF NOT EXISTS message_reports_removal_device_idx ON message_reports (reporter_hash, created_at DESC)
  WHERE reason = 'removal_request';

-- Public wall: newest / most loved.
CREATE INDEX IF NOT EXISTS messages_status_new_idx ON messages (status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS messages_status_top_idx ON messages (status, likes DESC, created_at DESC);

-- Review queue (oldest first).
CREATE INDEX IF NOT EXISTS messages_status_queue_idx ON messages (status, created_at);

-- Submission rate limits.
CREATE INDEX IF NOT EXISTS messages_ip_recent_idx ON messages (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_device_recent_idx ON messages (device_hash, created_at DESC);

-- optional: trigram search index (skipped when the extension can't be installed)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- optional
CREATE INDEX IF NOT EXISTS messages_search_trgm_idx ON messages USING gin (search_text gin_trgm_ops);

-- Bump when this file changes so running apps re-apply it.
COMMENT ON TABLE messages IS 'teachers-day-letters schema v3';
`;

/** From the COMMENT ON TABLE at the end: when the live table carries it, nothing needs applying. */
export const SCHEMA_VERSION: string =
  /COMMENT ON TABLE messages IS '([^']+)'/.exec(SCHEMA_SQL)?.[1] ?? "";

export interface SchemaStatement {
  sql: string;
  /** Preceded by a "-- optional" comment: failures are logged, not fatal. */
  optional: boolean;
}

/**
 * Splits the schema into statements (each ends with ";" at the end of a line,
 * outside a $$-quoted DO block). scripts/db-schema.mjs uses the same rules.
 */
export function schemaStatements(source: string = SCHEMA_SQL): SchemaStatement[] {
  const out: SchemaStatement[] = [];
  let buf: string[] = [];
  let optional = false;
  let inDollar = false;
  for (const line of source.split(/\r?\n/)) {
    const t = line.trim();
    if (!inDollar && t.startsWith("--")) {
      if (buf.length === 0 && /^--\s*optional\b/i.test(t)) optional = true;
      continue;
    }
    if (!t && buf.length === 0) continue;
    buf.push(line);
    if ((line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDollar = !inDollar;
    if (!inDollar && t.endsWith(";")) {
      out.push({ sql: buf.join("\n").trim().replace(/;$/, ""), optional });
      buf = [];
      optional = false;
    }
  }
  return out;
}
