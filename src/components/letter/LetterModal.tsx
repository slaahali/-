"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useLetters } from "@/components/LettersProvider";
import { ShareMenu } from "@/components/share/ShareMenu";
import { LikeButton } from "@/components/ui/LikeButton";
import { ReportButton } from "@/components/ui/ReportButton";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { useHydrated, useReducedMotion } from "@/components/wall/hooks";
import { cardStyle } from "@/lib/assets";
import { GIFT_URL } from "@/lib/config";
import { LETTER_HIDDEN_EVENT } from "@/lib/events";
import { displayTo, fromName, stampFor } from "@/lib/format";
import { play } from "@/lib/sound";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";
import { ArrowGlyph, CloseGlyph, GiftGlyph } from "./glyphs";
import { classifySwipe, hasLongRun, letterPalette, noteGesture, recentGesture } from "./letter-utils";
import { PostageStamp } from "./PostageStamp";
import { WaxSeal } from "./WaxSeal";
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

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function postmarkYear(iso: string): string {
  const y = new Date(iso).getUTCFullYear();
  return Number.isFinite(y) ? String(y).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]) : "";
}

/** Openers that already play the paper sound inside their own click: wall cards, the 3D scenes. */
const SELF_SOUNDING_OPENERS = "#letters, [data-immersive], canvas";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The opened-letter view. Renders nothing while no letter is open. */
export function LetterModal() {
  const { openMessage } = useLetters();

  // Remember the last click / tap / key press, so an open can tell a visitor's
  // gesture (→ paper sound) from a deep link or the back button (→ silence).
  useEffect(() => {
    const note = (e: Event) => noteGesture(e.target);
    const opts = { capture: true, passive: true } as const;
    // pointerup too: a slow swipe steps on touchend, well after its pointerdown.
    const types = ["pointerdown", "pointerup", "keydown"] as const;
    for (const t of types) window.addEventListener(t, note, opts);
    return () => {
      for (const t of types) window.removeEventListener(t, note, opts);
    };
  }, []);

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

/** Where the opener sat in its list, so focus can land on its neighbour if it disappears. */
type Slot = { list: Element; index: number };

function slotOf(el: HTMLElement): Slot | null {
  const item = el.closest("li");
  const list = item?.parentElement;
  return item && list ? { list, index: Array.prototype.indexOf.call(list.children, item) } : null;
}

function restoreFocus(opener: HTMLElement | null, slot: Slot | null, openerRemoved: boolean) {
  const opts = { preventScroll: true };
  if (opener?.isConnected && !openerRemoved) {
    opener.focus(opts);
    return;
  }
  // The card that opened the letter left the wall (removal request): continue
  // from the card that takes its place, or from the wall itself.
  if (slot?.list.isConnected) {
    const items = Array.from(slot.list.children).filter((c) => !opener || !c.contains(opener));
    const target = items[slot.index] ?? items[slot.index - 1];
    const focusable = target?.querySelector<HTMLElement>(FOCUSABLE);
    if (focusable) {
      focusable.focus(opts);
      return;
    }
  }
  // Nothing was focused when the letter opened (deep link, 3D scene): leave focus be.
  if (!opener) return;
  const wall = document.getElementById("letters");
  const heading = wall?.querySelector<HTMLElement>("h2") ?? wall;
  if (!heading) return;
  if (!heading.matches(FOCUSABLE)) heading.tabIndex = -1;
  heading.focus(opts);
}

function LetterView({ m }: { m: PublicMessage }) {
  const { closeLetter, neighbours, openLetter } = useLetters();
  const overlayRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number; canClose: boolean } | null>(null);
  const removedRef = useRef(new Set<string>());
  const playedRef = useRef<string | null>(null);
  const titleId = useId();
  const reduced = useReducedMotion();
  const hydrated = useHydrated();

  const s = cardStyle(m);
  const palette = letterPalette(s);
  const memory = m.inMemory;
  const calm = memory || reduced;
  const female = m.title === "ustadha" || m.title === "dr_f";
  const signer = fromName(m);

  // A letter server-rendered from /m/:id is already on screen: don't replay the
  // entry after hydration. Client opens and prev/next steps do animate.
  const [openedOnClient] = useState(hydrated);
  const [firstId] = useState(m.id);
  const entry: "none" | "calm" | "full" =
    !openedOnClient && m.id === firstId ? "none" : calm ? "calm" : "full";
  const pick = (full: string, calmCls: string) =>
    entry === "full" ? full : entry === "calm" ? calmCls : "";

  // The paper sound belongs to the visitor's click; deep links stay silent.
  // Layout effect: for a click-open this still runs inside the click's task.
  useLayoutEffect(() => {
    if (entry === "none" || playedRef.current === m.id) return;
    playedRef.current = m.id;
    const gesture = recentGesture();
    if (!gesture) return;
    const outside = gesture.target && !overlayRef.current?.contains(gesture.target);
    if (outside && gesture.target?.closest(SELF_SOUNDING_OPENERS)) return;
    void play("open");
  }, [m.id, entry]);

  useEffect(() => {
    const onHidden = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) removedRef.current.add(id);
    };
    window.addEventListener(LETTER_HIDDEN_EVENT, onHidden);
    return () => window.removeEventListener(LETTER_HIDDEN_EVENT, onHidden);
  }, []);

  // Open: remember the opener, lock page scroll, make the page inert, focus ✕.
  // Close (unmount): undo all of it and give focus back.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const active = document.activeElement;
    // Safari doesn't focus a clicked button: fall back to what was just pressed.
    const pressed = recentGesture()?.target?.closest<HTMLElement>(FOCUSABLE) ?? null;
    const opener =
      active instanceof HTMLElement && active !== document.body
        ? active
        : pressed && !overlay.contains(pressed)
          ? pressed
          : null;
    const slot = opener ? slotOf(opener) : null;
    const removed = removedRef.current;
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
      restoreFocus(opener, slot, Boolean(slot) && removed.has(firstId));
    };
  }, [firstId]);

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

  // ---- touch: pull the header down to close, flick sideways for prev/next ----
  const setPull = (dy: number) => {
    const el = stackRef.current;
    if (!el) return;
    el.style.transition = dy ? "none" : "";
    el.style.transform = dy ? `translateY(${Math.round(dy * 0.5)}px)` : "";
    el.style.opacity = dy ? String(1 - Math.min(dy / 500, 0.3)) : "";
  };

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
    const canClose =
      (overlayRef.current?.scrollTop ?? 0) <= 2 && Boolean(target.closest("[data-pull-close]"));
    touchRef.current = { x: p.clientX, y: p.clientY, t: Date.now(), canClose };
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    const start = touchRef.current;
    const p = e.touches[0];
    if (!start?.canClose || !p || calm) return;
    const dy = p.clientY - start.y;
    setPull(dy > 0 && dy > Math.abs(p.clientX - start.x) ? dy : 0);
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const p = e.changedTouches[0];
    if (!start || !p) return;
    const action = classifySwipe(p.clientX - start.x, p.clientY - start.y, Date.now() - start.t, {
      canClose: start.canClose,
    });
    if (action === "close") {
      closeLetter();
      return;
    }
    setPull(0);
    if (action) step(action === "next" ? neighbours.next : neighbours.prev);
  };

  const vars = {
    "--accent": s.accent,
    "--accent-ink": palette.accentInk,
    "--stamp-ink": palette.stampInk,
    "--letter-ink": s.ink,
    "--env": palette.envelope,
    "--env-in": palette.envelopeInside,
    "--stamp-field": palette.stampField,
  } as CSSProperties;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={`${styles.overlay} ${memory ? styles.memory : ""}`}
      style={vars}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        touchRef.current = null;
        setPull(0);
      }}
    >
      <div className={styles.topBar}>
        <SoundToggle className={styles.topBtn} />
        <button
          ref={closeRef}
          type="button"
          onClick={closeLetter}
          aria-label="إغلاق الرسالة"
          className={`${styles.topBtn} ${styles.close}`}
        >
          <CloseGlyph size={22} />
        </button>
      </div>

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
        <div ref={stackRef} className={styles.stack}>
          {/* Keyed parts replay their entry when stepping between letters. */}
          <div
            key={`env-${m.id}`}
            aria-hidden="true"
            data-pull-close
            className={`${styles.envelope} ${pick(styles.envIn, styles.fadeIn)}`}
          >
            <span className={styles.envFlap} />
            <span className={styles.envBody} />
          </div>

          <div key={m.id} className={styles.paperStack}>
            <article
              aria-labelledby={titleId}
              className={`${styles.sheet} ${pick(styles.unfold, styles.sheetCalm)}`}
            >
              <header className={styles.head} data-pull-close>
                <PostageStamp icon={s.icon} year={postmarkYear(m.createdAt)} />
                <h2 id={titleId} className={styles.address}>
                  <span className={styles.to}>{memory ? "إلى روح" : "إلى"}</span>{" "}
                  <span className={styles.name}>{displayTo(m)}</span>
                </h2>
                {m.school && <p className={styles.school}>{m.school}</p>}
              </header>

              <div className={styles.body}>{m.body}</div>

              <footer className={styles.closing}>
                <div className={styles.sign}>
                  <p className={`${hasLongRun(signer) ? "" : "font-hand"} ${styles.from}`}>
                    <span aria-hidden="true" className={styles.dash}>
                      —
                    </span>
                    {signer}
                  </p>
                  <time dateTime={m.createdAt} className={styles.date}>
                    {(hydrated && formatDate(m.createdAt)) || " "}
                  </time>
                </div>
                <span className={`stamp ${styles.rubber} ${pick(styles.rubberIn, styles.fadeLate)}`}>
                  {stampFor(m)}
                </span>
              </footer>

              <div className={styles.sheetEnd}>
                <ReportButton message={m} />
              </div>
            </article>

            <WaxSeal
              m={m}
              color={memory ? "#a99fb3" : s.accent}
              className={pick(styles.sealTravel, styles.fadeIn)}
            />
            {entry === "full" && <FoldingLetter />}
          </div>
        </div>

        {(neighbours.prev || neighbours.next) && (
          <nav aria-label="التنقل بين الرسائل" className={styles.stepper}>
            <button
              type="button"
              disabled={!neighbours.prev}
              onClick={() => step(neighbours.prev)}
              className={styles.stepBtn}
            >
              <ArrowGlyph dir="right" size={18} /> السابقة
            </button>
            <span aria-hidden="true" className={styles.stepHint}>
              اسحب للتنقل
            </span>
            <button
              type="button"
              disabled={!neighbours.next}
              onClick={() => step(neighbours.next)}
              className={styles.stepBtn}
            >
              التالية <ArrowGlyph dir="left" size={18} />
            </button>
          </nav>
        )}

        <div
          className={`${styles.actions} ${memory ? styles.actionsPair : ""} ${entry === "none" ? "" : styles.actionsIn}`}
          data-no-swipe
        >
          <LikeButton message={m} size="md" />
          <ShareMenu message={m} mode="compact" className={styles.shareBtn} />
          {!memory && (
            <a
              href={GIFT_URL}
              target="_blank"
              rel="noopener"
              onClick={() => track("gift_click", { from: "letter" })}
              className={`btn btn-primary ${styles.gift}`}
            >
              <GiftGlyph />
              <span>
                <span className={styles.giftVerb}>{female ? "أرسل لها " : "أرسل له "}</span>
                هدية
              </span>
              <span className="visually-hidden"> (تفتح في صفحة جديدة)</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The triangle-folded letter from the 3D scene, laid over the sheet: its three
 * flaps swing open around their outer edges while the sheet underneath grows
 * from the triangle to the full page. Removes itself when done.
 */
function FoldingLetter() {
  const [done, setDone] = useState(false);
  // Never leave the flaps over the letter, even if animations don't run.
  useEffect(() => {
    const t = window.setTimeout(() => setDone(true), 1600);
    return () => window.clearTimeout(t);
  }, []);
  if (done) return null;
  return (
    <span
      aria-hidden="true"
      className={styles.fold}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setDone(true);
      }}
    >
      <span className={styles.foldShadow} />
      <span className={`${styles.flap} ${styles.flapB}`} />
      <span className={`${styles.flap} ${styles.flapL}`} />
      <span className={`${styles.flap} ${styles.flapR}`} />
    </span>
  );
}
