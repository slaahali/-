// Tuning knobs for the floating-letters scene. World units: a letter is ~1 wide.
// Camera sits at z = CAMERA_Z looking down −z; letters live between zNear and zFar.

import type { CalmZone } from "./layout";

export interface SceneProfile {
  mobile: boolean;
  /** Real letters shown at most (each owns a texture). */
  maxReal: number;
  /** Letters in the field, real + filler. */
  total: number;
  tex: { w: number; h: number };
  fillerTex: { w: number; h: number };
  /** Filler letters share this many textures. */
  fillerTextures: number;
  dust: number;
  letterScale: number;
  zNear: number;
  zFar: number;
  /** |u|,|v| range of slots in NDC (>1 = partly off-screen, room for parallax). */
  spread: number;
  calm: CalmZone;
  anisotropy: number;
}

// Texture size keeps the 1.0 × 0.8 letter ratio. Budgets: see textureBudgetBytes().
export const DESKTOP: SceneProfile = {
  mobile: false,
  maxReal: 40,
  total: 54,
  tex: { w: 384, h: 308 },
  fillerTex: { w: 256, h: 205 },
  fillerTextures: 6,
  dust: 240,
  letterScale: 1.1,
  zNear: -0.5,
  zFar: -16,
  spread: 1.15,
  // Hero headline block: max-w-3xl, centred, ~60% of the hero height.
  calm: { cx: 0, cy: 0, rx: 0.5, ry: 0.56 },
  anisotropy: 4,
};

export const MOBILE: SceneProfile = {
  mobile: true,
  maxReal: 22,
  total: 30,
  tex: { w: 256, h: 205 },
  fillerTex: { w: 192, h: 154 },
  fillerTextures: 4,
  dust: 90,
  letterScale: 0.9,
  zNear: -1.5,
  zFar: -14,
  spread: 1.1,
  calm: { cx: 0, cy: 0, rx: 0.7, ry: 0.5 },
  anisotropy: 2,
};

export const MOBILE_QUERY = "(max-width: 767px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** GPU texture budget per profile (bytes). */
export const TEXTURE_BUDGET = { desktop: 32 * 1024 * 1024, mobile: 12 * 1024 * 1024 };

/** RGBA8 + full mip chain (≈ 4/3). */
export function textureBytes(w: number, h: number, mipmaps = true): number {
  return Math.ceil(w * h * 4 * (mipmaps ? 4 / 3 : 1));
}

/**
 * Worst case: every real slot filled, one extra real letter fading out while
 * its replacement flies in, the shared filler textures and the dust sprite.
 */
export function textureBudgetBytes(p: SceneProfile): number {
  return (
    (p.maxReal + 1) * textureBytes(p.tex.w, p.tex.h) +
    p.fillerTextures * textureBytes(p.fillerTex.w, p.fillerTex.h) +
    textureBytes(DUST_TEX, DUST_TEX)
  );
}

export const LAYOUT_SEED = 0x0510_2025;

// Renderer
export const MAX_DPR = 1.75;
export const ANTIALIAS_MAX_DPR = 1.5;

// Camera
export const CAMERA_Z = 6;
export const LOOK_Z = -8;
export const FOV_LANDSCAPE = 45;
export const FOV_PORTRAIT = 60;

// Letter shape (isosceles triangle, apex up) and its three folded flaps.
export const LETTER_W = 1.0;
export const LETTER_H = 0.8;
/** Where the three flaps meet (letter-local y) and how far it rises toward the viewer. */
export const FOLD_CENTER_Y = -0.12;
export const FOLD_RISE = 0.045;

// Atmosphere (light version of the reference's fog)
export const FOG_COLOR = 0xfbf7f2;
export const FOG_NEAR = 8;
export const FOG_FAR = 30;
/** Extra alpha fade with distance so far letters dissolve into the CSS gradient, not a flat cream. */
export const DEPTH_FADE = { near: 11, far: 23, amount: 0.65 };
export const CALM_DIM = 0.45;
export const FILLER_OPACITY = 0.55;

// Lights (physically based: output ≈ albedo × Σ intensity·cosθ / π). Tuned so paper
// facing the camera renders ≈ its texture colour (0.85–1.1× across tilts) and card
// tints survive: mostly soft sky light, a gentle warm sun for the facet shading.
export const HEMI = { sky: 0xffffff, ground: 0xf7eee9, intensity: 2.5 };
export const SUN = { color: 0xfff4e8, intensity: 1.1, position: [-5, 7, 8] as const };
export const ROUGHNESS = 0.85;
/** Back faces: slightly darker paper, lifted by a little emissive so they don't go grey. */
export const BACK_SHADE = 0.86;
export const BACK_EMISSIVE = 0.45;

// Motion (seconds, radians, world units)
export const MOTION = {
  bob: [0.05, 0.14] as const,
  bobSpeed: [0.35, 0.7] as const,
  wobble: [0.08, 0.2] as const,
  wobbleSpeed: [0.15, 0.35] as const,
  spinSpeed: [0.012, 0.045] as const,
  drift: 0.12,
  driftSpeed: [0.05, 0.12] as const,
  /** prefers-reduced-motion multiplier. */
  reducedScale: 0.15,
};
export const TILT = { x: 0.4, y: 0.6, z: 0.6 };

export const HOVER = { scale: 0.15, forward: 1.4, face: 0.85, ease: 9 };
export const TAP = { maxMove: 8, maxMs: 500 };
export const LABEL = { gap: 10, margin: 8, flashMs: 1100, landFlashMs: 1800 };

export const PARALLAX = { x: 0.55, y: 0.35, ease: 2.2 };
export const SWAY = { x: 0.28, y: 0.16, speedX: 0.13, speedY: 0.1 };
export const SCROLL = { rise: 2.4, dolly: 1.6, ease: 5 };

export const FLIGHT = {
  duration: 2.2,
  memoryDuration: 3.6,
  startDist: 3.4,
  spinTurns: 1,
  /** Reduced motion: fade in place instead of flying. */
  reducedFade: 0.8,
};

export const INTRO = { fade: 0.9, stagger: 0.9 };
export const SWAP_FADE = 0.5;

export const DUST_TEX = 64;
export const DUST = { size: 0.07, opacity: 0.55, speed: [0.04, 0.14] as const, zMin: -18, zMax: 0.5 };

/** Main-thread time per frame spent painting letter textures. */
export const PAINT_BUDGET_MS = 6;

/** Short generic lines for filler letters. */
export const FILLER_SNIPPETS = [
  "شكراً معلمي",
  "ما أنساك",
  "علمتني…",
  "كنت قدوتي",
  "شكراً من القلب",
  "أثرك باقي",
];
