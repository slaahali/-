// Line glyphs for the letter view's chrome. Decorative: meaning comes from labels.

type GlyphProps = { size?: number; className?: string };

const svg = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  focusable: "false" as const,
  className,
});

export function CloseGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg {...svg(size, className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Arrow pointing physically left (←) or right (→). */
export function ArrowGlyph({ size = 22, className, dir }: GlyphProps & { dir: "left" | "right" }) {
  return (
    <svg {...svg(size, className)}>
      <path d={dir === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} />
    </svg>
  );
}

export function GiftGlyph({ size = 20, className }: GlyphProps) {
  return (
    <svg {...svg(size, className)}>
      <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
      <path d="M5 12.5V20h14v-7.5M12 8v12" />
      <path d="M12 8c-1.2-3.4-5.6-4.6-6.2-2-.4 1.8 2.6 2.3 6.2 2Zm0 0c1.2-3.4 5.6-4.6 6.2-2 .4 1.8-2.6 2.3-6.2 2Z" />
    </svg>
  );
}
