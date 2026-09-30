"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS, type IconName } from "@/lib/assets";

const EMOJI_FALLBACK: Record<IconName, string> = {
  letter: "💌",
  gift: "🎁",
  books: "📚",
  pencil: "✏️",
  cap: "🎓",
  plane: "✉️",
  search: "🔍",
  heart: "💜",
};

/**
 * One of the Higgsfield 3D icons. Tries the self-hosted copy first (/public/3d),
 * then the original CDN file, and finally degrades to an emoji so layouts never
 * break when neither is reachable.
 */
export function Icon3D({
  name,
  size = 96,
  className = "",
  decorative = true,
  priority = false,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Decorative icons get empty alt text so screen readers skip them. */
  decorative?: boolean;
  priority?: boolean;
}) {
  const icon = ICONS[name];
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // An image that failed before hydration never fires React's onError.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setStage((s) => (s === 0 ? 1 : 2));
    }
  }, [stage]);

  if (stage === 2) {
    return (
      <span
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : icon.alt}
        className={`inline-grid select-none place-items-center ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.56, lineHeight: 1 }}
      >
        {EMOJI_FALLBACK[name]}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- transparent PNGs with a runtime CDN fallback
    <img
      ref={imgRef}
      src={stage === 0 ? icon.local : icon.remote}
      alt={decorative ? "" : icon.alt}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setStage((s) => (s === 0 ? 1 : 2))}
      className={`select-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
