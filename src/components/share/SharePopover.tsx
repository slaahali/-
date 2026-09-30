"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { canNativeShare } from "@/lib/share/links";
import { CloseIcon } from "./icons";

// Shared building blocks for ShareMenu / ShareSearch: the popover (≥640px) /
// bottom sheet (phones), a toast, and small hooks.

/** Quiet outlined button: plum text, line border, ≥44px tall (search share trigger). */
export const PILL =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-[1.5px] border-line bg-white/80 px-4 py-2 text-[0.95rem] leading-tight font-bold whitespace-nowrap text-plum transition-[border-color,background-color,transform] duration-200 hover:border-plum-200 hover:bg-white active:scale-[0.97] disabled:cursor-progress disabled:opacity-75";

/** Round share-target tile (icon over a short label), laid out in a row. */
export const TILE =
  "flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-1 pt-1.5 pb-2 text-[0.8rem] leading-tight font-bold text-plum transition-colors duration-150 hover:bg-plum-50/70 focus-visible:bg-plum-50/70";
export const TILE_ICON = "grid size-12 place-items-center rounded-full";

const noopSubscribe = () => () => {};

/** Web Share support. false on the server and during hydration, the real value after. */
export function useCanNativeShare(): boolean {
  return useSyncExternalStore(noopSubscribe, canNativeShare, () => false);
}

/** A short message that clears itself (copy confirmations, toasts). */
export function useFlash(ms: number): [string | null, (msg: string | null) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(
    (next: string | null) => {
      clearTimeout(timer.current);
      setMsg(next);
      if (next) timer.current = setTimeout(() => setMsg(null), ms);
    },
    [ms],
  );
  return [msg, flash];
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const FOCUSABLE = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";
/** Items that take part in initial focus + arrow-key navigation. */
export const SHARE_ITEM = "data-share-item";

export interface SharePopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** restoreFocus: move focus back to the trigger (Esc, backdrop, after an action). */
  onClose: (opts: { restoreFocus: boolean }) => void;
  id: string;
  /** Dialog name, shown as the sheet's title. */
  label: string;
  /** Small line under the sheet title (e.g. «إلى: أستاذة نورة»). */
  subtitle?: string;
  children: ReactNode;
}

/**
 * Popover anchored to the trigger on ≥640px, bottom sheet on phones. Rendered in
 * a portal with fixed positioning so tilted / overflow-hidden cards can't clip it,
 * and above the letter view (z-90) and the immersive overlay (z-80).
 */
export function SharePopover(props: SharePopoverProps) {
  if (!props.open) return null;
  return createPortal(<Panel {...props} />, document.body);
}

function Panel({ anchorRef, onClose, id, label, subtitle, children }: Omit<SharePopoverProps, "open">) {
  const [sheet] = useState(() => !window.matchMedia("(min-width: 640px)").matches);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Popover placement: below the trigger (above when there's no room), the
  // popover's right edge on the trigger's right edge (RTL start), kept on screen.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (sheet || !panel) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const m = 8;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      let top = a.bottom + m;
      if (top + h > window.innerHeight - m && a.top - m - h >= m) top = a.top - m - h;
      let left = a.right - w;
      if (left < m) left = a.left;
      left = Math.min(Math.max(m, left), window.innerWidth - w - m);
      panel.style.top = `${Math.round(Math.max(m, top))}px`;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.visibility = "visible";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [sheet, anchorRef]);

  // Enter animation, initial focus, scroll lock (sheet), dismissal listeners.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!reducedMotion()) {
      if (sheet) {
        panel.animate([{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], {
          duration: 320,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
        backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
      } else {
        panel.animate(
          [
            { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 160, easing: "ease-out" },
        );
      }
    }
    panel.querySelector<HTMLElement>(`[${SHARE_ITEM}]:not([disabled])`)?.focus({ preventScroll: true });

    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    if (sheet) root.style.overflow = "hidden";

    const inside = (t: EventTarget | null) =>
      t instanceof Node && (panel.contains(t) || Boolean(anchorRef.current?.contains(t)));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current({ restoreFocus: true });
      } else if (e.key === "Tab") {
        // Sheet (modal): Tab cycles inside. Popover: tabbing past either end
        // closes it and goes back to the trigger — the popover is portalled to
        // the end of <body>, so the browser would otherwise drop focus on the
        // page (or on nothing, inside the inert letter view).
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!panel.contains(active)) {
          if (!sheet) return;
          e.preventDefault();
          first.focus();
          return;
        }
        if (active !== (e.shiftKey ? first : last)) return;
        e.preventDefault();
        if (sheet) (e.shiftKey ? last : first).focus();
        else onCloseRef.current({ restoreFocus: true });
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      // The sheet's backdrop closes on click: closing on pointerdown would remove
      // it mid-tap and the click would land on the card underneath.
      if (inside(e.target) || (e.target instanceof Node && rootRef.current?.contains(e.target))) return;
      // Clicking something focusable lets the browser move focus there.
      const focusable = e.target instanceof Element && e.target.closest("a, button, input, textarea, select, [tabindex]");
      onCloseRef.current({ restoreFocus: !focusable });
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!sheet && !inside(e.target)) onCloseRef.current({ restoreFocus: false });
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn);
      if (sheet) root.style.overflow = prevOverflow;
    };
  }, [sheet, anchorRef]);

  // Arrow keys move between items (tiles run in a row, so ←/→ work too).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(`[${SHARE_ITEM}]:not([disabled])`)];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    // RTL: ← moves forward.
    const fwd = e.key === "ArrowDown" || e.key === "ArrowLeft";
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (i + (fwd ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  // Swipe the sheet down (from its header) to dismiss it.
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || (e.target instanceof Element && e.target.closest("button"))) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    d.dy = Math.max(0, e.clientY - d.y);
    panel.style.transform = `translateY(${d.dy}px)`;
  };
  const onDragEnd = () => {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 90 || speed > 0.6) {
      onCloseRef.current({ restoreFocus: true });
      return;
    }
    panel.style.transition = "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)";
    panel.style.transform = "";
    setTimeout(() => {
      if (panelRef.current) panelRef.current.style.transition = "";
    }, 220);
  };

  // Portal content still bubbles through React to the card; keep clicks here.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  if (sheet) {
    return (
      <div ref={rootRef} className="fixed inset-0 z-[100]" onClick={stop} onKeyDown={onKeyDown}>
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="absolute inset-0 bg-plum-950/40"
          onClick={() => onCloseRef.current({ restoreFocus: true })}
        />
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[26px] bg-paper px-4 shadow-lift"
          style={{ paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))" }}
        >
          <div
            className="-mx-4 cursor-grab touch-none px-4 pt-2.5 pb-1 select-none"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-line-strong" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 ps-1">
                <p className="text-lg leading-snug font-bold text-plum">{label}</p>
                {subtitle && <p className="truncate text-sm text-ink-soft">{subtitle}</p>}
              </div>
              <button
                type="button"
                className="icon-btn -me-1 shrink-0 border-transparent bg-transparent"
                aria-label="إغلاق"
                onClick={() => onCloseRef.current({ restoreFocus: true })}
              >
                <CloseIcon size={18} />
              </button>
            </div>
          </div>
          <div className="pt-3">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={label}
      className="fixed z-[100] w-[21rem] max-w-[calc(100vw-1rem)] rounded-[22px] border border-line bg-paper p-3 shadow-lift"
      style={{ top: 0, left: 0, visibility: "hidden" }}
      onClick={stop}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/** Small confirmation note near the bottom of the viewport (clears a sticky bottom bar). */
export function ShareToast({ message }: { message: string | null }) {
  if (!message) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-4"
      style={{ paddingBottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 5.5rem)" }}
    >
      <p className="rounded-2xl bg-plum-950 px-5 py-3 text-center text-sm font-bold text-white shadow-lift">{message}</p>
    </div>,
    document.body,
  );
}
