"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BTN } from "./ui";

/** Native modal <dialog>: focus trap + Esc for free; Cancel gets the initial focus. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={body ? `${id}-body` : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // Browsers may close it without a cancelable `cancel` (e.g. a repeated Esc);
      // keep React state in sync so the board's shortcuts don't stay blocked.
      onClose={() => {
        if (open) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(27rem,calc(100%-2rem))] rounded-2xl border border-line bg-paper p-0 text-ink shadow-lift backdrop:bg-plum-950/45"
    >
      <div className="p-5">
        <h2 id={`${id}-title`} className="text-lg font-bold text-plum">
          {title}
        </h2>
        {body ? (
          <div id={`${id}-body`} className="mt-2 text-sm leading-relaxed text-ink-soft">
            {body}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" className={BTN.quiet} onClick={onCancel}>
            إلغاء
          </button>
          <button
            type="button"
            className={tone === "danger" ? BTN.dangerSolid : BTN.primary}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
