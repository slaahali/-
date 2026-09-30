// 3D icon assets generated with Higgsfield (GPT Image 2.5, transparent PNG, 2048²)
// in The Chefz satin-matte house style. The list lives in ./icons.json so that
// `npm run assets` (scripts/fetch-assets.mjs) can download + resize them into
// /public/3d/<name>.webp. <Icon3D> uses the local file and falls back to the
// original CDN PNG when it's missing.

import manifest from "./icons.json";

type IconEntry = { local: string; remote: string; alt: string };
type ManifestIcons = typeof manifest.icons;

export type IconName = keyof ManifestIcons;

export const ICONS = Object.fromEntries(
  (Object.keys(manifest.icons) as IconName[]).map((name) => [
    name,
    {
      local: `/3d/${name}.webp`,
      remote: `${manifest.cdn}/${manifest.icons[name].remote}`,
      alt: manifest.icons[name].alt,
    },
  ]),
) as Record<IconName, IconEntry>;

export interface CardStyle {
  key: string;
  /** Arabic colour name shown in the colour picker. */
  name: string;
  /** Strong colour: card band, stamp, like heart, story-card background. */
  accent: string;
  /** Whole-card background (light enough for plum/ink body text, AA contrast). */
  bg: string;
  /** Text colour to use on `bg`. */
  ink: string;
  /** Two-stop gradient for the illustration card in the letter view / share images. */
  gradient: [string, string];
  /** 3D icon that illustrates this card. */
  icon: IconName;
}

/**
 * Card colours the writer picks from (index = PublicMessage.variant). All from
 * The Chefz palette so the wall looks lively but on-brand.
 */
export const CARD_COLORS: ReadonlyArray<CardStyle> = [
  { key: "plum", name: "موف", accent: "#691d4e", bg: "#f3e4ee", ink: "#3d0f2d", gradient: ["#a73784", "#691d4e"], icon: "letter" },
  { key: "orange", name: "برتقالي", accent: "#eb652c", bg: "#fde3d6", ink: "#4f1f0c", gradient: ["#f7a64f", "#eb652c"], icon: "books" },
  { key: "magenta", name: "فوشي", accent: "#a73784", bg: "#f6def0", ink: "#45122f", gradient: ["#d77fb8", "#a73784"], icon: "pencil" },
  { key: "gold", name: "ذهبي", accent: "#c98a2e", bg: "#fcecd0", ink: "#47300f", gradient: ["#f7c87a", "#d9913a"], icon: "cap" },
  { key: "peach", name: "خوخي", accent: "#e8743f", bg: "#ffe9df", ink: "#4f1f0c", gradient: ["#f9b793", "#eb652c"], icon: "plane" },
  { key: "cream", name: "كريمي", accent: "#8a5a3c", bg: "#fbf5ec", ink: "#2a1422", gradient: ["#f4ece0", "#d9bfa3"], icon: "heart" },
];

/** Calm, respectful look for "في ذكرى" letters, regardless of the chosen colour. */
export const MEMORY_STYLE: CardStyle = {
  key: "memory",
  name: "في ذكرى",
  accent: "#6f6275",
  bg: "#f1eef3",
  ink: "#2f2734",
  gradient: ["#c9c0cf", "#6f6275"],
  icon: "letter",
};

export const colorAt = (v: number): CardStyle =>
  CARD_COLORS[((Math.trunc(v) % CARD_COLORS.length) + CARD_COLORS.length) % CARD_COLORS.length];

/** The style to render a letter with (memory letters always use MEMORY_STYLE). */
export function cardStyle(m: { variant: number; inMemory?: boolean }): CardStyle {
  return m.inMemory ? MEMORY_STYLE : colorAt(m.variant);
}

/** @deprecated use cardStyle(m) / colorAt(v). Kept for older call sites. */
export const VARIANTS = CARD_COLORS;
/** @deprecated use cardStyle(m) / colorAt(v). */
export const variantOf = colorAt;
