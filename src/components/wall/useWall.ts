"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMessages } from "@/lib/api-client";
import { track } from "@/lib/track";
import type { ListResult, PublicMessage, SortMode } from "@/lib/types";
import { MIN_QUERY, PAGE_SIZE, effectiveQuery, mergeUnique, wallSearchUrl } from "./wall-utils";

export type WallStatus = "idle" | "loading" | "loading-more" | "error";

export interface WallState {
  items: PublicMessage[];
  total: number;
  nextCursor: string | null;
  sort: SortMode;
  /** What's typed in the search box right now. */
  query: string;
  /** The query the current items belong to ("" = the whole wall). */
  appliedQuery: string;
  status: WallStatus;
  /** What failed when status is "error" (the retry banner re-runs it). */
  failed: "list" | "more" | null;
}

export interface WallApi extends WallState {
  /** Debounced (300ms); `immediate` skips the wait (Enter, clear button). */
  setQuery: (q: string, opts?: { immediate?: boolean }) => void;
  setSort: (sort: SortMode) => void;
  loadMore: () => void;
  retry: () => void;
  /** A letter just published by this visitor. */
  prepend: (m: PublicMessage) => void;
  /** A letter that is no longer public (e.g. hidden after a removal request). */
  remove: (id: string) => void;
}

const DEBOUNCE_MS = 300;

type Retry = { kind: "list"; q: string; sort: SortMode } | { kind: "more" };

function syncUrl(q: string) {
  const url = wallSearchUrl(window.location, q);
  const current = window.location.pathname + window.location.search + window.location.hash;
  // `null` state: Next.js merges its own router state into native history calls.
  if (url && url !== current) window.history.replaceState(null, "", url);
}

export function useWall(initial: ListResult, initialQuery = ""): WallApi {
  const [state, setState] = useState<WallState>(() => ({
    items: initial.items,
    total: initial.total,
    nextCursor: initial.nextCursor,
    sort: "new",
    query: initialQuery,
    appliedQuery: initialQuery.trim(),
    status: "idle",
    failed: null,
  }));

  // Latest committed state for timers/handlers.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const ctrlRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  /** The list (not load-more) request in flight, if any. */
  const listReqRef = useRef<{ q: string; sort: SortMode } | null>(null);
  const retryRef = useRef<Retry | null>(null);
  const trackedRef = useRef("");

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
    },
    [],
  );

  const fetchList = useCallback((q: string, sort: SortMode) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const seq = ++seqRef.current;
    listReqRef.current = { q, sort };
    setState((s) => ({ ...s, sort, status: "loading", failed: null }));

    fetchMessages({ q, sort, limit: PAGE_SIZE }, ctrl.signal).then(
      (res) => {
        if (seq !== seqRef.current) return;
        ctrlRef.current = null;
        listReqRef.current = null;
        retryRef.current = null;
        setState((s) => ({
          ...s,
          items: res.items,
          total: res.total,
          nextCursor: res.nextCursor,
          appliedQuery: q,
          status: "idle",
          failed: null,
        }));
        syncUrl(q);
        if (q && trackedRef.current !== q)
          track("search", { q_length: q.length, total: res.total });
        trackedRef.current = q;
      },
      () => {
        if (seq !== seqRef.current || ctrl.signal.aborted) return;
        ctrlRef.current = null;
        listReqRef.current = null;
        retryRef.current = { kind: "list", q, sort };
        setState((s) => ({ ...s, status: "error", failed: "list" }));
      },
    );
  }, []);

  const runQuery = useCallback(
    (q: string) => {
      const t = q.trim();
      if (t && t.length < MIN_QUERY) return; // one letter: keep what's shown
      const s = stateRef.current;
      const inflight = listReqRef.current;
      const settled = inflight ? inflight.q === t : t === s.appliedQuery && s.failed !== "list";
      if (settled) return;
      fetchList(t, s.sort);
    },
    [fetchList],
  );

  const setQuery = useCallback(
    (q: string, opts?: { immediate?: boolean }) => {
      setState((s) => ({ ...s, query: q }));
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (opts?.immediate) {
        runQuery(q);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runQuery(q);
      }, DEBOUNCE_MS);
    },
    [runQuery],
  );

  const setSort = useCallback(
    (sort: SortMode) => {
      const s = stateRef.current;
      if (sort === s.sort && s.status !== "error") return;
      const base = listReqRef.current?.q ?? s.appliedQuery;
      fetchList(effectiveQuery(s.query, base), sort);
    },
    [fetchList],
  );

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    const canLoad = s.status === "idle" || (s.status === "error" && s.failed === "more");
    if (!s.nextCursor || !canLoad) return;

    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const seq = ++seqRef.current;
    const { nextCursor: cursor, appliedQuery: q, sort } = s;
    setState((p) => ({ ...p, status: "loading-more", failed: null }));
    track("load_more", { loaded: s.items.length, q_length: q.length, sort });

    fetchMessages({ q, sort, cursor, limit: PAGE_SIZE }, ctrl.signal).then(
      (res) => {
        if (seq !== seqRef.current) return;
        ctrlRef.current = null;
        retryRef.current = null;
        setState((p) => ({
          ...p,
          items: mergeUnique(p.items, res.items),
          nextCursor: res.nextCursor,
          total: res.total,
          status: "idle",
        }));
      },
      () => {
        if (seq !== seqRef.current || ctrl.signal.aborted) return;
        ctrlRef.current = null;
        retryRef.current = { kind: "more" };
        setState((p) => ({ ...p, status: "error", failed: "more" }));
      },
    );
  }, []);

  const retry = useCallback(() => {
    const r = retryRef.current;
    if (!r) return;
    if (r.kind === "list") fetchList(r.q, r.sort);
    else loadMore();
  }, [fetchList, loadMore]);

  const prepend = useCallback((m: PublicMessage) => {
    setState((s) =>
      s.items.some((x) => x.id === m.id) ? s : { ...s, items: [m, ...s.items], total: s.total + 1 },
    );
  }, []);

  const remove = useCallback((id: string) => {
    setState((s) =>
      s.items.some((x) => x.id === id)
        ? { ...s, items: s.items.filter((x) => x.id !== id), total: Math.max(0, s.total - 1) }
        : s,
    );
  }, []);

  return { ...state, setQuery, setSort, loadMore, retry, prepend, remove };
}
