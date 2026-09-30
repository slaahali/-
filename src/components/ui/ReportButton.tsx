"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useLetters, useOpenLetter } from "@/components/LettersProvider";
import {
  CheckGlyph,
  CloseGlyph,
  FlagGlyph,
  LockGlyph,
  MoreGlyph,
  Spinner,
} from "@/components/wall/glyphs";
import { prefersReducedMotion } from "@/components/wall/hooks";
import { reportMessage } from "@/lib/api-client";
import { COPY } from "@/lib/config";
import { emitLetterHidden } from "@/lib/events";
import { track } from "@/lib/track";
import type { PublicMessage, ReportReason } from "@/lib/types";

/** Dispatched on window (detail: { id }) once a report took a letter off the wall. */
export { LETTER_HIDDEN_EVENT } from "@/lib/events";

const REASONS: ReportReason[] = ["inappropriate", "removal_request", "other"];
const NOTE_MAX = 200;
const REMOVAL_HINT = "لو أنت الشخص المذكور بنخفيها فوراً ونراجع طلبك";
const REPORTED = "تم الإبلاغ";

// ---- ids this browser already reported (localStorage, shared by every button) ----
const REPORTED_KEY = "tcz_reported_v1";
let reported: Set<string> | null = null;
const reportedListeners = new Set<() => void>();

function readReported(): Set<string> {
  if (!reported) {
    try {
      const raw = window.localStorage.getItem(REPORTED_KEY);
      reported = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      reported = new Set();
    }
  }
  return reported;
}

function markReported(id: string) {
  const next = new Set(readReported());
  next.add(id);
  reported = next;
  try {
    window.localStorage.setItem(REPORTED_KEY, JSON.stringify([...next].slice(-300)));
  } catch {
    /* private mode — fine, it's only a visual hint */
  }
  for (const fn of reportedListeners) fn();
}

function subscribeReported(fn: () => void) {
  reportedListeners.add(fn);
  return () => {
    reportedListeners.delete(fn);
  };
}

function useWasReported(id: string): boolean {
  return useSyncExternalStore(
    subscribeReported,
    () => readReported().has(id),
    () => false,
  );
}

/**
 * «إبلاغ / طلب حذف» → a small sheet with the reasons (native modal <dialog>, so
 * it sits above cards and the letter view). `compact` is the card's quiet «⋯».
 */
export function ReportButton({
  message,
  compact = false,
  className = "",
}: {
  message: PublicMessage;
  /** Icon-only trigger (cards). */
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wasReported = useWasReported(message.id);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? (wasReported ? `${COPY.report} (${REPORTED})` : COPY.report) : undefined}
        title={compact ? COPY.report : undefined}
        className={
          compact
            ? `grid size-11 shrink-0 place-items-center rounded-full opacity-65 transition-[opacity,background-color] duration-200 hover:bg-white/60 hover:opacity-100 ${className}`
            : `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-ink-soft transition-colors duration-200 hover:bg-white/70 hover:text-plum ${className}`
        }
      >
        {compact ? (
          <MoreGlyph size={20} />
        ) : (
          <>
            <FlagGlyph size={17} filled={wasReported} />
            <span>{COPY.report}</span>
          </>
        )}
      </button>
      {open && <ReportDialog message={message} onClosed={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ message, onClosed }: { message: PublicMessage; onClosed: () => void }) {
  const { closeLetter } = useLetters();
  const { openMessage } = useOpenLetter();
  const ref = useRef<HTMLDialogElement>(null);
  const hiddenRef = useRef(false);
  const closedRef = useRef(false);
  const downOnBackdrop = useRef(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"form" | "sending" | "done" | "error">("form");
  const [hidden, setHidden] = useState(false);
  const titleId = useId();
  const noteId = useId();
  const radioName = useId();

  useLayoutEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    if (prefersReducedMotion() || typeof d.animate !== "function") return;
    d.animate(
      [
        { opacity: 0, transform: "translateY(28px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, []);

  const notifyHidden = () => {
    emitLetterHidden(message.id);
    if (openMessage?.id === message.id) closeLetter();
  };

  const close = () => ref.current?.close();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason || phase === "sending") return;
    setPhase("sending");
    const res = await reportMessage(message.id, reason, note.trim() || undefined);
    if (!res) {
      if (!closedRef.current) setPhase("error");
      return;
    }
    markReported(message.id);
    track("letter_report", { reason });
    hiddenRef.current = res.hidden;
    if (closedRef.current) {
      // Closed while sending: still take the card away.
      if (res.hidden) notifyHidden();
      return;
    }
    setHidden(res.hidden);
    setPhase("done");
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        closedRef.current = true;
        if (hiddenRef.current) notifyHidden();
        onClosed();
      }}
      // Clicks on the ::backdrop target the <dialog> itself; ignore drags that end there.
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 m-0 mt-auto h-fit max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border-0 bg-paper p-0 text-start font-sans text-base leading-relaxed text-ink shadow-[0_-20px_60px_-20px_rgb(43_10_32/0.45)] backdrop:bg-plum-950/45 backdrop:backdrop-blur-[3px] sm:m-auto sm:max-w-md sm:rounded-[28px] sm:shadow-[0_30px_80px_-24px_rgb(43_10_32/0.55)]"
    >
      <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7 sm:pt-6 sm:pb-7">
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line-strong sm:hidden"
        />
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-orange-700">
            <FlagGlyph size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-plum">
              {COPY.report}
            </h2>
            <p className="text-sm text-ink-soft">نبي الجدار يبقى مكان آمن ولطيف للكل</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="إغلاق"
            className="-me-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-plum-50 hover:text-plum"
          >
            <CloseGlyph size={18} stroke={2} />
          </button>
        </div>

        {phase === "done" ? (
          <div className="py-5 text-center">
            <div
              aria-hidden="true"
              className="mx-auto grid size-14 place-items-center rounded-full bg-plum-50 text-plum"
            >
              <CheckGlyph size={26} />
            </div>
            <p role="status" className="mt-4 text-lg font-bold text-plum">
              {hidden ? COPY.removalDone : COPY.reportDone}
            </p>
            <button type="button" autoFocus onClick={close} className="btn btn-plum mt-6 w-full">
              تمام
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <fieldset>
              <legend className="mb-2 text-[0.95rem] font-bold text-ink">وش السبب؟</legend>
              <div className="grid gap-2">
                {REASONS.map((r) => {
                  const checked = reason === r;
                  return (
                    <label
                      key={r}
                      className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-4 py-2.5 transition-colors duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-orange ${
                        checked
                          ? "border-plum bg-plum-50 text-plum"
                          : "border-line-strong bg-white hover:border-plum-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name={radioName}
                        value={r}
                        checked={checked}
                        onChange={() => setReason(r)}
                        className="size-5 shrink-0 accent-plum focus-visible:outline-none"
                      />
                      <span className="font-semibold">{COPY.reportReasons[r]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {reason === "removal_request" && (
              <p className="flex gap-2 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700">
                <LockGlyph size={16} className="mt-[0.2em] shrink-0" />
                {REMOVAL_HINT}
              </p>
            )}

            <div>
              <label htmlFor={noteId} className="field-label">
                ملاحظة <span className="field-optional">{COPY.optional}</span>
              </label>
              <textarea
                id={noteId}
                rows={3}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="تبي توضّح لنا أكثر؟"
                className="field min-h-24 resize-none leading-relaxed"
              />
              <p className="mt-1 text-end text-caption text-ink-mute tabular-nums">
                {note.length}/{NOTE_MAX}
              </p>
            </div>

            {phase === "error" && (
              <p role="alert" className="field-error">
                {COPY.genericError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={!reason || phase === "sending"}
                className="btn btn-primary flex-1"
              >
                {phase === "sending" ? (
                  <>
                    <Spinner size={18} /> {COPY.submitting}
                  </>
                ) : (
                  COPY.submit
                )}
              </button>
              <button type="button" onClick={close} className="btn btn-ghost">
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
