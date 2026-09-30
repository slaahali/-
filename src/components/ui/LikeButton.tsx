"use client";

import { useRef, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { prefersReducedMotion } from "@/components/wall/hooks";
import { cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { play } from "@/lib/sound";
import type { PublicMessage } from "@/lib/types";

const HEART =
  "M12 20.4s-7.4-4.5-9.2-9.1C1.5 8 3.5 4.6 6.9 4.6c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.4 0 5.4 3.4 4.1 6.7-1.8 4.6-9.2 9.1-9.2 9.1Z";
const BURST_COLORS = ["#eb652c", "#f7a64f", "#a73784", "#eb652c", "#f7a64f", "#a73784"];

/**
 * ❤ like (🤍 "دعوة بالرحمة" for in-memory letters). Optimistic via useLetters();
 * the pop/burst + sound run on click only (burst skipped for reduced motion).
 * "sm" is the quiet card version (heart + count), "md" the labelled one.
 */
export function LikeButton({
  message,
  size = "md",
}: {
  message: PublicMessage;
  size?: "sm" | "md";
}) {
  const { isLiked, likeCount, toggleLike } = useLetters();
  const liked = isLiked(message.id);
  const count = likeCount(message);
  const memory = message.inMemory;
  const { accent, ink } = cardStyle(message);

  const heartRef = useRef<SVGSVGElement>(null);
  const burstRef = useRef<HTMLSpanElement>(null);

  function animate(nowLiked: boolean) {
    const heart = heartRef.current;
    if (!heart || typeof heart.animate !== "function" || prefersReducedMotion()) return;
    if (memory) {
      heart.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 650, easing: "ease-out" });
      return;
    }
    if (!nowLiked) {
      heart.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.82)" }, { transform: "scale(1)" }],
        {
          duration: 220,
          easing: "ease-out",
        },
      );
      return;
    }
    heart.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.4)", offset: 0.35 },
        { transform: "scale(0.9)", offset: 0.7 },
        { transform: "scale(1)" },
      ],
      { duration: 520, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
    const dots = burstRef.current?.children;
    if (!dots) return;
    const dist = size === "sm" ? 17 : 21;
    Array.from(dots).forEach((el, i) => {
      const a = (i / dots.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * dist;
      const y = Math.sin(a) * dist;
      el.animate(
        [
          { transform: "translate(0, 0) scale(0.4)", opacity: 0 },
          { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${x * 1.3}px, ${y * 1.3}px) scale(0.2)`, opacity: 0 },
        ],
        { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
  }

  const quiet = size === "sm";
  let cls: string;
  let style: CSSProperties | undefined;
  if (quiet) {
    // On a card: just the heart and the count, in the card's ink.
    cls = `min-h-11 min-w-11 justify-center gap-1.5 px-2.5 text-[0.95rem] hover:bg-white/55 ${
      liked ? "font-bold" : "font-semibold"
    }`;
    style = { color: ink };
  } else if (memory) {
    cls = `min-h-12 gap-2 border-[1.5px] px-5 text-base ${
      liked ? "bg-white font-bold" : "bg-white/60 font-semibold hover:bg-white"
    }`;
    style = {
      color: ink,
      borderColor: `color-mix(in srgb, ${accent} ${liked ? 55 : 28}%, transparent)`,
    };
  } else {
    cls = `min-h-12 gap-2 border-[1.5px] px-5 text-base ${
      liked
        ? "border-orange/40 bg-orange-50 font-bold text-orange-700"
        : "border-plum/20 bg-white/65 font-semibold text-plum hover:border-plum/45 hover:bg-white"
    }`;
  }

  const heartFill = memory ? (liked ? "#fff" : "none") : liked ? "#eb652c" : "none";
  const heartStroke = memory ? accent : liked ? "#eb652c" : "currentColor";
  // On cards the label is only for screen readers, except the memory wording.
  const hideLabel = quiet && !memory;

  return (
    <button
      type="button"
      aria-pressed={liked}
      onClick={() => {
        animate(!liked);
        if (!liked) void play(memory ? "chime" : "like");
        void toggleLike(message);
      }}
      style={style}
      className={`inline-flex shrink-0 items-center rounded-full leading-none transition-[background-color,border-color,color] duration-200 ${cls}`}
    >
      <span className="relative inline-grid place-items-center">
        <svg
          ref={heartRef}
          width={size === "sm" ? 20 : 22}
          height={size === "sm" ? 20 : 22}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          style={memory && liked ? { filter: `drop-shadow(0 0 4px ${accent}66)` } : undefined}
        >
          <path
            d={HEART}
            fill={heartFill}
            stroke={heartStroke}
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
        </svg>
        {!memory && (
          <span ref={burstRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
            {BURST_COLORS.map((c, i) => (
              <span
                key={i}
                className="absolute inset-0 m-auto size-[6px] rounded-full opacity-0"
                style={{ background: c }}
              />
            ))}
          </span>
        )}
      </span>
      <span className={hideLabel ? "visually-hidden" : quiet ? "text-[0.85rem]" : undefined}>
        {memory ? COPY.memoryLike : COPY.like}
      </span>
      {count > 0 && <span className="tabular-nums opacity-80">{formatCount(count)}</span>}
    </button>
  );
}
