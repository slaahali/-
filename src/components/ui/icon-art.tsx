import type { IconName } from "@/lib/assets";

// Flat duotone drawings used when a 3D render isn't available. Same subjects
// and palette as the Higgsfield icons: plum outlines, cream paper, one orange
// accent. Drawn on a 64×64 grid with 3px strokes so they sit well at 40–160px.

const P = "#691d4e"; // plum
const O = "#eb652c"; // orange
const C = "#fffaf3"; // cream paper
const G = "#f7c87a"; // soft gold
const S = { stroke: P, strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const ART: Record<IconName, React.ReactNode> = {
  letter: (
    <>
      <path d="M8 18h48L32 50Z" fill={C} {...S} />
      <path d="M8 18l24 16 24-16" fill="none" {...S} />
      <circle cx="32" cy="32" r="7.5" fill={O} />
      <path d="M32 35.6c-2.7-1.8-4.1-3.2-4.1-4.7 0-1.1.9-2 2-2 .8 0 1.6.5 2.1 1.2.5-.7 1.3-1.2 2.1-1.2 1.1 0 2 .9 2 2 0 1.5-1.4 2.9-4.1 4.7Z" fill={C} />
    </>
  ),
  envelope: (
    <>
      <rect x="9" y="24" width="46" height="30" rx="4" fill={P} />
      <path d="M9 28l23 15 23-15" fill="none" stroke={C} strokeWidth="3" strokeLinejoin="round" />
      <path d="M22 26l5-15 12 4-5 15" fill={C} {...S} />
      <path d="M36 21l9-10 8 7-8 9" fill={C} {...S} />
      <circle cx="46" cy="12" r="3" fill={O} />
    </>
  ),
  gift: (
    <>
      <rect x="11" y="26" width="42" height="28" rx="4" fill={O} {...S} />
      <rect x="8" y="19" width="48" height="10" rx="3" fill={O} {...S} />
      <path d="M32 19v35" {...S} />
      <path d="M32 19c-3-7-12-9-13-3-.6 3.4 5 3.6 13 3Zm0 0c3-7 12-9 13-3 .6 3.4-5 3.6-13 3Z" fill={C} {...S} />
    </>
  ),
  books: (
    <>
      <rect x="10" y="40" width="44" height="10" rx="2.5" fill={P} {...S} />
      <rect x="13" y="30" width="40" height="10" rx="2.5" fill={C} {...S} />
      <path d="M46 32v6" stroke={O} strokeWidth="3" strokeLinecap="round" />
      <path d="M33 30c-6 0-9-4-9-9s4-8 9-6c5-2 9 1 9 6s-3 9-9 9Z" fill={O} {...S} />
      <path d="M33 15c0-3 2-5 5-6" fill="none" {...S} />
    </>
  ),
  pencil: (
    <>
      <path d="M14 50l4-12 26-26 8 8-26 26Z" fill={P} {...S} />
      <path d="M44 12l8 8 3-3a3 3 0 0 0 0-4l-4-4a3 3 0 0 0-4 0Z" fill={O} {...S} />
      <path d="M18 38l8 8" {...S} />
      <path d="M14 50l4-12 8 8Z" fill={C} {...S} />
      <path d="M40 16l8 8" stroke={G} strokeWidth="3" />
    </>
  ),
  cap: (
    <>
      <path d="M4 26l28-12 28 12-28 12Z" fill={P} {...S} />
      <path d="M16 31v10c0 4 7 8 16 8s16-4 16-8V31" fill={C} {...S} />
      <path d="M56 28v14" stroke={G} strokeWidth="3" strokeLinecap="round" />
      <circle cx="56" cy="45" r="3.5" fill={O} />
    </>
  ),
  plane: (
    <>
      <path d="M6 30l52-20-14 44-12-14Z" fill={C} {...S} />
      <path d="M32 40l26-30" {...S} />
      <path d="M32 40v12l7-7" fill={C} {...S} />
      <path d="M12 46c4 0 6 2 8 4" stroke={O} strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  search: (
    <>
      <circle cx="27" cy="27" r="15" fill={C} {...S} />
      <path d="M38 38l14 14" stroke={P} strokeWidth="6" strokeLinecap="round" />
      <path d="M20 24a8 8 0 0 1 7-6" stroke={O} strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  heart: (
    <>
      <path d="M32 54C14 42 7 33 7 23c0-7 5-12 12-12 5 0 9 3 13 8 4-5 8-8 13-8 7 0 12 5 12 12 0 10-7 19-25 31Z" fill={O} {...S} />
      <path d="M17 22c0-3 2-5 5-5" stroke={C} strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function IconArt({ name, size, className = "", label }: { name: IconName; size: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {ART[name]}
    </svg>
  );
}
