"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLetters, useOpenLetter } from "@/components/LettersProvider";
import { COPY } from "@/lib/config";
import { formatCount, toSceneLetter } from "@/lib/format";
import { track } from "@/lib/track";
import type { PublicMessage } from "@/lib/types";

const LettersScene = dynamic(() => import("@/components/scene/LettersScene"), {
  ssr: false,
  loading: () => null,
});

const loadImmersive = () => import("@/components/scene/ImmersiveLetters");
// Fetched on first hover/focus of the CTA, mounted on first open.
const ImmersiveLetters = dynamic(loadImmersive, { ssr: false, loading: () => null });

const MAX_SCENE_LETTERS = 40;

// "كلنا كان لنا" + the emphasised last word ("معلّم"). At display size the
// font lifts the shadda into the line above, so the big word drops it.
const TITLE_WORDS = COPY.heroTitle.trim().split(/\s+/);
const TITLE_LAST = (TITLE_WORDS.pop() ?? "").replace(/\u0651/g, "");
const TITLE_START = TITLE_WORDS.join(" ");

const fade = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export function Hero({ letters }: { letters: PublicMessage[] }) {
  const { total, openLetter, hiddenIds, remember } = useLetters();
  const { openMessage } = useOpenLetter();
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [immersiveMounted, setImmersiveMounted] = useState(false);
  const exploreRef = useRef<HTMLButtonElement>(null);

  const visible = useMemo(() => letters.filter((m) => !hiddenIds.has(m.id)), [letters, hiddenIds]);
  const sceneLetters = useMemo(
    () => visible.slice(0, MAX_SCENE_LETTERS).map(toSceneLetter),
    [visible],
  );

  const openImmersive = () => {
    setImmersiveMounted(true);
    setImmersiveOpen(true);
    track("immersive_open", {});
  };

  const closeImmersive = useCallback(() => {
    setImmersiveOpen(false);
    exploreRef.current?.focus({ preventScroll: true });
  }, []);

  const [first, second] = COPY.heroLead;

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[92svh] flex-col overflow-hidden md:min-h-[92vh]"
    >
      {/* Warm glows: peach top-start, plum bottom-end (RTL: start = right). */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{
          background: [
            "radial-gradient(58% 48% at 92% 4%, rgb(253 230 219 / 0.95), transparent 72%)",
            "radial-gradient(52% 46% at 6% 98%, rgb(244 230 238 / 0.95), transparent 72%)",
            "var(--color-canvas)",
          ].join(", "),
        }}
      />
      {/* Phones: the plum glow fades out before the section edge, so no lavender
          strip shows under the header when a link lands on #write. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-linear-to-b from-canvas/0 to-canvas sm:hidden"
      />

      <div className="absolute inset-0">
        <LettersScene
          letters={sceneLetters}
          onOpen={openLetter}
          paused={openMessage !== null || immersiveOpen}
          className="h-full w-full"
        />
      </div>

      {/* Foreground: the wrapper ignores the pointer so floating letters stay hoverable. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-[4.5rem] pb-12 text-center sm:pt-28 sm:pb-20">
        <div className="relative isolate flex w-full max-w-[26rem] flex-col items-center sm:max-w-3xl">
          <div
            aria-hidden
            className="absolute -inset-x-10 -inset-y-12 -z-10 sm:-inset-x-24 sm:-inset-y-14"
            style={{
              background:
                "radial-gradient(closest-side, rgb(251 247 242 / 0.95), rgb(251 247 242 / 0.78) 58%, rgb(251 247 242 / 0) 100%)",
            }}
          />

          <p
            className="flex animate-fade-up items-center gap-2.5 text-[0.95rem] font-bold text-orange-700"
            style={fade(0)}
          >
            <CancelLines />
            {COPY.badge}
            <CancelLines flip />
          </p>

          <h1
            id="hero-title"
            className="mt-3 animate-fade-up text-[2.875rem] leading-[1.12] font-bold text-plum min-[400px]:text-[3.1rem] sm:mt-4 sm:text-[length:clamp(3.3rem,2.1rem+4.6vw,6rem)]"
            style={fade(90)}
          >
            <span className="block sm:inline">{TITLE_START}</span>{" "}
            <span className="relative inline-block text-[1.12em] text-orange">
              {TITLE_LAST}
              <svg
                aria-hidden
                viewBox="0 0 200 18"
                preserveAspectRatio="none"
                className="absolute inset-x-[-4%] -bottom-1.5 h-3.5 w-[108%] text-orange-300"
              >
                <path
                  d="M4 12 C 50 3, 120 3, 196 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mt-4 max-w-[34rem] animate-fade-up text-body leading-7 text-pretty text-ink-soft sm:mt-6 sm:text-lg sm:leading-9"
            style={fade(180)}
          >
            {first} <span className="sm:block">{second}</span>
          </p>

          <div
            className="pointer-events-auto mt-7 grid w-full animate-fade-up gap-3 sm:mt-8 sm:flex sm:w-auto sm:justify-center"
            style={fade(270)}
          >
            <a href="#write" className="btn btn-primary text-[1.05rem] sm:min-w-[11rem]">
              {COPY.heroCtaWrite}
            </a>
            <button
              ref={exploreRef}
              type="button"
              onClick={openImmersive}
              onPointerEnter={() => void loadImmersive()}
              onFocus={() => void loadImmersive()}
              aria-haspopup="dialog"
              className="btn btn-ghost text-[1.05rem]"
            >
              <FoldedLetterIcon className="size-5 shrink-0" />
              {COPY.heroCtaExplore}
            </button>
          </div>

          <CounterNote total={total} style={fade(360)} />

          <p
            className="mt-3 hidden max-w-sm animate-fade-up text-[0.9rem] leading-6 text-ink-soft md:pointer-fine:block"
            style={fade(450)}
          >
            {COPY.sceneHint}
          </p>
        </div>
      </div>

      {immersiveMounted && (
        // The scene components play the "open" sound inside their own click handlers.
        <ImmersiveLetters
          open={immersiveOpen}
          onClose={closeImmersive}
          onOpen={openLetter}
          seed={visible}
          paused={openMessage !== null}
          onMessages={remember}
        />
      )}
    </section>
  );
}

/** The live count, written like a note in the margin, with a link down to the search. */
function CounterNote({ total, style }: { total: number; style: CSSProperties }) {
  return (
    <div className="mt-5 flex animate-fade-up items-start gap-2 text-start sm:mt-7" style={style}>
      <svg
        aria-hidden
        viewBox="0 0 48 40"
        className="mt-1 h-8 w-10 shrink-0 text-orange"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* A pen-drawn arrow curling up towards the buttons. */}
        <path d="M6 34c10 1 20-3 26-11 4-6 5-12 4-18" />
        <path d="M30 9l6-5 4 7" />
      </svg>
      <p className="-rotate-2 leading-7 text-plum">
        {total > 0 ? (
          <>
            <span className="font-bold">
              <CountText text={COPY.heroCount(total, formatCount(total))} shown={formatCount(total)} />
            </span>
            <br />
            <span className="text-ink-soft">{COPY.heroSearchNote} </span>
            <a
              href="#letters"
              className="pointer-events-auto inline-flex min-h-11 items-center font-bold text-orange-700 underline decoration-orange-300 decoration-2 underline-offset-[6px] hover:decoration-orange-700"
            >
              {COPY.heroCtaSearch}
            </a>
          </>
        ) : (
          <span className="font-bold">{COPY.emptyWall}</span>
        )}
      </p>
    </div>
  );
}

/** Molhim's «ر» swings under a digit before it: give the leading number some air. */
function CountText({ text, shown }: { text: string; shown: string }) {
  if (!text.startsWith(`${shown} `)) return <>{text}</>;
  return (
    <>
      <span className="me-1">{shown}</span>
      {text.slice(shown.length)}
    </>
  );
}

/** Postmark cancellation waves around the date line. */
function CancelLines({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 36 14"
      className={`h-3.5 w-9 text-orange-300 ${flip ? "-scale-x-100" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M1 3.5c4-2.5 7 2.5 11 0s7 2.5 11 0 7 2.5 12 0" />
      <path d="M1 10.5c4-2.5 7 2.5 11 0s7 2.5 11 0 7 2.5 12 0" />
    </svg>
  );
}

/** A triangle-folded letter, like the ones flying in the scene. */
function FoldedLetterIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M3 6.5h18L12 20z" />
      <path d="M3 6.5l9 6.5 9-6.5" />
      <circle cx="12" cy="11.2" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
