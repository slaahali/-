"use client";

import { useEffect, useId, useRef, useState } from "react";
import { sealFor } from "@/lib/assets";
import { mix } from "./letter-utils";
import styles from "./letter.module.css";

// Irregular wax puddle (precomputed so server and client render the same path).
const WAX =
  "M93.5 50C93.9 52.5 93.5 55.1 93.2 57.6C92.9 60.2 93.3 63.2 91.9 65.2C90.5 67.3 86.7 68.3 84.9 70.1C83 71.9 82.3 74 81 76C79.6 78 78.5 80.2 76.8 81.9C75.1 83.6 72.8 84.5 70.8 86.1C68.8 87.6 67.3 90.6 64.9 91C62.6 91.5 59.3 89 56.8 88.7C54.3 88.4 52.3 89 50 89.2C47.7 89.4 45.6 89.2 43 89.8C40.4 90.4 36.8 93.3 34.4 92.8C32 92.4 30.6 88.7 28.6 87.1C26.5 85.5 24.3 84.6 22.1 83.2C20 81.8 17.3 80.7 15.7 78.8C14 76.9 12.9 74.3 12.2 71.8C11.6 69.3 11.9 66.4 11.8 63.9C11.8 61.4 12.1 59 11.9 56.7C11.8 54.4 11.2 52.3 11 50C10.8 47.7 10.4 45.3 10.6 43.1C10.8 40.8 11.5 38.5 12.3 36.3C13.1 34.1 14.4 32.2 15.3 30C16.1 27.7 16.2 24.7 17.4 22.6C18.6 20.5 20.6 18.7 22.5 17.3C24.5 15.8 26.9 14.9 29.2 13.9C31.4 13 33.7 12.3 36 11.5C38.3 10.7 40.5 9.9 42.8 9.1C45.1 8.3 47.5 7.1 50 6.7C52.5 6.3 55.2 6.2 57.6 6.9C60 7.6 62.3 9.2 64.3 10.8C66.2 12.4 67.8 14.6 69.5 16.3C71.2 18 72.7 19.4 74.4 20.9C76.1 22.4 78 23.6 79.7 25.1C81.3 26.7 82.9 28.4 84.3 30.2C85.7 32.1 86.7 34.1 87.9 36.2C89 38.3 90.2 40.5 91.1 42.8C92.1 45 93.2 47.5 93.5 50Z";

const HEART =
  "M12 20.4s-7.4-4.5-9.2-9.1C1.5 8 3.5 4.6 6.9 4.6c2 0 3.6 1.1 5.1 3 1.5-1.9 3.1-3 5.1-3 3.4 0 5.4 3.4 4.1 6.7-1.8 4.6-9.2 9.1-9.2 9.1Z";

/** Stamped motif, drawn on the 100×100 seal grid. */
function Motif({ memory, fill }: { memory: boolean; fill: string }) {
  if (!memory) return <path d={HEART} transform="translate(31.4 31.1) scale(1.55)" fill={fill} />;
  return (
    <g fill={fill}>
      <path d="M30.5 57.5c4.8-2.2 9.4-3.2 14.2-3.2 5.2 0 9.8 1 13.9-1.2 2-2.9 4.4-4.9 7.4-4.9 2.6 0 4.3 1.4 4.8 3.1l3.6 1-3.8 1.3c-.9 4.4-5.6 8.4-12.6 9.4-7.9 1.1-15.9-.4-22-2.5l-7 2.8 1.5-5.8Z" />
      <path d="M43.5 54.4c0-8.1 4.6-15.2 13.8-19.6-1.3 6.2-.4 12.2 2.8 17.6-5.2 1.8-10.7 2.4-16.6 2Z" />
    </g>
  );
}

/** Flat fallback seal: a wax puddle in the letter's accent with an embossed heart (dove for memory). */
function SealArt({ color, memory }: { color: string; memory: boolean }) {
  const id = useId().replace(/:/g, "");
  const light = mix(color, "#ffffff", 0.38);
  const dark = mix(color, "#000000", 0.38);
  return (
    <svg viewBox="0 0 100 100" className={styles.sealArt} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}w`} cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={color} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <path d={WAX} fill={`url(#${id}w)`} />
      {/* the pressed field: a shaded rim and a slightly deeper centre */}
      <circle cx="50" cy="50" r="29" fill={mix(color, "#000000", 0.1)} />
      <circle cx="50" cy="50" r="29" fill="none" stroke={dark} strokeOpacity="0.55" strokeWidth="2.4" />
      <circle cx="50.9" cy="51.1" r="30.2" fill="none" stroke={light} strokeOpacity="0.55" strokeWidth="1.1" />
      <g transform="translate(1.1 1.3)">
        <Motif memory={memory} fill={dark} />
      </g>
      <g transform="translate(-0.8 -0.9)">
        <Motif memory={memory} fill={light} />
      </g>
      <Motif memory={memory} fill={mix(color, "#000000", 0.04)} />
    </svg>
  );
}

/**
 * The wax seal, already broken in two: the Higgsfield render (self-hosted copy,
 * then the CDN) or the drawn fallback. Both halves show the same art, each
 * clipped along a jagged crack.
 */
export function WaxSeal({
  m,
  color,
  className = "",
}: {
  m: { variant: number; inMemory?: boolean };
  color: string;
  className?: string;
}) {
  const src = sealFor(m);
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires React's onError.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setStage((s) => (s === 0 ? 1 : 2));
  }, [stage]);

  const fail = () => setStage((s) => (s === 0 ? 1 : 2));
  const memory = Boolean(m.inMemory);

  const art = (half: 0 | 1) =>
    stage === 2 ? (
      <SealArt color={color} memory={memory} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- transparent render with a runtime CDN + SVG fallback
      <img
        ref={half === 0 ? imgRef : undefined}
        src={stage === 0 ? src.local : src.remote}
        alt=""
        width={96}
        height={96}
        decoding="async"
        draggable={false}
        onError={half === 0 ? fail : undefined}
        className={styles.sealImg}
      />
    );

  return (
    <span aria-hidden="true" className={`${styles.seal} ${className}`}>
      <span className={`${styles.sealHalf} ${styles.sealA}`}>{art(0)}</span>
      <span className={`${styles.sealHalf} ${styles.sealB}`}>{art(1)}</span>
    </span>
  );
}
