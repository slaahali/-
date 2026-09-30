"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fetchMessage, likeMessage } from "@/lib/api-client";
import { emitNewLetter, LETTER_HIDDEN_EVENT } from "@/lib/events";
import { toSceneLetter } from "@/lib/format";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";

/**
 * Page-wide client state shared by the hero scene, the form, the wall and the
 * letter view:
 *  - which letter is open (kept in sync with /m/:id in the address bar)
 *  - a cache of every message the page has seen (so ids can be opened instantly)
 *  - likes (optimistic, remembered per browser)
 *  - "a new letter was just published" notifications
 *  - prefilling the form from the search empty state
 */
export interface LettersContextValue {
  total: number;

  openMessage: PublicMessage | null;
  /** Opens a letter by object or id (fetches unknown ids). Updates the URL to /m/:id. */
  openLetter: (target: PublicMessage | string) => void;
  closeLetter: () => void;
  /** The wall reports its current visible order so the letter view can step prev/next. */
  setWallOrder: (ids: string[]) => void;
  neighbours: { prev: string | null; next: string | null };
  /** Add messages to the lookup cache (the wall calls this for every page it loads). */
  remember: (messages: PublicMessage[]) => void;

  /** Call after a successful publish: wall prepends it, scene flies it in, counter bumps. */
  addMessage: (m: PublicMessage) => void;
  /** Subscribe to addMessage. Returns an unsubscribe function. */
  onNewMessage: (fn: (m: PublicMessage) => void) => () => void;

  isLiked: (id: string) => boolean;
  /** Current like count, preferring fresher numbers we got from the server. */
  likeCount: (m: PublicMessage) => number;
  toggleLike: (m: PublicMessage) => Promise<void>;

  /** Set by the search empty state ("اكتب له رسالة"); the form watches `nonce`. */
  prefill: { toName: string; nonce: number } | null;
  requestPrefill: (toName: string) => void;

  /** Letters that stopped being public during this visit (e.g. removal requests). */
  hiddenIds: ReadonlySet<string>;
}

const LettersContext = createContext<LettersContextValue | null>(null);

export function useLetters(): LettersContextValue {
  const ctx = useContext(LettersContext);
  if (!ctx) throw new Error("useLetters must be used inside <LettersProvider>");
  return ctx;
}

const LIKED_KEY = "tcz_liked_v1";
const PERMALINK_RE = /^\/m\/([A-Za-z0-9_-]{4,32})\/?$/;

function readLiked(): Set<string> {
  try {
    const raw = window.localStorage.getItem(LIKED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeLiked(s: Set<string>) {
  try {
    window.localStorage.setItem(LIKED_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    /* private mode / storage full — likes still work for this visit */
  }
}

/** Liked ids live in localStorage; the server (and first client render) sees none. */
const EMPTY_LIKED: ReadonlySet<string> = new Set();
let likedSnapshot: ReadonlySet<string> | null = null;
const likedListeners = new Set<() => void>();

const likedStore = {
  subscribe(fn: () => void) {
    likedListeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LIKED_KEY) return;
      likedSnapshot = null; // another tab changed it
      fn();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      likedListeners.delete(fn);
      window.removeEventListener("storage", onStorage);
    };
  },
  get(): ReadonlySet<string> {
    if (!likedSnapshot) likedSnapshot = readLiked();
    return likedSnapshot;
  },
  getServer(): ReadonlySet<string> {
    return EMPTY_LIKED;
  },
  update(id: string, isLiked: boolean) {
    const next = new Set(likedStore.get());
    if (isLiked) next.add(id);
    else next.delete(id);
    likedSnapshot = next;
    writeLiked(next);
    for (const l of likedListeners) l();
  },
};

export function LettersProvider({
  children,
  initialTotal,
  initialMessages,
  initialOpen = null,
}: {
  children: ReactNode;
  initialTotal: number;
  initialMessages: PublicMessage[];
  /** Set when the page was loaded from a /m/:id permalink. */
  initialOpen?: PublicMessage | null;
}) {
  const [total, setTotal] = useState(initialTotal);
  const [openMessage, setOpenMessage] = useState<PublicMessage | null>(initialOpen);
  const [wallOrder, setWallOrderState] = useState<string[]>([]);
  const liked = useSyncExternalStore(likedStore.subscribe, likedStore.get, likedStore.getServer);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [prefill, setPrefill] = useState<{ toName: string; nonce: number } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());

  const cache = useRef(new Map<string, PublicMessage>());
  const hiddenRef = useRef(new Set<string>());
  const listeners = useRef(new Set<(m: PublicMessage) => void>());
  /** True when *we* pushed the /m/:id history entry (so close can go back). */
  const pushedRef = useRef(false);
  const openReq = useRef(0);

  // Seed the lookup cache with what the server rendered.
  useEffect(() => {
    for (const m of initialMessages) cache.current.set(m.id, m);
    if (initialOpen) cache.current.set(initialOpen.id, initialOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remember = useCallback((messages: PublicMessage[]) => {
    for (const m of messages) cache.current.set(m.id, m);
  }, []);

  const show = useCallback((m: PublicMessage, push: boolean) => {
    cache.current.set(m.id, m);
    setOpenMessage(m);
    track("letter_open", { id: m.id });
    if (push && typeof window !== "undefined") {
      const path = `/m/${m.id}`;
      if (window.location.pathname !== path) {
        if (PERMALINK_RE.test(window.location.pathname)) {
          // Stepping between letters: replace, so Back closes the view.
          window.history.replaceState(null, "", path);
        } else {
          window.history.pushState(null, "", path);
          pushedRef.current = true;
        }
      }
    }
  }, []);

  const openById = useCallback(
    async (id: string, push: boolean) => {
      const known = cache.current.get(id);
      if (known) return show(known, push);
      const req = ++openReq.current;
      try {
        const m = await fetchMessage(id);
        if (m && req === openReq.current) show(m, push);
      } catch {
        /* network error: leave the page as it is */
      }
    },
    [show],
  );

  const openLetter = useCallback(
    (target: PublicMessage | string) => {
      if (typeof target === "string") void openById(target, true);
      else show(target, true);
    },
    [openById, show],
  );

  const closeLetter = useCallback(() => {
    openReq.current++;
    setOpenMessage(null);
    if (typeof window === "undefined") return;
    if (!PERMALINK_RE.test(window.location.pathname)) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", "/");
    }
  }, []);

  // Back / forward buttons.
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(PERMALINK_RE);
      if (match) {
        void openById(match[1], false);
      } else {
        pushedRef.current = false;
        openReq.current++;
        setOpenMessage(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openById]);

  // A letter taken off the wall from this page (removal request / reports).
  useEffect(() => {
    const onHidden = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id || hiddenRef.current.has(id)) return;
      hiddenRef.current.add(id);
      cache.current.delete(id);
      setTotal((t) => Math.max(0, t - 1));
      setHiddenIds(new Set(hiddenRef.current));
      setWallOrderState((ids) => ids.filter((x) => x !== id));
    };
    window.addEventListener(LETTER_HIDDEN_EVENT, onHidden);
    return () => window.removeEventListener(LETTER_HIDDEN_EVENT, onHidden);
  }, []);

  const setWallOrder = useCallback((ids: string[]) => setWallOrderState(ids), []);

  const neighbours = useMemo(() => {
    if (!openMessage) return { prev: null, next: null };
    const i = wallOrder.indexOf(openMessage.id);
    if (i === -1) return { prev: null, next: wallOrder[0] ?? null };
    return { prev: wallOrder[i - 1] ?? null, next: wallOrder[i + 1] ?? null };
  }, [openMessage, wallOrder]);

  const addMessage = useCallback((m: PublicMessage) => {
    cache.current.set(m.id, m);
    setTotal((t) => t + 1);
    emitNewLetter(toSceneLetter(m));
    for (const fn of listeners.current) fn(m);
  }, []);

  const onNewMessage = useCallback((fn: (m: PublicMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const isLiked = useCallback((id: string) => liked.has(id), [liked]);

  const likeCount = useCallback(
    (m: PublicMessage) => counts[m.id] ?? m.likes,
    [counts],
  );

  const countsRef = useRef(counts);
  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  const toggleLike = useCallback(async (m: PublicMessage) => {
    const wasLiked = likedStore.get().has(m.id);
    const before = countsRef.current[m.id] ?? m.likes;
    const nextLiked = !wasLiked;

    const apply = (isLikedNow: boolean, count: number) => {
      likedStore.update(m.id, isLikedNow);
      setCounts((c) => ({ ...c, [m.id]: Math.max(0, count) }));
    };

    apply(nextLiked, before + (nextLiked ? 1 : -1));
    if (nextLiked) track("letter_like", { id: m.id });

    const res = await likeMessage(m.id, nextLiked);
    if (res) apply(res.liked, res.likes);
    else apply(wasLiked, before);
  }, []);

  const requestPrefill = useCallback((toName: string) => {
    setPrefill({ toName, nonce: Date.now() });
    document.getElementById("write")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const value = useMemo<LettersContextValue>(
    () => ({
      total,
      openMessage,
      openLetter,
      closeLetter,
      setWallOrder,
      neighbours,
      remember,
      addMessage,
      onNewMessage,
      isLiked,
      likeCount,
      toggleLike,
      prefill,
      requestPrefill,
      hiddenIds,
    }),
    [
      total,
      openMessage,
      openLetter,
      closeLetter,
      setWallOrder,
      neighbours,
      remember,
      addMessage,
      onNewMessage,
      isLiked,
      likeCount,
      toggleLike,
      prefill,
      requestPrefill,
      hiddenIds,
    ],
  );

  return <LettersContext.Provider value={value}>{children}</LettersContext.Provider>;
}
