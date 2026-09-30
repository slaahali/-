// The letter view's images (the wax seals, the stamps' 3D icons), fetched and
// decoded before the first letter opens: a seal that only starts loading when
// its letter mounts misses the unfold and pops in already cracked.

import { CARD_COLORS, ICONS, MEMORY_STYLE, SEAL_URLS } from "@/lib/assets";

const ready = new Set<string>();
// Held on to so the decoded images stay in the browser's memory cache.
const kept: HTMLImageElement[] = [];

/** Starts loading every seal, then the stamp icons. Safe to call more than once. */
export function preloadLetterArt() {
  if (kept.length || typeof Image === "undefined") return;
  const icons = [...CARD_COLORS, MEMORY_STYLE].map((s) => ICONS[s.icon].local);
  for (const url of [...SEAL_URLS, ...new Set(icons)]) {
    const img = new Image();
    img.fetchPriority = "low";
    img.src = url;
    kept.push(img);
    img.decode().then(
      () => ready.add(url),
      () => {},
    );
  }
}

/** Whether `url` has loaded in this visit (an <img> with it paints on its first frame). */
export const isArtReady = (url: string) => ready.has(url);

export const markArtReady = (url: string) => {
  ready.add(url);
};
