// Pieces both engines (hero field + immersive tunnel) use: renderer setup,
// lights, the hover-label placement and the letter sanitiser.

import { DirectionalLight, HemisphereLight, type Scene, WebGLRenderer } from "three";
import { colorAt } from "@/lib/assets";
import type { SceneLetter } from "@/lib/events";
import { ANTIALIAS_MAX_DPR, HEMI, LABEL, MAX_DPR, SUN } from "./constants";
import { clamp } from "./layout";

/** Accepts only the public SceneLetter fields (never anything else from an event or a prop). */
export function toSafeLetter(x: unknown): SceneLetter | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    label: typeof o.label === "string" ? o.label : "",
    snippet: typeof o.snippet === "string" ? o.snippet : "",
    variant: typeof o.variant === "number" && Number.isFinite(o.variant) ? o.variant : 0,
    inMemory: o.inMemory === true,
  };
}

/** What the paper shows; a change means a repaint. */
export const contentKey = (l: SceneLetter) =>
  `${l.snippet}\u0000${colorAt(l.variant).key}\u0000${l.inMemory ? 1 : 0}`;

/** The id carried by a LETTER_HIDDEN_EVENT / NEW_LETTER_EVENT detail, if any. */
export function eventLetterId(e: Event): string | null {
  const d = (e as CustomEvent<unknown>).detail;
  if (!d || typeof d !== "object") return null;
  const id = (d as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** Transparent renderer with capped DPR. Throws without WebGL. */
export function createRenderer(): WebGLRenderer {
  const dpr = window.devicePixelRatio || 1;
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: dpr <= ANTIALIAS_MAX_DPR,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(dpr, MAX_DPR));
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/** Puts the (decorative) canvas under everything else in `root`. */
export function mountCanvas(root: HTMLElement, canvas: HTMLCanvasElement, touchAction: string) {
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    touchAction,
  });
  if (getComputedStyle(root).position === "static") root.style.position = "relative";
  root.insertBefore(canvas, root.firstChild);
}

/** Soft sky light + a gentle warm sun (tuned so paper ≈ its texture colour). */
export function addLights(scene: Scene) {
  scene.add(new HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity));
  const sun = new DirectionalLight(SUN.color, SUN.intensity);
  sun.position.set(SUN.position[0], SUN.position[1], SUN.position[2]);
  scene.add(sun);
}

/**
 * Top-left (physical px) of the hover label beside a letter centred at
 * (sx, sy) whose half width on screen is `half`: on the reading side first
 * (left in RTL), flipped when it would not fit, clamped inside the view.
 */
export function labelSpot(
  sx: number,
  sy: number,
  half: number,
  label: { w: number; h: number },
  view: { w: number; h: number },
  preferLeft: boolean,
): { x: number; y: number } {
  const { gap, margin } = LABEL;
  const leftX = sx - half - gap - label.w;
  const rightX = sx + half + gap;
  let x = preferLeft
    ? leftX >= margin
      ? leftX
      : rightX
    : rightX + label.w <= view.w - margin
      ? rightX
      : leftX;
  x = clamp(x, margin, Math.max(margin, view.w - label.w - margin));
  const y = clamp(sy - label.h / 2, margin, Math.max(margin, view.h - label.h - margin));
  return { x, y };
}
