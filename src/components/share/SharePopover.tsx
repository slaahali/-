"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { canNativeShare } from "@/lib/share/links";
import { CloseIcon } from "./icons";

// Shared building blocks for ShareMenu / ShareSearch: the popover (≥640px) /
// bottom sheet (mobile), a toast, and small hooks.

/** White pill button: plum text, line border, ≥44px tall. */
export const PILL =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border-[1.5px] border-line bg-white px-4 py-2 text-[0.95rem] leading-tight font-bold whitespace-nowrap text-plum transition-[border-color,background-color,transform] duration-200 hover:border-plum-200 hover:bg-plum-50 active:scale-[0.97] disabled:cursor-progress disabled:opacity-75";

/** Row inside the popover / sheet. Tagged with data-share-item for focus + arrow keys. */
export const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-start text-base font-bold text-plum transition-colors duration-150 hover:bg-plum-50 focus-visible:bg-plum-50 disabled:cursor-progress disabled:opacity-75";

/** Round icon holder at the start of a menu row. */
export const MENU_ICON = "grid size-9 shrink-0 place-items-center rounded-full bg-plum-50";

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

export interface SharePopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** restoreFocus: move focus back to the trigger (Esc, backdrop, after an action). */
  onClose: (opts: { restoreFocus: boolean }) => void;
  id: string;
  label: string;
  children: ReactNode;
}

/**
 * Popover anchored to the trigger on ≥640px, bottom sheet on phones. Rendered in
 * a portal with fixed positioning so tilted / overflow-hidden cards can't clip it.
 */
export function SharePopover(props: SharePopoverProps) {
  if (!props.open) return null;
  return createPortal(<Panel {...props} />, document.body);
}

function Panel({ anchorRef, onClose, id, label, children }: Omit<SharePopoverProps, "open">) {
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
          duration: 300,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
        backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease-out" });
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
    panel.querySelector<HTMLElement>("[data-share-item]:not([disabled])")?.focus({ preventScroll: true });

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
      } else if (e.key === "Tab" && sheet) {
        // Modal sheet: keep Tab inside.
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
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

  // Arrow keys move between rows.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-share-item]:not([disabled])")];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  // Portal content still bubbles through React to the card; keep clicks here.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  if (sheet) {
    return (
      <div ref={rootRef} className="fixed inset-0 z-[90]" onClick={stop} onKeyDown={onKeyDown}>
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="absolute inset-0 bg-plum-950/45"
          onClick={() => onCloseRef.current({ restoreFocus: true })}
        />
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] bg-white px-4 pt-2.5 shadow-lift"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line-strong" />
          <div className="mb-1 flex items-center justify-between gap-3 ps-1">
            <p className="text-base font-bold text-plum">{label}</p>
            <button
              type="button"
              className="icon-btn"
              aria-label="إغلاق"
              onClick={() => onCloseRef.current({ restoreFocus: true })}
            >
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 pb-1">{children}</div>
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
      className="fixed z-[90] flex w-64 flex-col gap-0.5 rounded-3xl border border-line bg-white p-2 shadow-lift"
      style={{ top: 0, left: 0, visibility: "hidden" }}
      onClick={stop}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/** Small confirmation pill at the bottom of the viewport. */
export function ShareToast({ message }: { message: string | null }) {
  if (!message) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[95] flex justify-center px-4"
      style={{ paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
    >
      <p className="rounded-full bg-plum px-5 py-3 text-center text-sm font-bold text-white shadow-lift">{message}</p>
    </div>,
    document.body,
  );
}
