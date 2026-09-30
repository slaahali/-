// Tiny browser event bus between the form / provider and the WebGL scene.

/** What the 3D scene needs to draw + label one floating letter. */
export interface SceneLetter {
  id: string;
  /** e.g. "إلى: أستاذة نورة" — shown on hover like the names in the reference. */
  label: string;
  /** First ~80 chars of the letter, drawn as "handwriting" on the paper texture. */
  snippet: string;
  /** 0..VARIANT_COUNT-1 */
  variant: number;
}

/** Fired on window when a visitor publishes a letter: the scene flies it in. */
export const NEW_LETTER_EVENT = "letters:new";

export function emitNewLetter(letter: SceneLetter) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SceneLetter>(NEW_LETTER_EVENT, { detail: letter }));
}
