"use client";

import dynamic from "next/dynamic";
import { useMemo, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { Icon3D } from "@/components/ui/Icon3D";
import type { IconName } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { formatCount, toSceneLetter } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";

const LettersScene = dynamic(() => import("@/components/scene/LettersScene"), {
  ssr: false,
  loading: () => null,
});

const MAX_SCENE_LETTERS = 40;

/** Always-on CSS layer so the hero never looks empty (before WebGL loads, or without it). */
const FLOATERS: ReadonlyArray<{
  name: IconName;
  size: number;
  /** Position + responsive size/visibility (smaller and fewer on phones). */
  cls: string;
  r: string;
  delay: string;
}> = [
  { name: "letter", size: 104, cls: "top-[10%] start-[1%] scale-[0.55] md:top-[16%] md:start-[3%] md:scale-100", r: "-10deg", delay: "0s" },
  { name: "plane", size: 92, cls: "top-[11%] end-[1%] scale-[0.55] md:top-[19%] md:end-[4%] md:scale-100", r: "8deg", delay: "-2.4s" },
  { name: "pencil", size: 84, cls: "hidden bottom-[13%] start-[7%] md:block", r: "14deg", delay: "-4.1s" },
  { name: "heart", size: 88, cls: "bottom-[6%] end-[2%] scale-[0.55] md:bottom-[10%] md:end-[6%] md:scale-100", r: "-6deg", delay: "-1.2s" },
  { name: "books", size: 96, cls: "hidden top-[48%] end-[1.5%] lg:block", r: "-4deg", delay: "-5.3s" },
];

// "كلنا كان لنا" + a handwritten, highlighted last word ("معلّم").
const TITLE_WORDS = COPY.heroTitle.trim().split(/\s+/);
const TITLE_LAST = TITLE_WORDS.pop() ?? "";
const TITLE_START = TITLE_WORDS.join(" ");

const fade = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export function Hero({ letters }: { letters: PublicMessage[] }) {
  const { total, openLetter } = useLetters();
  const sceneLetters = useMemo(
    () => letters.slice(0, MAX_SCENE_LETTERS).map(toSceneLetter),
    [letters],
  );

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[88svh] flex-col overflow-hidden md:min-h-[92vh]"
    >
      {/* Warm glows: peach top-start, plum bottom-end, cream centre (RTL: start = right). */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{
          background: [
            "radial-gradient(58% 48% at 92% 4%, rgb(253 230 219 / 0.95), transparent 72%)",
            "radial-gradient(52% 46% at 6% 98%, rgb(244 230 238 / 0.95), transparent 72%)",
            "radial-gradient(46% 40% at 50% 52%, rgb(248 243 236 / 0.9), transparent 78%)",
            "var(--color-canvas)",
          ].join(", "),
        }}
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {FLOATERS.map((f) => (
          <div key={f.name} className={`absolute ${f.cls}`}>
            <div
              className="animate-float opacity-90 drop-shadow-[0_18px_22px_rgb(105_29_78/0.14)]"
              style={{ "--r": f.r, animationDelay: f.delay } as CSSProperties}
            >
              <Icon3D name={f.name} size={f.size} />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-0">
        <LettersScene letters={sceneLetters} onOpen={openLetter} className="h-full w-full" />
      </div>

      {/* Foreground: the wrapper ignores the pointer so floating letters stay hoverable. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-4 pt-[5.5rem] pb-20 text-center sm:pt-28 sm:pb-24">
        <div className="relative isolate flex max-w-3xl flex-col items-center">
          <div
            aria-hidden
            className="absolute -inset-x-16 -inset-y-14 -z-10 sm:-inset-x-24"
            style={{
              background:
                "radial-gradient(closest-side, rgb(251 247 242 / 0.94), rgb(251 247 242 / 0.72) 55%, rgb(251 247 242 / 0) 100%)",
            }}
          />

          <span className="eyebrow animate-fade-up bg-white/80 backdrop-blur-sm" style={fade(0)}>
            {COPY.badge}
          </span>

          <h1
            id="hero-title"
            className="mt-5 animate-fade-up text-[length:clamp(2.7rem,1.45rem+5.4vw,5.75rem)] leading-[1.18] font-bold tracking-tight text-balance text-plum"
            style={fade(90)}
          >
            {TITLE_START}
            <br />
            <span className="font-hand relative inline-block px-1 text-[1.18em] leading-[1.05] font-bold text-orange">
              {TITLE_LAST}
              <svg
                aria-hidden
                viewBox="0 0 200 18"
                preserveAspectRatio="none"
                className="absolute inset-x-0 -bottom-1 h-3 w-full text-orange-300"
              >
                <path
                  d="M4 12 C 50 3, 120 3, 196 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            <span className="inline-block align-[0.08em] text-[0.82em]">{COPY.heroTitleEmoji}</span>
          </h1>

          <p
            className="mt-5 max-w-[36rem] animate-fade-up text-base leading-7 text-balance text-ink-soft sm:mt-6 sm:text-lg sm:leading-9"
            style={fade(180)}
          >
            {COPY.heroLead.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>

          <div
            className="pointer-events-auto mt-8 flex animate-fade-up flex-wrap items-center justify-center gap-3"
            style={fade(270)}
          >
            <a href="#write" className="btn btn-primary min-w-[9.5rem] text-[1.05rem]">
              {COPY.heroCtaWrite}
            </a>
            <a href="#letters" className="btn btn-ghost min-w-[9.5rem] text-[1.05rem]">
              {COPY.heroCtaSearch}
            </a>
          </div>

          <p
            className="mt-6 inline-flex animate-fade-up items-center gap-2 rounded-full border border-plum-100 bg-white/75 px-4 py-1.5 text-sm font-semibold text-plum shadow-soft backdrop-blur-sm sm:text-[0.95rem]"
            style={fade(360)}
          >
            <span aria-hidden>💌</span>
            <span>
              <b className="font-bold tabular-nums">{formatCount(total)}</b> رسالة شكر وصلت لمعلمينهم
            </span>
          </p>

          <p
            className="mt-4 hidden max-w-sm animate-fade-up text-[0.85rem] leading-6 text-ink-mute md:pointer-fine:block"
            style={fade(450)}
          >
            {COPY.sceneHint}
          </p>
        </div>
      </div>

      <a
        href="#write"
        aria-label="انزل لكتابة رسالتك"
        className="absolute inset-x-0 bottom-4 z-10 mx-auto grid size-11 animate-fade-up place-items-center rounded-full border border-plum-100 bg-white/70 text-plum shadow-soft backdrop-blur-sm transition-colors hover:bg-white sm:bottom-6"
        style={fade(600)}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5 animate-bounce"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </a>
    </section>
  );
}
