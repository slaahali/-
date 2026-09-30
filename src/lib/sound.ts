// Small sound layer for letter moments. Plays the generated clips in
// /public/sfx (ElevenLabs, via `npm run assets`) when they exist, and otherwise
// synthesizes a close equivalent with Web Audio so sound works everywhere.
// Browser only; every call is a no-op on the server or when muted.

export type SoundName = "open" | "send" | "like" | "chime";

const FILES: Partial<Record<SoundName, string>> = {
  open: "/sfx/letter-open.mp3",
  chime: "/sfx/chime.mp3",
  send: "/sfx/whoosh.mp3",
};

const STORE_KEY = "tcz_sound_v1";

// ------------------------------------------------------------- mute store ---
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (enabled === null) enabled = readEnabled();
  return enabled;
}

/** Server snapshot for useSyncExternalStore. */
export function soundEnabledServer(): boolean {
  return true;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(STORE_KEY, on ? "on" : "off");
  } catch {}
  for (const fn of listeners) fn();
  if (on) void play("like");
}

export function subscribeSound(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------- engine ---
let ctx: AudioContext | null = null;
const buffers = new Map<SoundName, AudioBuffer | null>(); // null = file missing → synth
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

async function loadFile(name: SoundName): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name) ?? null;
  const url = FILES[name];
  const ac = audio();
  if (!url || !ac) {
    buffers.set(name, null);
    return null;
  }
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    buffers.set(name, buf);
    return buf;
  } catch {
    buffers.set(name, null);
    return null;
  }
}

/** Warm the clip cache after the first interaction (decoding needs a context). */
export function preloadSounds() {
  if (!soundEnabled()) return;
  for (const n of Object.keys(FILES) as SoundName[]) void loadFile(n);
}

function whiteNoise(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const len = Math.floor(ac.sampleRate * 1.5);
  noise = ac.createBuffer(1, len, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function out(ac: AudioContext, level: number): GainNode {
  const g = ac.createGain();
  g.gain.value = level;
  g.connect(ac.destination);
  return g;
}

/** A short filtered noise burst — the building block of paper sounds. */
function crinkle(ac: AudioContext, dest: AudioNode, at: number, dur: number, freq: number, q: number, level: number) {
  const src = ac.createBufferSource();
  src.buffer = whiteNoise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(at, Math.random() * 1.2, dur + 0.05);
}

function bell(ac: AudioContext, dest: AudioNode, at: number, freq: number, level: number, decay: number) {
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(dest);
  o.start(at);
  o.stop(at + decay + 0.05);
}

function chime(ac: AudioContext, at: number) {
  const dest = out(ac, 0.5);
  bell(ac, dest, at, 1318.5, 0.07, 1.4);
  bell(ac, dest, at + 0.07, 1975.5, 0.05, 1.2);
  bell(ac, dest, at + 0.14, 2637, 0.03, 1.0);
}

function synth(ac: AudioContext, name: SoundName) {
  const t = ac.currentTime + 0.01;
  if (name === "open") {
    const dest = out(ac, 0.9);
    // three flaps of paper unfolding, then a soft settle
    [0, 0.11, 0.2].forEach((d, i) => {
      crinkle(ac, dest, t + d, 0.09 + Math.random() * 0.05, 2600 + Math.random() * 1800, 0.9, 0.22 - i * 0.03);
      crinkle(ac, dest, t + d + 0.02, 0.06, 5200 + Math.random() * 1500, 1.4, 0.08);
    });
    crinkle(ac, dest, t + 0.3, 0.18, 900, 0.7, 0.1);
    chime(ac, t + 0.28);
    return;
  }
  if (name === "chime") {
    chime(ac, t);
    return;
  }
  if (name === "send") {
    const dest = out(ac, 0.8);
    const src = ac.createBufferSource();
    src.buffer = whiteNoise(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.55);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, 0, 0.8);
    crinkle(ac, dest, t, 0.08, 3200, 1, 0.12);
    return;
  }
  // like: a soft, round pop
  const dest = out(ac, 0.6);
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.2);
}

const lastPlayed = new Map<SoundName, number>();
const DEDUPE_MS = 350;

/**
 * Play a moment sound. Call from a user gesture (click/tap/key). The same sound
 * requested twice within ~350ms plays once (several openers may fire it).
 */
export async function play(name: SoundName): Promise<void> {
  if (!soundEnabled()) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < DEDUPE_MS) return;
  lastPlayed.set(name, now);
  const ac = audio();
  if (!ac) return;
  const buf = FILES[name] ? await loadFile(name) : null;
  if (buf) {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(out(ac, name === "chime" ? 0.55 : 0.85));
    src.start();
    // The unfold clip is paper only; add the reveal shimmer just after it.
    if (name === "open") window.setTimeout(() => void play("chime"), 260);
    return;
  }
  synth(ac, name);
}
