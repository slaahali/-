"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useLetters } from "@/components/LettersProvider";
import { ShareMenu } from "@/components/share/ShareMenu";
import { Icon3D } from "@/components/ui/Icon3D";
import { LikeButton } from "@/components/ui/LikeButton";
import { ReportButton } from "@/components/ui/ReportButton";
import { ArrowGlyph, CloseGlyph, SchoolGlyph } from "@/components/wall/glyphs";
import { useHydrated, useReducedMotion } from "@/components/wall/hooks";
import { isFemaleTitle } from "@/components/wall/wall-utils";
import { cardStyle, type CardStyle } from "@/lib/assets";
import { COPY, GIFT_URL, HASHTAG } from "@/lib/config";
import { displayTo, fromName, stampFor, toLine } from "@/lib/format";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";
import styles from "./letter.module.css";

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** Intl throws a RangeError on an invalid Date; show nothing instead of crashing the view. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

/** Light illustration gradients (cream, gold) get dark text instead of white. */
function isLightGradient([a, b]: [string, string]): boolean {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  };
  return (lum(a) + lum(b)) / 2 > 0.4;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The opened-letter view. Renders nothing while no letter is open. */
export function LetterModal() {
  const { openMessage } = useLetters();
  if (!openMessage) return null;
  return <LetterView m={openMessage} />;
}

/** Makes everything outside `el` inert (so only the dialog is reachable). Returns what it changed. */
function inertOutside(el: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  let node: HTMLElement = el;
  while (node.parentElement && node !== document.body) {
    const parent: HTMLElement = node.parentElement;
    for (const sib of Array.from(parent.children)) {
      if (sib === node || !(sib instanceof HTMLElement) || sib.inert) continue;
      if (sib.tagName === "SCRIPT" || sib.tagName === "STYLE" || sib.tagName === "TEMPLATE")
        continue;
      sib.inert = true;
      changed.push(sib);
    }
    node = parent;
  }
  return changed;
}

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0 && !el.closest("dialog:not([open]), [inert]"),
  );
}

function LetterView({ m }: { m: PublicMessage }) {
  const { closeLetter, neighbours, openLetter } = useLetters();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const titleId = useId();
  const reduced = useReducedMotion();
  const hydrated = useHydrated();

  const s = cardStyle(m);
  const memory = m.inMemory;
  const calm = memory || reduced;
  const female = isFemaleTitle(m.title);

  // A letter server-rendered from /m/:id is already on screen: don't replay the
  // entry after hydration. Client opens and prev/next steps do animate.
  const [openedOnClient] = useState(hydrated);
  const [firstId] = useState(m.id);
  const entry: "none" | "calm" | "full" =
    !openedOnClient && m.id === firstId ? "none" : calm ? "calm" : "full";
  const pick = (full: string, calmCls: string) =>
    entry === "full" ? full : entry === "calm" ? calmCls : "";

  // Open: remember the opener, lock page scroll, make the page inert, focus ✕.
  // Close (unmount): undo all of it and give focus back.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const prev = { overflow: html.style.overflow, gutter: html.style.scrollbarGutter };
    const hadScrollbar = window.innerWidth > html.clientWidth;
    html.style.overflow = "hidden";
    if (hadScrollbar) html.style.scrollbarGutter = "stable";
    const inerted = inertOutside(overlay);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      html.style.overflow = prev.overflow;
      html.style.scrollbarGutter = prev.gutter;
      for (const el of inerted) el.inert = false;
      if (opener && opener !== document.body && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // Stepping to another letter starts at the top.
  useEffect(() => {
    overlayRef.current?.scrollTo({ top: 0 });
  }, [m.id]);

  const step = (id: string | null) => {
    if (id) openLetter(id);
  };

  /** Inside a nested dialog (report sheet, portalled share popover) rather than the letter itself. */
  const inNestedDialog = (t: Element | null) => {
    const d = t?.closest('dialog, [role="dialog"]');
    return Boolean(d && d !== overlayRef.current);
  };

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    // Nested dialogs handle their own keys.
    if (inNestedDialog(target)) return;

    if (e.key === "Escape") {
      if (e.defaultPrevented) return;
      e.preventDefault();
      closeLetter();
      return;
    }

    if (e.key === "Tab") {
      const root = overlayRef.current;
      if (!root) return;
      const active = document.activeElement;
      // Focus inside something portalled elsewhere (e.g. a share sheet): leave it alone.
      if (active && active !== document.body && !root.contains(active)) return;
      const items = focusablesIn(root);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (
        !root.contains(active) ||
        (e.shiftKey && active === first) ||
        (!e.shiftKey && active === last)
      ) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='slider']"))
        return;
      // RTL: the next letter is to the left.
      const id = e.key === "ArrowLeft" ? neighbours.next : neighbours.prev;
      if (!id) return;
      e.preventDefault();
      step(id);
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const onTouchStart = (e: ReactTouchEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    // Touches from portalled UI still bubble here through React; only swipe the letter itself.
    if (
      e.touches.length !== 1 ||
      !target ||
      !overlayRef.current?.contains(target) ||
      inNestedDialog(target) ||
      target.closest("input, textarea, [data-no-swipe]")
    ) {
      touchRef.current = null;
      return;
    }
    const p = e.touches[0];
    touchRef.current = { x: p.clientX, y: p.clientY, t: Date.now() };
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const p = e.changedTouches[0];
    if (!start || !p) return;
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.t > 800)
      return;
    // Swiping right pulls in what's on the left, i.e. the next letter in RTL.
    step(dx > 0 ? neighbours.next : neighbours.prev);
  };

  const paperVars = {
    "--paper-bg": s.bg,
    "--paper-ink": s.ink,
    "--paper-accent": s.accent,
  } as CSSProperties;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={styles.overlay}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div aria-hidden="true" className={styles.topFade} />
      <button
        ref={closeRef}
        type="button"
        onClick={closeLetter}
        aria-label="إغلاق الرسالة"
        className={styles.close}
      >
        <CloseGlyph size={22} stroke={1.6} />
      </button>

      {neighbours.prev && (
        <button
          type="button"
          onClick={() => step(neighbours.prev)}
          aria-label="الرسالة السابقة"
          className={`${styles.nav} ${styles.navPrev}`}
        >
          <ArrowGlyph dir="right" />
        </button>
      )}
      {neighbours.next && (
        <button
          type="button"
          onClick={() => step(neighbours.next)}
          aria-label="الرسالة التالية"
          className={`${styles.nav} ${styles.navNext}`}
        >
          <ArrowGlyph dir="left" />
        </button>
      )}

      <div className={styles.stage}>
        {/* Keyed parts replay their entry animation when stepping between letters. */}
        <div className={styles.layout}>
          <div className="min-w-0">
            <article
              key={m.id}
              aria-labelledby={titleId}
              className={`${styles.paper} ${pick(styles.unfold, styles.fade)}`}
              style={paperVars}
            >
              <span aria-hidden="true" className={styles.seal}>
                {memory ? (
                  <span className="text-[1.15rem] leading-none">🕊️</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 20.4s-7.4-4.5-9.2-9.1C1.5 8 3.5 4.6 6.9 4.6c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.4 0 5.4 3.4 4.1 6.7-1.8 4.6-9.2 9.1-9.2 9.1Z" />
                  </svg>
                )}
              </span>

              <header>
                {memory ? (
                  <span className={styles.memoryTag}>{COPY.memoryTag}</span>
                ) : (
                  <p className={styles.kicker}>رسالة إلى</p>
                )}
                <h2 id={titleId} className={styles.name}>
                  {memory ? toLine(m) : displayTo(m)}
                </h2>
                {m.school && (
                  <p className={styles.school}>
                    <SchoolGlyph size={16} />
                    <span>{m.school}</span>
                  </p>
                )}
              </header>

              <div className={`font-hand ${styles.body}`}>{m.body}</div>

              <footer className={styles.sign}>
                <div className="min-w-0">
                  <p className={`font-hand ${styles.from}`}>— {fromName(m)}</p>
                  <time dateTime={m.createdAt} className={styles.date}>
                    {(hydrated && formatDate(m.createdAt)) || "\u00a0"}
                  </time>
                </div>
                <span className={`stamp ${styles.stamp} ${pick(styles.stampIn, styles.stampCalm)}`}>
                  {stampFor(m)}
                </span>
              </footer>
            </article>

            <div className={`${styles.actions} ${entry === "none" ? "" : styles.actionsIn}`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <LikeButton message={m} size="md" />
                {!memory && (
                  <a
                    href={GIFT_URL}
                    target="_blank"
                    rel="noopener"
                    onClick={() => track("gift_click", { from: "letter" })}
                    className="btn btn-primary"
                  >
                    {female ? "أرسل لها هدية 🎁" : "أرسل له هدية 🎁"}
                    <span className="visually-hidden"> (تفتح في صفحة جديدة)</span>
                  </a>
                )}
                <ReportButton message={m} className="ms-auto" />
              </div>
              <div className="mt-4 rounded-[20px] border border-line bg-white/60 p-3 sm:p-4">
                <p className="mb-2.5 text-sm font-bold text-ink-soft">
                  {memory ? "شارك الرسالة 🤍" : female ? "وصّلها لمعلمتك 💜" : "وصّلها لمعلمك 💜"}
                </p>
                <ShareMenu message={m} mode="full" />
              </div>
            </div>

            {(neighbours.prev || neighbours.next) && (
              <nav
                aria-label="التنقل بين الرسائل"
                className={`${styles.mobileNav} mt-8 flex items-center justify-between gap-2`}
              >
                <button
                  type="button"
                  disabled={!neighbours.prev}
                  onClick={() => step(neighbours.prev)}
                  className="btn btn-ghost min-h-11 px-4 text-sm disabled:opacity-40"
                >
                  <ArrowGlyph dir="right" size={18} /> السابقة
                </button>
                <span aria-hidden="true" className="text-xs text-ink-mute">
                  اسحب للتنقل
                </span>
                <button
                  type="button"
                  disabled={!neighbours.next}
                  onClick={() => step(neighbours.next)}
                  className="btn btn-ghost min-h-11 px-4 text-sm disabled:opacity-40"
                >
                  التالية <ArrowGlyph dir="left" size={18} />
                </button>
              </nav>
            )}
          </div>

          <div className={styles.illoCol}>
            <Illustration
              key={m.id}
              style={s}
              interactive={!calm}
              memory={memory}
              entryClass={pick(styles.illoIn, styles.illoCalm)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gradient card with the letter's 3D icon; tilts toward the pointer on desktop. */
function Illustration({
  style: s,
  interactive,
  memory,
  entryClass,
}: {
  style: CardStyle;
  interactive: boolean;
  memory: boolean;
  entryClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!interactive || !el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.classList.add(styles.tilting);
    el.style.setProperty("--rx", `${(-py * 14).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(px * 16).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove(styles.tilting);
    for (const p of ["--rx", "--ry", "--gx", "--gy"]) el.style.removeProperty(p);
  };

  return (
    <div className={`${styles.illoWrap} ${entryClass}`}>
      <div
        ref={ref}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={styles.illo}
        style={
          {
            "--g1": s.gradient[0],
            "--g2": s.gradient[1],
            "--illo-ink": isLightGradient(s.gradient) ? s.ink : "#fff",
          } as CSSProperties
        }
      >
        <span className={styles.grain} />
        <span className={styles.shine} />
        <div className={styles.illoText}>
          <span className={styles.illoBadge}>{COPY.badge}</span>
          <span className={`font-hand ${styles.illoTag}`}>
            {memory ? COPY.memoryStamp : HASHTAG}
          </span>
        </div>
        <div className={`${styles.illoIcon} ${memory ? "" : styles.floating}`}>
          <Icon3D name={s.icon} size={220} priority />
        </div>
      </div>
    </div>
  );
}
