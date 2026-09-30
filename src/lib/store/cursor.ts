// Opaque pagination cursors (base64url JSON). Anything malformed decodes to null,
// which callers treat as "first page".

import type { SortMode } from "../types";

export type Cursor =
  | { k: "n"; t: string; i: string } // "new": last item's createdAt (ISO) + id
  | { k: "t"; o: number }; // "top": offset

const MAX_CURSOR_LENGTH = 200;
const MAX_OFFSET = 100_000;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined, sort: SortMode): Cursor | null {
  if (!raw || raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (sort === "new" && c.k === "n") {
    if (typeof c.t !== "string" || typeof c.i !== "string") return null;
    if (c.i.length > 64 || !Number.isFinite(Date.parse(c.t))) return null;
    return { k: "n", t: new Date(c.t).toISOString(), i: c.i };
  }
  if (sort === "top" && c.k === "t") {
    if (typeof c.o !== "number" || !Number.isInteger(c.o) || c.o < 0 || c.o > MAX_OFFSET) return null;
    return { k: "t", o: c.o };
  }
  return null;
}
