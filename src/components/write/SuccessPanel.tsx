"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { GiftLink } from "@/components/layout/GiftLink";
import { ShareMenu } from "@/components/share/ShareMenu";
import { Icon3D } from "@/components/ui/Icon3D";
import { cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { excerpt, fromName, stampFor, toLine } from "@/lib/format";
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
      className="paper-plain relative isolate scroll-mt-24 animate-fade-up overflow-hidden px-5 pt-8 pb-7 text-center sm:px-10 sm:pt-10 sm:pb-9"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-56"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgb(253 230 219 / 0.85), rgb(250 243 247 / 0.5) 60%, transparent)",
        }}
      />

      <div className="mx-auto w-fit animate-float" style={{ "--r": "-4deg" } as CSSProperties}>
        <Icon3D name={message.inMemory ? "letter" : "heart"} size={120} priority />
      </div>

      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-[1.65rem] leading-snug font-bold text-plum focus:outline-none sm:text-3xl"
      >
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-md leading-7 text-balance text-ink-soft">{lead}</p>
      {!published && (
        <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-plum-50 px-3.5 py-1 text-sm font-semibold text-plum">
          <span aria-hidden>⏳</span> تحت المراجعة
        </p>
      )}

      <LetterPreview message={message} />

      {published && (
        <div className="mt-6 flex justify-center">
          <ShareMenu message={message} mode="full" />
        </div>
      )}

      {!message.inMemory && <GiftCard feminine={isFeminine(message.title)} />}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {published && (
          <button type="button" className="btn btn-ghost" onClick={() => openLetter(message)}>
            شوف رسالتك على الجدار
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          {COPY.writeAnother} ✍️
        </button>
      </div>
    </div>
  );
}

/** Small coloured card of what they just wrote. */
function LetterPreview({ message }: { message: PublicMessage }) {
  const look = cardStyle(message);
  return (
    <article
      aria-label="معاينة رسالتك"
      className="relative mx-auto mt-7 max-w-md overflow-hidden rounded-card text-start shadow-soft"
      style={{ backgroundColor: look.bg, color: look.ink }}
    >
      <div aria-hidden className="h-1.5" style={{ backgroundColor: look.accent }} />
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[1.05rem] leading-snug font-bold break-words">{toLine(message)}</p>
            {message.school && <p className="mt-0.5 text-sm break-words opacity-75">{message.school}</p>}
          </div>
          {message.inMemory && (
            <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-bold">
              {COPY.memoryTag}
            </span>
          )}
        </div>
        <p className="mt-3 leading-7 break-words whitespace-pre-line">{excerpt(message.body, 160)}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <span aria-hidden className="stamp text-[0.95rem]" style={{ color: look.accent }}>
            {stampFor(message)}
          </span>
          <p className="font-hand text-xl leading-tight font-bold">— {fromName(message)}</p>
        </div>
      </div>
    </article>
  );
}

function GiftCard({ feminine }: { feminine: boolean }) {
  return (
    <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-card border border-orange-100 bg-orange-50 px-5 py-5 sm:flex-row sm:gap-4 sm:text-start">
      <Icon3D name="gift" size={88} className="-my-2 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-plum">
          {feminine ? "تبي ترسل لها هدية؟ 🎁" : "تبي ترسل له هدية؟ 🎁"}
        </p>
        <p className="mt-1 text-sm leading-6 text-ink-soft">
          {feminine
            ? "أرسل لها هدية من ذا شفز — ما يحتاج لوكيشن 😉"
            : "أرسل له هدية من ذا شفز — ما يحتاج لوكيشن 😉"}
        </p>
      </div>
      <GiftLink from="success" className="btn btn-plum w-full shrink-0 sm:w-auto">
        أرسل هدية
      </GiftLink>
    </div>
  );
}
