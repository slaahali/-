// Server-only configuration (secrets, storage, moderation policy). Never import
// this from client components; public settings live in ./config.ts.

import os from "node:os";
import path from "node:path";

const EXAMPLE_SALT = "change-me-to-a-long-random-string";
const FALLBACK_SALT = "tcz-teachers-day-dev-salt";

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function readInt(name: string, fallback: number, min: number): number {
  const raw = readEnv(name);
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n >= min ? n : fallback;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Serverless hosts: many short-lived instances, no shared disk. */
export function isServerless(): boolean {
  return !!(readEnv("VERCEL") || readEnv("AWS_LAMBDA_FUNCTION_NAME") || readEnv("NETLIFY"));
}

/**
 * Postgres connection string, or null to use the local JSON file store.
 * POSTGRES_URL is what the Vercel storage integrations (Neon / Supabase) inject;
 * on serverless it should be the provider's POOLED url (Supabase :6543, Neon "-pooler").
 */
export function getDatabaseUrl(): string | null {
  return readEnv("DATABASE_URL") ?? readEnv("POSTGRES_URL") ?? null;
}

const truthy = (v: string | undefined) => !!v && ["1", "true", "yes"].includes(v.toLowerCase());

/**
 * Without a database, may the JSON file store be used? Always off serverless
 * hosts; there it is per-instance and lost on scale-down, so only an explicit
 * throwaway demo (SEED_DEMO=true or ALLOW_FILE_STORE=1) gets it.
 */
export function isFileStoreAllowed(): boolean {
  if (!isServerless()) return true;
  return truthy(readEnv("ALLOW_FILE_STORE")) || truthy(readEnv("SEED_DEMO"));
}

/** Postgres pool size per instance: serverless instances each get their own pool, keep it tiny. */
export function getPgPoolMax(): number {
  return Math.min(20, readInt("PG_POOL_MAX", isServerless() ? 2 : 5, 1));
}

/**
 * How many proxies in front of the app append to X-Forwarded-For (default 1:
 * Vercel / one nginx / one load balancer). The client IP is the entry that many
 * from the right; everything left of it is client-controlled. 0 = trust no proxy
 * header at all (the app is exposed directly).
 */
export function getTrustedProxyHops(): number {
  return Math.min(10, readInt("TRUSTED_PROXY_HOPS", 1, 0));
}

/**
 * Optional single header your edge sets to the real client IP and strips from
 * incoming requests, e.g. cf-connecting-ip behind Cloudflare or x-real-ip from
 * your own nginx. Takes precedence over X-Forwarded-For.
 */
export function getClientIpHeader(): string | null {
  const v = readEnv("CLIENT_IP_HEADER")?.toLowerCase();
  return v && /^[a-z0-9-]{1,64}$/.test(v) ? v : null;
}

/** Per-instance cache for the default wall / scene / counter / letter reads. 0 disables. */
export function getReadCacheTtlMs(): number {
  return Math.min(60_000, readInt("READ_CACHE_TTL_MS", 5_000, 0));
}

let warnedSalt = false;

/** Salt for hashing IPs / device ids. Warns once when missing or left at the example value. */
export function getIpHashSalt(): string {
  const salt = readEnv("IP_HASH_SALT");
  if (!salt || salt === EXAMPLE_SALT) {
    if (!warnedSalt) {
      warnedSalt = true;
      console.warn(
        "[config] IP_HASH_SALT is not set (or still the example value). " +
          "Set a long random string so IP / device hashes can't be reversed.",
      );
    }
    return salt ?? FALLBACK_SALT;
  }
  return salt;
}

/** Bearer token for the admin API. null disables admin entirely. */
export function getAdminToken(): string | null {
  return readEnv("ADMIN_TOKEN") ?? null;
}

/** Distinct "inappropriate"/"other" reports after which a letter goes back to review. */
export function getReportHideThreshold(): number {
  return readInt("REPORT_HIDE_THRESHOLD", 3, 1);
}

export type ModerationMode = "auto" | "review_suspicious" | "review_all";

/**
 * auto              — publish whatever passes the filter
 * review_suspicious — letters the filter isn't sure about wait in /admin (default)
 * review_all        — every letter waits for a human
 */
export function getModerationMode(): ModerationMode {
  const v = readEnv("MODERATION_MODE")?.toLowerCase();
  return v === "auto" || v === "review_all" ? v : "review_suspicious";
}

/** Letters one device (voter cookie) may submit per 24h. */
export function getSubmitLimitPerDay(): number {
  return readInt("SUBMIT_LIMIT_PER_DAY", 3, 1);
}

/** Seed the file store with demo letters when it's empty. Defaults to on outside production. */
export function shouldSeedDemo(): boolean {
  const v = readEnv("SEED_DEMO")?.toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return !isProduction();
}

/** Directory for the JSON file store. */
export function getDataDir(): string {
  const dir = readEnv("DATA_DIR");
  // Serverless hosts (Vercel) only allow writes under /tmp — a throwaway demo
  // deploy then works, though data is per-instance and short-lived.
  if (!dir && isServerless()) return path.join(/*turbopackIgnore: true*/ os.tmpdir(), "letters-data");
  // turbopackIgnore: a runtime-configured folder must not pull the project into the trace.
  return dir
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
}
