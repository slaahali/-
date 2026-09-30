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
import type { LikeResult, PublicMessage } from "@/lib/types";

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

// ------------------------------------------------------------ history ---

/** Marks the /m/:id entries this app pushed (Next.js keeps extra keys in history.state). */
const OWN_ENTRY = "tczLetter";

export interface HistoryWindow {
  location: { pathname: string; search: string; hash: string };
  history: Pick<History, "state" | "pushState" | "replaceState" | "back">;
  scrollY: number;
  scrollTo(options: ScrollToOptions): void;
  requestAnimationFrame(cb: () => void): number;
}

/**
 * Keeps /m/:id in the address bar in step with the letter view:
 *  - opening from the page pushes /m/:id (stepping between letters replaces it),
 *  - closing goes Back when the entry is ours, otherwise rewrites to "/",
 *  - the reader's scroll position survives the round trip (a "#letters" hash
 *    would otherwise make the browser jump to the anchor on the way back).
 */
export function letterHistory(win: HistoryWindow) {
  let savedScroll: number | null = null;

  const ownsEntry = () => Boolean((win.history.state as Record<string, unknown> | null)?.[OWN_ENTRY]);
  const mark = () => ({ [OWN_ENTRY]: 1 });

  const restoreScroll = () => {
    const y = savedScroll;
    savedScroll = null;
    if (y === null) return;
    win.requestAnimationFrame(() => win.scrollTo({ top: y, behavior: "instant" }));
  };

  return {
    /** A letter is about to show. `push`: opened on this page (not via Back/Forward). */
    open(id: string, push: boolean, wasOpen: boolean) {
      if (!wasOpen) savedScroll = win.scrollY;
      if (!push) return;
      const path = `/m/${id}`;
      const { pathname, search, hash } = win.location;
      if (pathname === path) return;
      if (PERMALINK_RE.test(pathname)) {
        // Stepping between letters: replace, so Back still closes the view.
        win.history.replaceState(ownsEntry() ? mark() : null, "", path);
        return;
      }
      if (hash) win.history.replaceState(null, "", pathname + search);
      win.history.pushState(mark(), "", path);
    },
    /** The visitor closed the view (✕, Esc, swipe, report…). */
    close() {
      if (!PERMALINK_RE.test(win.location.pathname)) return restoreScroll();
      // Our own entry: step back to the page it came from (popstate restores scroll).
      if (ownsEntry()) return win.history.back();
      // Landed straight on a permalink: rewrite instead of leaving the site.
      win.history.replaceState(null, "", "/");
      restoreScroll();
    },
    /** Back/Forward landed on a page without an open letter. */
    popClosed: restoreScroll,
  };
}

// -------------------------------------------------------------- likes ---

interface LikeJob {
  /** Last state the server confirmed (or the state before the first tap). */
  confirmed: { liked: boolean; count: number };
  /** What the visitor wants right now (what the button shows). */
  want: boolean;
  running: Promise<void> | null;
}

/**
 * Like toggles, one request at a time per letter. Taps while a request is in
 * flight only change the wish; when the response lands the latest wish is sent
 * if it differs, so the button, localStorage and the server end up agreeing no
 * matter how fast the visitor taps or in which order responses arrive.
 */
export function createLikeSync(deps: {
  send: (id: string, like: boolean) => Promise<LikeResult | null>;
  read: (m: { id: string; likes: number }) => { liked: boolean; count: number };
  write: (id: string, liked: boolean, count: number) => void;
}) {
  const jobs = new Map<string, LikeJob>();

  const shown = (job: LikeJob) => {
    const { liked, count } = job.confirmed;
    return job.want === liked ? count : count + (job.want ? 1 : -1);
  };

  async function drain(id: string, job: LikeJob) {
    for (;;) {
      const sent = job.want;
      const res = await deps.send(id, sent);
      if (!res) {
        job.want = job.confirmed.liked;
        deps.write(id, job.confirmed.liked, job.confirmed.count);
        return;
      }
      job.confirmed = { liked: res.liked, count: res.likes };
      // Settled unless the visitor flipped it again while this was in flight.
      if (job.want === res.liked || job.want === sent) {
        job.want = res.liked;
        deps.write(id, res.liked, res.likes);
        return;
      }
    }
  }

  return function toggle(m: { id: string; likes: number }): Promise<void> {
    let job = jobs.get(m.id);
    const now = deps.read(m);
    if (!job) {
      job = { confirmed: now, want: now.liked, running: null };
      jobs.set(m.id, job);
    } else if (!job.running) {
      job.confirmed = now; // idle: another tab may have changed it
    }
    job.want = !now.liked;
    deps.write(m.id, job.want, shown(job));
    if (job.running) return job.running;
    const j = job;
    j.running = drain(m.id, j).finally(() => {
      j.running = null;
    });
    return j.running;
  };
}

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
  const openReq = useRef(0);
  /** The open letter, readable synchronously from handlers. */
  const openRef = useRef<PublicMessage | null>(initialOpen);
  const historyRef = useRef<ReturnType<typeof letterHistory> | null>(null);
  const nav = useCallback(() => (historyRef.current ??= letterHistory(window)), []);

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
    const wasOpen = openRef.current !== null;
    openRef.current = m;
    setOpenMessage(m);
    track("letter_open", { id: m.id });
    if (typeof window !== "undefined") nav().open(m.id, push, wasOpen);
  }, [nav]);

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
    const wasOpen = openRef.current !== null;
    openRef.current = null;
    setOpenMessage(null);
    if (wasOpen && typeof window !== "undefined") nav().close();
  }, [nav]);

  // Back / forward buttons.
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(PERMALINK_RE);
      if (match) {
        void openById(match[1], false);
      } else {
        openReq.current++;
        openRef.current = null;
        setOpenMessage(null);
        nav().popClosed();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openById, nav]);

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

  // Written synchronously so rapid taps read the count they just produced.
  const countsRef = useRef<Record<string, number>>({});
  const likeSync = useRef<ReturnType<typeof createLikeSync> | null>(null);

  const toggleLike = useCallback((m: PublicMessage) => {
    likeSync.current ??= createLikeSync({
      send: likeMessage,
      read: (x) => ({
        liked: likedStore.get().has(x.id),
        count: countsRef.current[x.id] ?? x.likes,
      }),
      write: (id, isLiked, count) => {
        countsRef.current = { ...countsRef.current, [id]: Math.max(0, count) };
        likedStore.update(id, isLiked);
        setCounts(countsRef.current);
      },
    });
    if (!likedStore.get().has(m.id)) track("letter_like", { id: m.id });
    return likeSync.current(m);
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
