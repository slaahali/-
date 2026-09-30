"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChefzLogo } from "@/components/layout/ChefzLogo";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { fetchMessages } from "@/lib/api-client";
import { LETTER_HIDDEN_EVENT } from "@/lib/events";
import { formatCount } from "@/lib/format";
import { play } from "@/lib/sound";
import type { PublicMessage } from "@/lib/types";
import { setImmersiveOpen } from "./immersive-state";
import { LABEL_PILL_CLASS } from "./label-style";
import { LetterList } from "./letter-list";
import type { TunnelEngine } from "./tunnel";

export interface ImmersiveLettersProps {
  open: boolean;
  onClose: () => void;
  /** Click / tap / Enter on a letter (the letter view opens above this overlay). */
  onOpen: (id: string) => void;
  /** Letters already on the page (newest first), shown while the rest page in. */
  seed: PublicMessage[];
  /** Optional: stop rendering while something covers the tunnel. Also inferred from `inert`. */
  paused?: boolean;
  /** Optional: every page loaded, e.g. the provider's `remember` so opening needs no fetch. */
  onMessages?: (items: PublicMessage[]) => void;
}

const PAGE = 30;
/** Keep at least this many letters loaded beyond the one on screen. */
const LOOKAHEAD = 40;
const HINT_KEY = "tcz_tunnel_hint_v1";
/** Marks the history entry pushed while the tunnel is open (phone Back closes it). */
const HISTORY_KEY = "tczTunnel";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface TunnelData {
  list: LetterList;
  cursor: string | null;
  done: boolean;
  total: number | null;
  loading: boolean;
  started: boolean;
  failures: number;
  retryAt: number;
  /** Pages in a row that brought nothing new (guards against a looping cursor). */
  stale: number;
  /** Where the camera was, to resume on the next open. */
  lastSlot: number;
}

interface View {
  /** 1-based position of the letter at reading distance (0 = none yet). */
  index: number;
  count: number;
  /** Total is known (first page answered). */
  exact: boolean;
  label: string;
  /** Nothing to show at all (after loading). */
  empty: boolean;
}

const EMPTY_VIEW: View = { index: 0, count: 0, exact: false, label: "", empty: false };

const subscribeNothing = () => () => {};
const subscribeReduced = (fn: () => void) => {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};

function readHintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHintSeen() {
  try {
    window.localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* private mode: the hint just shows again next visit */
  }
}

const ownsHistoryEntry = () => Boolean((window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY]);
/** A Back scheduled by the last close, cancelled when the tunnel reopens at once (StrictMode remount). */
let pendingBack = 0;

function viewOf(d: TunnelData, slot: number): View {
  const list = d.list;
  const count = Math.max(d.total ?? 0, list.length) - list.hiddenCount;
  let i = list.nearestIndex(slot);
  // The letter here was taken down (e.g. a removal request from its letter view): name the next one.
  for (let s = 1; s <= 3 && i >= 0 && list.isHidden(list.letter(i)?.id ?? ""); s++) {
    i = list.nearestIndex(slot + s * list.stride());
  }
  const letter = i >= 0 ? list.letter(i) : null;
  return {
    index: i >= 0 ? Math.min(i + 1, Math.max(1, count)) : 0,
    count: Math.max(0, count),
    exact: d.total !== null,
    label: letter && !list.isHidden(letter.id) ? letter.label : "",
    empty: d.started && !d.loading && d.done && list.visibleCount === 0,
  };
}

/**
 * «تجوّل بين كل الرسائل»: a full-screen tunnel of every letter. The camera
 * flies forward through them (wheel / trackpad / vertical drag / ↑↓, slow
 * drift when idle); letters that pass behind recycle to the far end carrying
 * the next ones, paged from /api/messages. Hover shows the name, click / tap
 * opens the letter view above (z-index 80 < the letter view's 90).
 */
export default function ImmersiveLetters(props: ImmersiveLettersProps) {
  const { open } = props;
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  // Survives close / reopen: the list, the paging cursor and where you were.
  const dataRef = useRef<TunnelData | null>(null);
  const hiddenListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onHidden = (e: Event) => {
      const id = (e as CustomEvent<{ id?: unknown }>).detail?.id;
      const d = dataRef.current;
      if (typeof id !== "string" || !d) return;
      d.list.hide(id);
      hiddenListenerRef.current?.();
    };
    window.addEventListener(LETTER_HIDDEN_EVENT, onHidden);
    return () => window.removeEventListener(LETTER_HIDDEN_EVENT, onHidden);
  }, []);

  const onGone = useCallback(() => setMounted(false), []);

  if (!isClient || !mounted) return null;
  return createPortal(
    <TunnelOverlay {...props} leaving={!open} onGone={onGone} dataRef={dataRef} hiddenListenerRef={hiddenListenerRef} />,
    document.body,
  );
}

function TunnelOverlay({
  onClose,
  onOpen,
  seed,
  paused = false,
  onMessages,
  leaving,
  onGone,
  dataRef,
  hiddenListenerRef,
}: ImmersiveLettersProps & {
  leaving: boolean;
  onGone: () => void;
  dataRef: RefObject<TunnelData | null>;
  hiddenListenerRef: RefObject<(() => void) | null>;
}) {
  const titleId = useId();
  const hintId = useId();
  const grainId = useId().replace(/:/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<TunnelEngine | null>(null);
  const focusRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  const [view, setView] = useState<View>(EMPTY_VIEW);
  const [noWebGL, setNoWebGL] = useState(false);
  const [covered, setCovered] = useState(false);
  const [hint, setHint] = useState(() => !readHintSeen());
  const [announce, setAnnounce] = useState("");

  // Latest callbacks for listeners registered once.
  const latest = useRef({ onClose, onOpen, onMessages });
  useEffect(() => {
    latest.current = { onClose, onOpen, onMessages };
  }, [onClose, onOpen, onMessages]);

  const data = useCallback((): TunnelData => {
    if (!dataRef.current) {
      dataRef.current = {
        list: new LetterList(),
        cursor: null,
        done: false,
        total: null,
        loading: false,
        started: false,
        failures: 0,
        retryAt: 0,
        stale: 0,
        lastSlot: 0,
      };
    }
    return dataRef.current;
  }, [dataRef]);

  const refreshView = useCallback(() => setView(viewOf(data(), focusRef.current)), [data]);

  const openLetter = useCallback((id: string) => {
    void play("open"); // called from the click / key that opened it
    latest.current.onOpen(id);
  }, []);

  // ------------------------------------------------------------ paging ---
  const ensureLoaded = useCallback(() => {
    const d = data();
    function next() {
      if (d.loading || d.done || Date.now() < d.retryAt) return;
      const passed = Math.floor(focusRef.current / d.list.stride());
      if (d.started && passed + LOOKAHEAD < d.list.length) return;

      d.loading = true;
      d.started = true;
      const ac = new AbortController();
      abortRef.current = ac;
      fetchMessages({ sort: "new", limit: PAGE, cursor: d.cursor }, ac.signal)
        .then((res) => {
          if (ac.signal.aborted) return;
          d.total = res.total;
          d.cursor = res.nextCursor;
          d.failures = 0;
          const added = d.list.add(res.items);
          d.stale = added || !d.cursor ? 0 : d.stale + 1;
          // No cursor: everything is here and the tunnel wraps around.
          d.done = !res.nextCursor || d.stale > 3;
          if (res.items.length) latest.current.onMessages?.(res.items);
          if (added) engineRef.current?.refresh();
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          d.failures++;
          d.retryAt = Date.now() + Math.min(30_000, 1500 * 2 ** d.failures);
        })
        .finally(() => {
          d.loading = false;
          if (abortRef.current === ac) abortRef.current = null;
          if (ac.signal.aborted) return;
          refreshView();
          next(); // the next page, if still short
        });
    }
    next();
  }, [data, refreshView]);

  // Seed (and later seeds) go in first; merging keeps order and ids unique.
  useEffect(() => {
    const d = data();
    focusRef.current = d.lastSlot;
    if (d.list.add(seed)) engineRef.current?.refresh();
    refreshView();
  }, [seed, data, refreshView]);

  useEffect(() => {
    hiddenListenerRef.current = () => {
      engineRef.current?.refresh();
      refreshView();
    };
    return () => {
      hiddenListenerRef.current = null;
    };
  }, [hiddenListenerRef, refreshView]);

  // ------------------------------------------------------------ engine ---
  useEffect(() => {
    const stage = stageRef.current;
    const labelAnchor = anchorRef.current;
    const labelPill = pillRef.current;
    const wheelTarget = rootRef.current ?? undefined;
    if (!stage || !labelAnchor || !labelPill) return;
    const d = data();
    focusRef.current = d.lastSlot;
    let engine: TunnelEngine | null = null;
    let cancelled = false;

    import("./tunnel")
      .then(({ TunnelEngine }) => {
        if (cancelled) return;
        try {
          engine = new TunnelEngine({
            root: stage,
            wheelTarget,
            labelAnchor,
            labelPill,
            source: (k) => d.list.at(k),
            onOpen: openLetter,
            startSlot: d.lastSlot,
            onFocus: (k) => {
              focusRef.current = k;
              d.lastSlot = k;
              refreshView();
              ensureLoaded();
            },
            onInteract: () => setHint(false),
          });
        } catch {
          setNoWebGL(true);
          return;
        }
        engineRef.current = engine;
        engine.setPaused(pausedRef.current);
      })
      .catch(() => {
        if (!cancelled) setNoWebGL(true);
      });
    ensureLoaded();

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      abortRef.current = null;
      d.loading = false;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [data, ensureLoaded, openLetter, refreshView]);

  // Paused while the letter view covers us (it makes the page `inert`), or while leaving.
  useEffect(() => {
    pausedRef.current = paused || covered || leaving;
    engineRef.current?.setPaused(pausedRef.current);
  }, [paused, covered, leaving]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => setCovered(root.inert || root.hasAttribute("inert")));
    mo.observe(root, { attributes: true, attributeFilter: ["inert"] });
    return () => mo.disconnect();
  }, []);

  // ------------------------------------------ open: lock, focus, enter ---
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
    const hadScrollbar = window.innerWidth > html.clientWidth;
    html.style.overflow = "hidden";
    if (hadScrollbar) html.style.scrollbarGutter = "stable";
    setImmersiveOpen(true);
    root.focus({ preventScroll: true });
    if (!window.matchMedia(REDUCED_QUERY).matches) {
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
    return () => {
      html.style.overflow = prev.overflow;
      html.style.scrollbarGutter = prev.gutter;
      setImmersiveOpen(false);
      if (opener && opener !== document.body && opener.isConnected && !root.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // A history entry while open, so the phone's Back gesture closes the tunnel
  // instead of leaving the site (in-app browsers close outright). Same path,
  // no hash: the letter view's own /m/:id entry stacks on top of it.
  useEffect(() => {
    if (leaving) return;
    if (pendingBack) {
      window.clearTimeout(pendingBack);
      pendingBack = 0;
    }
    if (!ownsHistoryEntry()) {
      window.history.pushState({ [HISTORY_KEY]: 1 }, "", window.location.pathname + window.location.search);
    }
    const onPop = () => {
      if (!ownsHistoryEntry() && !rootRef.current?.inert) latest.current.onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed from the page (✕, Esc): drop our entry.
      pendingBack = window.setTimeout(() => {
        pendingBack = 0;
        if (ownsHistoryEntry()) window.history.back();
      }, 0);
    };
  }, [leaving]);

  // Leaving: fade out, then unmount (which disposes the engine).
  useEffect(() => {
    if (!leaving) return;
    const root = rootRef.current;
    const instant = window.matchMedia(REDUCED_QUERY).matches;
    const anim = !instant && root ? root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "ease-in", fill: "forwards" }) : null;
    const t = window.setTimeout(onGone, instant ? 0 : 200);
    return () => {
      window.clearTimeout(t);
      anim?.cancel(); // reopened mid-fade
    };
  }, [leaving, onGone]);

  // ------------------------------------------------------------- hint ---
  useEffect(() => {
    if (!hint) return;
    writeHintSeen(); // "first entry" only
    const t = window.setTimeout(() => setHint(false), 6500);
    const dot = dotRef.current;
    const anim =
      dot && !window.matchMedia(REDUCED_QUERY).matches
        ? dot.animate(
            [
              { transform: "translateY(7px)", opacity: 0 },
              { opacity: 1, offset: 0.25 },
              { opacity: 1, offset: 0.7 },
              { transform: "translateY(-7px)", opacity: 0 },
            ],
            { duration: 1500, iterations: Infinity, easing: "ease-in-out" },
          )
        : null;
    return () => {
      window.clearTimeout(t);
      anim?.cancel();
    };
  }, [hint]);

  // Screen readers hear where they are once the tunnel settles, not every frame.
  useEffect(() => {
    if (!view.index) return;
    const text = `رسالة ${formatCount(view.index)}${view.exact ? ` من ${formatCount(view.count)}` : ""}${view.label ? `، ${view.label}` : ""}`;
    const t = window.setTimeout(() => setAnnounce(text), 900);
    return () => window.clearTimeout(t);
  }, [view]);

  // --------------------------------------------------------- keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || root.inert || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      // Keys typed somewhere else on top of us (the letter view, a share sheet) are theirs.
      if (target && target !== document.body && !root.contains(target)) return;
      const engine = engineRef.current;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          latest.current.onClose();
          return;
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          setHint(false);
          engine?.step(1);
          return;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          setHint(false);
          engine?.step(-1);
          return;
        case "Home":
          e.preventDefault();
          engine?.goToStart();
          return;
        case "Enter":
          if (target === root && engine) {
            e.preventDefault();
            engine.openFocused();
          }
          return;
        case "Tab": {
          const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.getClientRects().length > 0,
          );
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          const active = document.activeElement;
          if (!root.contains(active) || active === root || (e.shiftKey ? active === first : active === last)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
          }
          return;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Keep keyboard focus inside the dialog when a letter is tapped (the letter view gives it back here).
  const focusRoot = () => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  };

  const step = (dir: 1 | -1) => {
    setHint(false);
    engineRef.current?.step(dir);
  };

  const counter = view.index && !noWebGL && !view.empty ? (
    <>
      <span className="text-ink-soft">رسالة</span>{" "}
      <b className="font-bold text-plum tabular-nums">{formatCount(view.index)}</b>
      {view.exact && (
        <>
          {" "}
          <span className="text-ink-soft">من</span>{" "}
          <span className="font-bold text-plum/80 tabular-nums">{formatCount(view.count)}</span>
        </>
      )}
    </>
  ) : null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      tabIndex={-1}
      data-immersive=""
      className={`fixed inset-0 z-[80] overflow-hidden overscroll-none text-ink outline-none select-none ${leaving ? "pointer-events-none" : ""}`}
      style={BACKDROP}
    >
      {/* Paper grain under the letters. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full opacity-[0.07] mix-blend-multiply">
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} />
      </svg>

      <div ref={stageRef} className="absolute inset-0" onPointerDown={focusRoot}>
        <div ref={anchorRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-10 will-change-transform">
          <div ref={pillRef} data-visible="false" className={LABEL_PILL_CLASS} />
        </div>
      </div>

      {/* Soft cream band so the bar reads over passing letters. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-[#f7efe6] from-25% via-[#f7efe6]/70 to-transparent sm:h-28"
      />

      <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
        <div className="justify-self-start">
          <ChefzLogo height={24} priority />
        </div>
        <div className="flex min-w-0 flex-col items-center text-center">
          <h2 id={titleId} className="sr-only">
            كل الرسائل
          </h2>
          <p className="flex items-center gap-2.5 text-[0.95rem] leading-6 whitespace-nowrap sm:text-base" aria-hidden>
            <span className="hidden h-px w-7 bg-plum-200 sm:block" />
            <span>{counter}</span>
            <span className="hidden h-px w-7 bg-plum-200 sm:block" />
          </p>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <SoundToggle className="size-11 bg-white/80 backdrop-blur-sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            title="إغلاق (Esc)"
            className="icon-btn size-11 bg-white/80 backdrop-blur-sm"
          >
            <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      {/* Keyboard / screen-reader way in: opens the letter at reading distance. */}
      {view.label && (
        <button
          type="button"
          onClick={() => engineRef.current?.openFocused()}
          className="sr-only focus:not-sr-only focus:absolute focus:inset-x-4 focus:bottom-[max(1.25rem,env(safe-area-inset-bottom))] focus:z-30 focus:mx-auto focus:w-fit focus:rounded-2xl focus:border focus:border-plum-100 focus:bg-white focus:px-5 focus:py-3 focus:font-bold focus:text-plum focus:shadow-[var(--shadow-soft)]"
        >
          افتح الرسالة: {view.label}
        </button>
      )}

      <p id={hintId} className="sr-only">
        مرّر أو اسحب أو استخدم الأسهم لتتنقل بين الرسائل، واضغط على أي رسالة لقراءتها.
      </p>

      {hint && !noWebGL && !view.empty && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] z-20 flex justify-center px-4 ${reduced ? "pe-20 sm:pe-4" : ""}`}
        >
          <div className="flex items-center gap-3 rounded-2xl border border-plum-100/80 bg-[#fffdf8]/90 py-2.5 ps-3.5 pe-4 text-[0.95rem] text-ink-soft shadow-[var(--shadow-soft)] backdrop-blur-sm">
            <span className="relative grid h-7 w-[1.1rem] place-items-center rounded-full border-[1.5px] border-plum/40">
              <span ref={dotRef} className="size-1.5 rounded-full bg-orange" />
            </span>
            مرّر أو اسحب لتتنقل بين الرسائل
          </div>
        </div>
      )}

      {/* Step controls: always on desktop, and the way to move with reduced motion. */}
      {!noWebGL && !view.empty && (
        <div
          className={`absolute end-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex-col overflow-hidden rounded-full border border-line bg-white/85 shadow-[var(--shadow-soft)] backdrop-blur-sm sm:end-6 sm:bottom-6 ${reduced ? "flex" : "hidden pointer-fine:flex"}`}
        >
          <button type="button" onClick={() => step(-1)} aria-label="الرسالة السابقة" className={STEP_BTN}>
            <Chevron up />
          </button>
          <span aria-hidden className="mx-2.5 h-px bg-line" />
          <button type="button" onClick={() => step(1)} aria-label="الرسالة التالية" className={STEP_BTN}>
            <Chevron />
          </button>
        </div>
      )}

      {(noWebGL || view.empty) && (
        <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center">
          <div className="max-w-sm">
            <p className="text-xl leading-9 font-bold text-plum">
              {view.empty ? "لسّه ما وصلت رسائل… كن أول من يكتب" : "جهازك ما يدعم العرض ثلاثي الأبعاد"}
            </p>
            <p className="mt-2 text-ink-soft">
              {view.empty ? "رسالتك بتكون أول رسالة تطير هنا." : "تقدر تقرأ كل الرسائل على الجدار تحت."}
            </p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => {
                const el = document.getElementById(view.empty ? "write" : "letters");
                onClose();
                // After the fade and the Back that drops our history entry (it may restore scroll).
                window.setTimeout(() => el?.scrollIntoView({ block: "start" }), 320);
              }}
            >
              {view.empty ? "اكتب رسالتك" : "تصفّح الرسائل"}
            </button>
          </div>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

const STEP_BTN =
  "grid size-11 place-items-center text-plum transition-colors hover:bg-plum-50 active:bg-plum-100 focus-visible:outline-offset-[-3px]";

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={up ? "M6 14.5l6-6 6 6" : "M6 9.5l6 6 6-6"} />
    </svg>
  );
}

/** Cream paper, brightest at the vanishing point, warmer towards the edges (depth). */
const BACKDROP: CSSProperties = {
  backgroundColor: "#f6eee5",
  backgroundImage: [
    "radial-gradient(46% 40% at 50% 50%, rgb(255 253 248) 0%, rgb(255 253 248 / 0.6) 45%, rgb(255 253 248 / 0) 100%)",
    "radial-gradient(70% 50% at 100% 0%, rgb(253 230 219 / 0.75) 0%, rgb(253 230 219 / 0) 70%)",
    "radial-gradient(70% 55% at 0% 100%, rgb(244 230 238 / 0.9) 0%, rgb(244 230 238 / 0) 70%)",
    "radial-gradient(130% 95% at 50% 50%, #fbf7f2 35%, #efe3d6 100%)",
  ].join(", "),
};
