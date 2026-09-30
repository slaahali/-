// Pure helpers for the letter view: colours that stay readable on the sheet,
// swipe classification, the "opened by a gesture?" clock and a guard for the
// handwriting font.

import type { CardStyle } from "@/lib/assets";

/** The writing paper every letter is printed on (globals.css --color-sheet). */
export const SHEET = "#fffdf8";

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Linear sRGB mix: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t) as RGB);
}

/**
 * `color` darkened toward `toward` just enough to reach `target` contrast on
 * `bg`. Orange, gold and peach accents are only ~3:1 on the sheet by themselves.
 */
export function readableOn(color: string, bg: string, toward: string, target = 4.5): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(color, toward, t);
    if (contrast(c, bg) >= target) return c;
  }
  return toward;
}

/** Envelope paper per card colour: [outside, inside of the flap]. */
const ENVELOPES: Record<string, [string, string]> = {
  plum: ["#6e2354", "#4a1136"],
  orange: ["#e46a34", "#b4461b"],
  magenta: ["#a53f86", "#7a2360"],
  gold: ["#d4a04f", "#a2711f"],
  peach: ["#f0a07b", "#cf6f45"],
  cream: ["#d8c2a4", "#b09473"], // kraft
  memory: ["#b9b0c3", "#8a7f95"], // grey-lavender
};

export interface LetterPalette {
  /** Accent for text on the sheet (signature, «إلى»): ≥ 4.5:1. */
  accentInk: string;
  /** Rubber-stamp ink: a notch deeper, since the worn-ink mask eats some of it. */
  stampInk: string;
  envelope: string;
  envelopeInside: string;
  /** Postage stamp field behind the 3D icon. */
  stampField: string;
}

export function letterPalette(s: CardStyle): LetterPalette {
  const [envelope, envelopeInside] = ENVELOPES[s.key] ?? [s.gradient[1], mix(s.gradient[1], "#000000", 0.25)];
  return {
    accentInk: readableOn(s.accent, SHEET, s.ink, 4.5),
    stampInk: readableOn(s.accent, SHEET, s.ink, 5.5),
    envelope,
    envelopeInside,
    stampField: s.bg,
  };
}

// ---------------------------------------------------------------- gestures ---

/** How recent a click / tap / key must be for an open to count as user-initiated. */
export const GESTURE_WINDOW_MS = 800;

/** A key press, a finger (touch / pen) or a mouse. */
export type GestureKind = "key" | "touch" | "mouse";

export function gestureKind(e: Event): GestureKind {
  if (e.type.startsWith("key")) return "key";
  return (e as PointerEvent).pointerType === "mouse" ? "mouse" : "touch";
}

let lastGesture: { at: number; target: Element | null; kind: GestureKind } = {
  at: Number.NEGATIVE_INFINITY,
  target: null,
  kind: "mouse",
};

export function noteGesture(
  target: EventTarget | null,
  now: number = Date.now(),
  kind: GestureKind = "mouse",
) {
  const el = typeof Element !== "undefined" && target instanceof Element ? target : null;
  lastGesture = { at: now, target: el, kind };
}

/**
 * The click / tap / key press of the last `ms`, if any (deep links and the
 * back button have none). `target` is what was pressed.
 */
export function recentGesture(
  now: number = Date.now(),
  ms = GESTURE_WINDOW_MS,
): { target: Element | null; kind: GestureKind } | null {
  return now - lastGesture.at <= ms ? { target: lastGesture.target, kind: lastGesture.kind } : null;
}

// ------------------------------------------------------------------ swipes ---

export type SwipeAction = "next" | "prev" | "close" | null;

/**
 * What a finished one-finger swipe means. Horizontal flicks step between letters
 * (RTL: dragging to the right brings in the next letter from the left); a long
 * pull down closes, but only when it started on the sheet's header while the
 * view was scrolled to the top.
 */
export function classifySwipe(
  dx: number,
  dy: number,
  ms: number,
  opts: { canClose: boolean },
): SwipeAction {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (opts.canClose && dy >= 100 && ay >= ax * 1.4) return "close";
  if (ax >= 70 && ax >= ay * 1.5 && ms <= 800) return dx > 0 ? "next" : "prev";
  return null;
}

// ------------------------------------------------------- handwriting guard ---

// Aref Ruqaa steps every medial «ه» upward, so a laughter run like «هههههههه»
// climbs out of its line. Runs of 4+ identical Arabic letters are set in the
// book face instead.
const LONG_RUN = /(\p{Script=Arabic})\1{3,}/u;

export function hasLongRun(s: string): boolean {
  return LONG_RUN.test(s);
}
