import { getDatabaseUrl } from "../server-config";
import { FileStore } from "./file-store";
import { PostgresStore } from "./postgres-store";
import type { MessageStore } from "./types";

export type { MessageStore } from "./types";

// Kept on globalThis so dev hot reloads reuse the same store (and file cache / pool).
const g = globalThis as typeof globalThis & { __letters_store?: MessageStore };

/** Postgres when DATABASE_URL is set, else the JSON file store in DATA_DIR. */
export function getStore(): MessageStore {
  if (!g.__letters_store) {
    g.__letters_store = getDatabaseUrl() ? new PostgresStore() : new FileStore();
  }
  return g.__letters_store;
}
