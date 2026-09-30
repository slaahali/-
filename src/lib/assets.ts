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

/** Visual identity of each letter variant (index = PublicMessage.variant). */
export const VARIANTS: ReadonlyArray<{
  icon: IconName;
  /** Accent used for the card band, stamp, and share-card background. */
  accent: string;
  /** Very light tint of the accent for backgrounds. */
  tint: string;
  /** Two-stop gradient for the illustration card in the letter view. */
  gradient: [string, string];
}> = [
  { icon: "letter", accent: "#691d4e", tint: "#f6ecf2", gradient: ["#a73784", "#691d4e"] },
  { icon: "books", accent: "#eb652c", tint: "#fdeee6", gradient: ["#f7a64f", "#eb652c"] },
  { icon: "pencil", accent: "#a73784", tint: "#f8edf5", gradient: ["#d77fb8", "#a73784"] },
  { icon: "cap", accent: "#c98a2e", tint: "#fbf2e3", gradient: ["#f7c87a", "#d9913a"] },
  { icon: "plane", accent: "#691d4e", tint: "#f3ecf0", gradient: ["#eb652c", "#a73784"] },
  { icon: "heart", accent: "#eb652c", tint: "#fff1ea", gradient: ["#f59a6b", "#e0561f"] },
];

export const variantOf = (v: number) => VARIANTS[((v % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
