// Tiny browser event bus between the form / provider and the WebGL scene.

/** What the 3D scene needs to draw + label one floating letter. */
export interface SceneLetter {
  id: string;
  /** e.g. "إلى: أستاذة نورة" — shown on hover like the names in the reference. */
  label: string;
  /** First ~80 chars of the letter, drawn as "handwriting" on the paper texture. */
  snippet: string;
  /** Card colour 0..VARIANT_COUNT-1 — use cardStyle(letter) from ./assets. */
  variant: number;
  /** "في ذكرى" letter: calm paper, no playful effects. */
  inMemory: boolean;
}

/** Fired on window when a visitor publishes a letter: the scene flies it in. */
export const NEW_LETTER_EVENT = "letters:new";

export function emitNewLetter(letter: SceneLetter) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SceneLetter>(NEW_LETTER_EVENT, { detail: letter }));
}

/**
 * Fired on window when a letter stops being public from this page (e.g. the
 * person named asked for it to be removed). The provider drops it from its
 * cache + counter, the wall removes the card, the scene lets it go.
 */
export const LETTER_HIDDEN_EVENT = "letters:hidden";

export function emitLetterHidden(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ id: string }>(LETTER_HIDDEN_EVENT, { detail: { id } }));
}
