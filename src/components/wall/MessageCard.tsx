"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useLetters } from "@/components/LettersProvider";
import { ShareMenu } from "@/components/share/ShareMenu";
import { LikeButton } from "@/components/ui/LikeButton";
import { ReportButton } from "@/components/ui/ReportButton";
import { cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { play } from "@/lib/sound";
import { displayTo, fromName, toLine } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";
import { PostageStamp } from "./PostageStamp";
import { looksLong, postmarkDate, tiltFor } from "./wall-utils";
import styles from "./wall.module.css";

/**
 * One letter on the wall, drawn as a folded note in the writer's envelope
 * colour: postage stamp + postmark, an address block, the first lines, the
 * signature and a dog-eared corner. The name is a stretched button, so a tap
 * anywhere opens the letter; like / share / ⋯ sit above it as their own buttons.
 */
export function MessageCard({
  message: m,
  index = 0,
  fresh = false,
  leaving = false,
}: {
  message: PublicMessage;
  /** Position on the wall (drives the hand-pinned tilt). */
  index?: number;
  /** Just published by this visitor: highlighted with a «جديدة» tag. */
  fresh?: boolean;
  /** No longer public: fades out before the wall drops it. */
  leaving?: boolean;
}) {
  const { openLetter } = useLetters();
  const s = cardStyle(m);
  const titleId = useId();
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(() => looksLong(m.body, 6));

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
  // «إلى» / «إلى روح» on its own line, like the first line of an address.
  const to = (line.endsWith(name) ? line.slice(0, line.length - name.length) : COPY.labelTo)
    .replace(/[:：]\s*$/, "")
    .trim();
  const memory = m.inMemory;
  const showFresh = fresh && !memory;
  const date = postmarkDate(m.createdAt);

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
      <span aria-hidden="true" className={styles.paper}>
        <span className={styles.sheet} />
        <span className={styles.dogEar} />
      </span>
      <PostageStamp message={m} />
      {showFresh && <span className={styles.freshTag}>جديدة</span>}

      <header className={styles.address}>
        <h3 id={titleId}>
          {/* The card plays the paper sound itself; LetterModal skips openers inside #letters. */}
          <button
            type="button"
            onClick={() => {
              void play("open");
              openLetter(m);
            }}
            className={styles.open}
          >
            <span className={styles.to}>{to}</span>
            <span className={styles.name}>{name}</span>
          </button>
        </h3>
        {m.school && <p className={styles.school}>{m.school}</p>}
      </header>

      <span aria-hidden="true" className={styles.crease} />

      <p ref={bodyRef} className={`${styles.body} ${clamped ? styles.clamped : ""}`}>
        {m.body}
      </p>

      <div className={styles.signoff}>
        {clamped && (
          <span aria-hidden="true" className={styles.readMore}>
            {COPY.readMore} <span>←</span>
          </span>
        )}
        <p className={`font-hand ${styles.signature}`}>— {fromName(m)}</p>
      </div>
      {date && (
        <time dateTime={m.createdAt} className="visually-hidden">
          {date.day} {date.month}
        </time>
      )}

      <div className={styles.actions}>
        <LikeButton message={m} size="sm" />
        <div className="ms-auto flex items-center">
          <ShareMenu
            message={m}
            mode="compact"
            className="border-transparent bg-transparent text-[color:var(--card-ink)] opacity-75 hover:border-transparent hover:bg-white/60 hover:opacity-100"
          />
          <ReportButton message={m} compact />
        </div>
      </div>
    </article>
  );
}

export function SkeletonCard({ lines = 5 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className={styles.skeleton}>
      <span className={styles.bar} style={{ width: "14%", height: "0.6rem" }} />
      <span className={styles.bar} style={{ width: "52%", height: "1.2rem" }} />
      <span className={styles.bar} style={{ width: "34%", height: "0.6rem" }} />
      <span className="h-2" />
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.bar} style={{ width: i === lines - 1 ? "58%" : "100%" }} />
      ))}
      <span className={styles.bar} style={{ width: "26%", height: "1rem", marginInlineStart: "auto" }} />
    </div>
  );
}
