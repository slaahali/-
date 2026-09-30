"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type ToastKind = "success" | "error" | "info";

export interface ToastInput {
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const MAX_TOASTS = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { ...t, id }]);
      const ms = t.kind === "error" ? 7000 : t.action ? 6000 : 3500;
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { toasts, push, dismiss };
}

const TONE: Record<ToastKind, string> = {
  success: "bg-plum-900 text-white",
  info: "bg-ink text-white",
  error: "bg-danger text-white",
};

const ICON: Record<ToastKind, string> = { success: "✓", info: "ℹ", error: "!" };

export function Toaster({
  toasts,
  onDismiss,
  raised = false,
}: {
  toasts: ReadonlyArray<Toast>;
  onDismiss: (id: number) => void;
  /** Lift above the sticky bulk-action bar. */
  raised?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 transition-[bottom]",
        // The bulk bar wraps to two rows on phones.
        raised ? "bottom-40 sm:bottom-24" : "bottom-4",
      )}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-lift",
            TONE[t.kind],
          )}
        >
          <span
            aria-hidden
            className="grid size-5 shrink-0 place-items-center rounded-full bg-white/20 text-xs font-bold"
          >
            {ICON[t.kind]}
          </span>
          <p className="min-w-0 flex-1 leading-snug">{t.text}</p>
          {t.action ? (
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 font-bold text-orange-300 hover:bg-white/10"
              onClick={() => {
                t.action?.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="إغلاق التنبيه"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => onDismiss(t.id)}
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
      ))}
    </div>
  );
}
