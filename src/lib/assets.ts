// 3D icon assets generated with Higgsfield (GPT Image 2.5, transparent PNG, 2048²)
// in The Chefz satin-matte house style.
//
// `local` is served from /public once `npm run assets` has downloaded them
// (scripts/fetch-assets.mjs reads this same manifest). `remote` is the original
// Higgsfield CDN file and is used as an automatic fallback by <Icon3D>.

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3H2FUBuaLYj4PmwIIh8f6C0pLc8";

export const ICONS = {
  letter: { local: "/3d/letter.png", remote: `${CDN}/hf_20260930_082403_b34cf60d-9f69-4033-bf5b-031d27cc0454.png`, alt: "رسالة مطوية بختم قلب" },
  gift: { local: "/3d/gift.png", remote: `${CDN}/hf_20260930_082403_1b2361bf-042e-4ae5-a026-bb83dab55f75.png`, alt: "صندوق هدية" },
  books: { local: "/3d/books.png", remote: `${CDN}/hf_20260930_082403_d6fe3a2d-7e6a-4ef5-99a3-06026d4964f0.png`, alt: "كتب وتفاحة" },
  pencil: { local: "/3d/pencil.png", remote: `${CDN}/hf_20260930_082403_802b92e3-cc7f-4445-bb93-5166487c6553.png`, alt: "قلم رصاص" },
  cap: { local: "/3d/cap.png", remote: `${CDN}/hf_20260930_082403_a8412b09-2ace-4e78-89d0-8badee638f8a.png`, alt: "قبعة تخرج" },
  plane: { local: "/3d/plane.png", remote: `${CDN}/hf_20260930_082403_e377cf65-5bb7-4b23-b848-a74f164aad6b.png`, alt: "طيارة ورقية" },
  search: { local: "/3d/search.png", remote: `${CDN}/hf_20260930_082403_7ffb4a3f-bd98-4590-810a-67bfb9f5073f.png`, alt: "عدسة بحث" },
  heart: { local: "/3d/heart.png", remote: `${CDN}/hf_20260930_082403_a7a13425-050d-4bfc-b2ea-c1a30907b35c.png`, alt: "قلب مع رسالة" },
} as const;

export type IconName = keyof typeof ICONS;

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
