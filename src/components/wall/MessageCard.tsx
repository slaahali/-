"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { ShareMenu } from "@/components/share/ShareMenu";
import { LikeButton } from "@/components/ui/LikeButton";
import { ReportButton } from "@/components/ui/ReportButton";
import { cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { displayTo, fromName, timeAgo, toLine } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";
import { SchoolGlyph } from "./glyphs";
import { useHydrated } from "./hooks";
import { looksLong, tiltFor } from "./wall-utils";
import styles from "./wall.module.css";

/**
 * One colourful letter on the wall. The whole card is a stretched button that
 * opens the letter view; like / share / report sit above it as separate buttons.
 */
export function MessageCard({
  message: m,
  index = 0,
  fresh = false,
  leaving = false,
}: {
  message: PublicMessage;
  /** Position on the wall (drives the alternating tilt). */
  index?: number;
  /** Just published by this visitor: glow + «جديدة» badge. */
  fresh?: boolean;
  /** No longer public: fades out before the wall drops it. */
  leaving?: boolean;
}) {
  const { openLetter } = useLetters();
  const s = cardStyle(m);
  const hydrated = useHydrated();
  const titleId = useId();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(() => looksLong(m.body));

  // Only fade the text out when it is really cut off.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setClamped(el.scrollHeight > el.clientHeight + 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const name = displayTo(m);
  const line = toLine(m);
  const prefix = line.endsWith(name)
    ? line.slice(0, line.length - name.length).trim()
    : COPY.labelTo;
  const memory = m.inMemory;
  const showFresh = fresh && !memory;

  const vars = {
    "--card-bg": s.bg,
    "--card-ink": s.ink,
    "--card-accent": s.accent,
    "--tilt": `${memory ? 0 : tiltFor(index)}deg`,
  } as CSSProperties;

  const cls = [
    styles.card,
    memory && styles.memory,
    showFresh && styles.fresh,
    leaving && styles.leaving,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article aria-labelledby={titleId} className={cls} style={vars}>
      <span aria-hidden="true" className={styles.deco} />
      <span aria-hidden="true" className={styles.seal}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20.4s-7.4-4.5-9.2-9.1C1.5 8 3.5 4.6 6.9 4.6c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.4 0 5.4 3.4 4.1 6.7-1.8 4.6-9.2 9.1-9.2 9.1Z" />
        </svg>
      </span>
      {showFresh && <span className={styles.freshBadge}>جديدة ✨</span>}

      <header className="flex flex-col gap-1 pe-11">
        {memory && <span className={styles.memoryTag}>{COPY.memoryTag}</span>}
        <h3 id={titleId}>
          <button type="button" onClick={() => openLetter(m)} className={styles.open}>
            <span className="block text-[0.8rem] font-semibold opacity-70">{prefix}</span>
            <span className="block text-[1.3rem] leading-snug font-bold [overflow-wrap:anywhere]">
              {name}
            </span>
          </button>
        </h3>
        {m.school && (
          <p className="flex items-start gap-1.5 text-[0.85rem] leading-snug opacity-75">
            <SchoolGlyph className="mt-[0.2em] shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{m.school}</span>
          </p>
        )}
      </header>

      <p ref={bodyRef} className={`${styles.body} ${clamped ? styles.clamped : ""}`}>
        {m.body}
      </p>
      <span aria-hidden="true" className={styles.readMore}>
        {COPY.readMore} <span>←</span>
      </span>

      <div className="flex items-end justify-between gap-3">
        <p className={`font-hand min-w-0 text-[1.25rem] leading-tight ${styles.signature}`}>
          — {fromName(m)}
        </p>
        <time dateTime={m.createdAt} className="shrink-0 pb-0.5 text-xs opacity-60">
          {hydrated ? timeAgo(m.createdAt) : ""}
        </time>
      </div>

      <div className={styles.actions}>
        <LikeButton message={m} size="sm" />
        <div className="ms-auto flex items-center">
          <ShareMenu message={m} mode="compact" />
          <ReportButton message={m} compact />
        </div>
      </div>
    </article>
  );
}

export function SkeletonCard({ lines = 5 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className={styles.skeleton}>
      <span className={styles.bar} style={{ width: "22%", height: "0.6rem" }} />
      <span className={styles.bar} style={{ width: "58%", height: "1.15rem" }} />
      <span className={styles.bar} style={{ width: "40%", height: "0.6rem" }} />
      <span className="h-1" />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.bar} style={{ width: i === lines - 1 ? "62%" : "100%" }} />
      ))}
      <span className="h-1" />
      <span className={styles.bar} style={{ width: "34%", height: "1rem" }} />
    </div>
  );
}
