// The admin token lives in sessionStorage (this tab only, gone when it closes),
// with an in-memory fallback when storage is blocked. Exposed as an external
// store so the dashboard can read it without a hydration mismatch.

import { useSyncExternalStore } from "react";
import { TOKEN_KEY } from "./admin-model";

let cached: string | null | undefined;
const listeners = new Set<() => void>();

function read(): string | null {
  if (cached === undefined) {
    try {
      cached = window.sessionStorage.getItem(TOKEN_KEY) || null;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function saveToken(token: string | null): void {
  cached = token || null;
  try {
    if (cached) window.sessionStorage.setItem(TOKEN_KEY, cached);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the in-memory copy still works for this page view */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** undefined while server-rendering / hydrating, then the token or null. */
export function useAdminToken(): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(subscribe, read, () => undefined);
}
