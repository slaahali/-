"use client";

import { useRef, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { prefersReducedMotion } from "@/components/wall/hooks";
import { cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { formatCount } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";

const HEART =
  "M12 20.4s-7.4-4.5-9.2-9.1C1.5 8 3.5 4.6 6.9 4.6c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.4 0 5.4 3.4 4.1 6.7-1.8 4.6-9.2 9.1-9.2 9.1Z";
const BURST_COLORS = ["#eb652c", "#f7a64f", "#a73784", "#eb652c", "#f7a64f", "#a73784"];

/**
 * ❤ like (🤍 "دعوة بالرحمة" for in-memory letters). Optimistic via useLetters();
 * the pop/burst runs on click only and is skipped for reduced motion.
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

  const sizeCls =
    size === "sm" ? "min-h-11 gap-1.5 px-3.5 text-[0.9rem]" : "min-h-12 gap-2 px-5 text-base";

  let toneCls: string;
  let style: CSSProperties | undefined;
  if (memory) {
    toneCls = liked ? "bg-white font-bold" : "bg-white/60 hover:bg-white";
    style = {
      color: ink,
      borderColor: `color-mix(in srgb, ${accent} ${liked ? 55 : 28}%, transparent)`,
    };
  } else {
    toneCls = liked
      ? "border-orange/40 bg-orange-50 font-bold text-orange-700"
      : "border-plum/20 bg-white/65 text-plum hover:border-plum/45 hover:bg-white";
  }

  const heartFill = memory ? (liked ? "#fff" : "none") : liked ? "#eb652c" : "none";
  const heartStroke = memory ? accent : liked ? "#eb652c" : "currentColor";

  return (
    <button
      type="button"
      aria-pressed={liked}
      onClick={() => {
        animate(!liked);
        void toggleLike(message);
      }}
      style={style}
      className={`inline-flex shrink-0 items-center rounded-full border-[1.5px] font-semibold leading-none transition-[background-color,border-color,color] duration-200 ${sizeCls} ${toneCls}`}
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
      <span>{memory ? COPY.memoryLike : COPY.like}</span>
      {count > 0 && <span className="tabular-nums opacity-80">{formatCount(count)}</span>}
    </button>
  );
}
