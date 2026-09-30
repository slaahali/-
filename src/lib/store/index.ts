import { getDatabaseUrl, getReadCacheTtlMs, isFileStoreAllowed } from "../server-config";
import { FileStore } from "./file-store";
import { PostgresStore } from "./postgres-store";
import { CachedStore, TtlCache } from "./read-cache";
import type { MessageStore } from "./types";
import { UnavailableStore } from "./unavailable-store";

export type { MessageStore } from "./types";

// Kept on globalThis so dev hot reloads reuse the same store (and file cache / pool).
const g = globalThis as typeof globalThis & { __letters_store?: MessageStore };

const STALE_IF_ERROR_MS = 2 * 60_000;

function createStore(): MessageStore {
  if (getDatabaseUrl()) return new PostgresStore();
  // Serverless without a database: a per-instance /tmp file would accept letters
  // and lose them, so only an explicit demo gets the file store.
  return isFileStoreAllowed() ? new FileStore() : new UnavailableStore();
}

/**
 * Postgres when DATABASE_URL (or POSTGRES_URL) is set, else the JSON file store
 * in DATA_DIR — except on serverless hosts, where no database means writes 503.
 * Hot public reads go through a short per-instance cache.
 */
export function getStore(): MessageStore {
  if (!g.__letters_store) {
    const cache = new TtlCache({ ttlMs: getReadCacheTtlMs(), staleMs: STALE_IF_ERROR_MS });
    g.__letters_store = new CachedStore(createStore(), cache);
  }
  return g.__letters_store;
}
