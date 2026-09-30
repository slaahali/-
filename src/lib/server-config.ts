// Server-only configuration (secrets, storage, moderation policy). Never import
// this from client components; public settings live in ./config.ts.

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

/** Postgres connection string, or null to use the local JSON file store. */
export function getDatabaseUrl(): string | null {
  return readEnv("DATABASE_URL") ?? null;
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
  return dir ? path.resolve(process.cwd(), dir) : path.join(process.cwd(), ".data");
}
