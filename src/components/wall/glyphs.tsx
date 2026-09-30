// Small inline SVG glyphs used by the wall, cards and the letter view.
// All decorative (aria-hidden); meaning always comes from adjacent text/labels.

type GlyphProps = { className?: string; size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true as const,
  focusable: "false" as const,
});

export function SchoolGlyph({ className, size = 14 }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M12 3 2.5 8 12 13l9.5-5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M6 10.2V15c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.8M21.5 8v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchGlyph({ className, size = 22 }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function CloseGlyph({
  className,
  size = 20,
  stroke = 1.8,
}: GlyphProps & { stroke?: number }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Arrow pointing physically left (←) or right (→). */
export function ArrowGlyph({ className, size = 22, dir }: GlyphProps & { dir: "left" | "right" }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d={dir === "left" ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlagGlyph({
  className,
  size = 18,
  filled = false,
}: GlyphProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M5 21V4.5m0 0c3.5-2 6.5 1.6 10 0 1.4-.6 2.5-.8 4-.5v9c-1.5-.3-2.6-.1-4 .5-3.5 1.6-6.5-2-10 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.25 : undefined}
      />
    </svg>
  );
}

export function Spinner({ className = "", size = 18 }: GlyphProps) {
  return (
    <svg {...base(size)} className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
