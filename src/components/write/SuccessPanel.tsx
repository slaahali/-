"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { GiftLink } from "@/components/layout/GiftLink";
import { ShareMenu } from "@/components/share/ShareMenu";
import { Icon3D } from "@/components/ui/Icon3D";
import { cardStyle } from "@/lib/assets";
import { letterPalette } from "@/components/letter/letter-utils";
import { COPY } from "@/lib/config";
import { displayTo, excerpt, fromName, stampFor } from "@/lib/format";
import type { PublicMessage, TeacherTitle } from "@/lib/types";

const isFeminine = (t: TeacherTitle | null) => t === "ustadha" || t === "dr_f";

// COPY.successLead asks them to share it "with your teacher" — not right for «في ذكرى».
const MEMORY_SUCCESS_LEAD = "رسالتك صارت على جدار الامتنان 🤍 شاركها مع اللي يعرفونه عشان يدعون له.";

export function SuccessPanel({
  message,
  status,
  onReset,
}: {
  message: PublicMessage;
  status: "published" | "pending";
  onReset: () => void;
}) {
  const { openLetter } = useLetters();
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const published = status === "published";

  // Bring the panel into view (the form it replaces was taller) and move focus to it.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "start" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const title = published ? COPY.successTitle : COPY.pendingTitle;
  const lead = !published
    ? COPY.pendingLead
    : message.inMemory
      ? MEMORY_SUCCESS_LEAD
      : COPY.successLead;

  return (
    <div
      ref={rootRef}
      aria-live="polite"
      className="paper relative isolate scroll-mt-4 animate-fade-up px-5 pt-4 pb-7 text-center sm:scroll-mt-24 sm:px-10 sm:pt-6 sm:pb-9"
    >
      {/* 4:3 render in a square box: trim the empty band above and below.
          Smaller on phones, so the share options make the first screen. */}
      <div className="mx-auto -mt-2 -mb-3 w-fit sm:-my-6">
        <Icon3D
          name="envelope"
          size={220}
          priority
          className="max-w-full size-[150px]! sm:size-[220px]!"
        />
      </div>

      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 text-h3 leading-snug font-bold text-plum focus:outline-none sm:text-[2rem]"
      >
        {title}
      </h3>
      {!published && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[0.95rem] font-bold text-orange-700">
          <ClockIcon className="size-4" />
          {COPY.pendingTag}
        </p>
      )}
      <p className="mx-auto mt-2 max-w-md leading-7 text-balance text-ink-soft sm:leading-8">{lead}</p>

      <LetterNote message={message} />

      {published && (
        <div className="mt-7 flex justify-center">
          <ShareMenu message={message} mode="full" />
        </div>
      )}

      {!message.inMemory && <GiftNote feminine={isFeminine(message.title)} />}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
        {published && (
          <button type="button" className="btn btn-ghost" onClick={() => openLetter(message)}>
            شوف رسالتك على الجدار
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          {COPY.writeAnother}
        </button>
      </div>
    </div>
  );
}

/** What they just wrote, as a folded note in the envelope's colour. */
function LetterNote({ message }: { message: PublicMessage }) {
  const look = cardStyle(message);
  // Same contrast-safe inks as the letter view (raw accents are too light on orange/gold/peach).
  const ink = letterPalette(look);
  return (
    <article
      aria-label="معاينة رسالتك"
      className="relative mx-auto mt-7 max-w-md -rotate-1 overflow-hidden rounded-[0.3rem] px-5 pt-4 pb-5 text-start shadow-[var(--shadow-sheet)]"
      style={
        {
          backgroundColor: look.bg,
          backgroundImage: "var(--paper-grain)",
          color: look.ink,
          "--fold": `color-mix(in srgb, ${look.bg} 84%, #2a1422)`,
        } as CSSProperties
      }
    >
      <p className="text-[0.9rem] font-bold opacity-80">{message.inMemory ? "إلى روح" : "إلى"}</p>
      <p className="text-[1.3rem] leading-snug font-bold break-words">{displayTo(message)}</p>
      {message.school && <p className="text-[0.95rem] break-words opacity-80">{message.school}</p>}
      <p className="mt-3 leading-8 break-words whitespace-pre-line max-sm:line-clamp-4">
        {excerpt(message.body, 160)}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-hand text-[1.35rem] leading-tight font-bold" style={{ color: ink.accentInk }}>
          — {fromName(message)}
        </p>
        <span aria-hidden className="stamp -mb-1 text-[0.95rem]" style={{ color: ink.stampInk }}>
          {stampFor(message)}
        </span>
      </div>
      {/* Dog-eared bottom-start corner (start = right; the page is always RTL). */}
      <span
        aria-hidden
        className="absolute start-0 bottom-0 size-6"
        style={{ background: "linear-gradient(135deg, var(--fold) 50%, var(--color-sheet) 50%)" }}
      />
    </article>
  );
}

function GiftNote({ feminine }: { feminine: boolean }) {
  return (
    // Phones: the icon beside the two lines, the button full-width under them.
    <div className="mx-auto mt-7 grid max-w-md grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-t border-dashed border-line-strong pt-6 text-start sm:flex sm:flex-row sm:gap-4">
      <Icon3D name="gift" size={72} className="size-12! shrink-0 sm:-my-2 sm:size-[72px]!" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-plum">
          {feminine ? "تبي ترسل لها هدية؟" : "تبي ترسل له هدية؟"}
        </p>
        {/* The no-break space keeps the wink with its word (no lone emoji line). */}
        <p className="mt-0.5 text-[0.95rem] leading-7 text-ink-soft max-sm:text-balance">
          {feminine
            ? "أرسل لها هدية من ذا شفز، ما يحتاج لوكيشن\u00a0😉"
            : "أرسل له هدية من ذا شفز، ما يحتاج لوكيشن\u00a0😉"}
        </p>
      </div>
      <GiftLink from="success" className="btn btn-plum col-span-2 w-full shrink-0 sm:w-auto">
        أرسل هدية
      </GiftLink>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.8V8l2.2 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
