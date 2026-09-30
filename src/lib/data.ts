// Data access for Server Components (pages, metadata, OG images). Only ever
// returns PublicMessage-shaped data. The hot reads are served from the store's
// short per-instance cache (see store/read-cache.ts).
//
// Failures: the wall, scene and counter degrade to empty (the page still
// renders); a single letter and the search summary THROW DataUnavailableError,
// so a database blip becomes a 500 (retried by crawlers, never cached) instead
// of a 404 or a wrong preview image cached by CDNs and social platforms.

import { connection } from "next/server";
import { isValidId } from "./ids";
import { clampChars, logError } from "./request";
import { getStore } from "./store";
import { DataUnavailableError } from "./store/errors";
import type { ListResult, PublicMessage } from "./types";

export { DataUnavailableError } from "./store/errors";

export const INITIAL_WALL_SIZE = 18;
export const MAX_QUERY_CHARS = 60;

/** Trimmed, at most 60 characters — same rule as GET /api/messages. */
export function normalizeQuery(q: string | null | undefined): string {
  return clampChars((q ?? "").trim(), MAX_QUERY_CHARS).trim();
}

export const SCENE_SIZE = 40;

/** The newest letters for the floating 3D field (the hero shows the latest ones). */
export async function getSceneLetters(): Promise<PublicMessage[]> {
  await connection();
  try {
    return (await getStore().list({ sort: "new", limit: SCENE_SIZE })).items;
  } catch (e) {
    logError("[data] getSceneLetters failed", e);
    return [];
  }
}

/** First page of the wall (newest first), optionally filtered by a search (`/?q=`). */
export async function getInitialWall(q?: string): Promise<ListResult> {
  await connection();
  const query = normalizeQuery(q);
  try {
    return await getStore().list({ q: query || undefined, sort: "new", limit: INITIAL_WALL_SIZE });
  } catch (e) {
    logError("[data] getInitialWall failed", e);
    return { items: [], nextCursor: null, total: 0 };
  }
}

/** null only when the letter doesn't exist / isn't published; throws DataUnavailableError when the store fails. */
export async function getPublicMessage(id: string): Promise<PublicMessage | null> {
  await connection();
  if (!isValidId(id)) return null;
  try {
    return await getStore().get(id);
  } catch (e) {
    logError("[data] getPublicMessage failed", e);
    throw new DataUnavailableError("getPublicMessage");
  }
}

/** Published letters. */
export async function getTotal(): Promise<number> {
  await connection();
  try {
    return await getStore().count();
  } catch (e) {
    logError("[data] getTotal failed", e);
    return 0;
  }
}

/**
 * For the search OG image / metadata: how many letters match `q`. An empty
 * query returns the total number of published letters. Throws
 * DataUnavailableError when the store fails (a "0 letters" image must not be cached).
 */
export async function getSearchSummary(q: string | null | undefined): Promise<{ q: string; total: number }> {
  await connection();
  const query = normalizeQuery(q);
  try {
    const store = getStore();
    const total = query
      ? (await store.list({ q: query, sort: "new", limit: 1 })).total
      : await store.count();
    return { q: query, total };
  } catch (e) {
    logError("[data] getSearchSummary failed", e);
    throw new DataUnavailableError("getSearchSummary");
  }
}
