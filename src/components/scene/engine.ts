// Imperative three.js engine behind <LettersScene>. Owns the renderer, the
// floating letters, pointer interaction, the hover label and every GPU
// resource; `dispose()` releases all of it (safe to call twice).
//
// The field holds the newest letters (up to profile.maxReal); blank filler
// letters only pad it while there are fewer than profile.minField.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Fog,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { cardStyle, colorAt } from "@/lib/assets";
import { LETTER_HIDDEN_EVENT, NEW_LETTER_EVENT, type SceneLetter } from "@/lib/events";
import {
  CALM_DIM,
  CAMERA_Z,
  DEPTH_FADE,
  DESKTOP,
  FILLER_OPACITY,
  FILLER_SNIPPETS,
  FLIGHT,
  FOG_COLOR,
  FOG_FAR,
  FOG_NEAR,
  FOV_LANDSCAPE,
  FOV_PORTRAIT,
  HOVER,
  INTRO,
  LABEL,
  LAYOUT_SEED,
  LETTER_W,
  LOOK_Z,
  MOBILE,
  MOBILE_QUERY,
  MOTION,
  PAINT_BUDGET_MS,
  PARALLAX,
  REDUCED_MOTION_QUERY,
  BACK_EMISSIVE,
  BACK_SHADE,
  ROUGHNESS,
  SCROLL,
  SWAP_FADE,
  SWAY,
  TAP,
  TILT,
  fieldSize,
  type SceneProfile,
} from "./constants";
import { createDust, type Dust } from "./dust";
import { cubicBezier, easeInOutCubic, easeInOutSine, flightControls, flightStart, type Vec3 } from "./flight";
import { createLetterGeometry } from "./geometry";
import {
  clamp,
  fovForAspect,
  generateSlots,
  halfHeightAt,
  resolveSlot,
  slotPreference,
  smoothstep,
  type RawSlot,
  type ResolvedSlot,
  type ViewParams,
} from "./layout";
import { isImmersiveOpen, subscribeImmersive } from "./immersive-state";
import { hashString, mulberry32, range } from "./random";
import { addLights, contentKey, createRenderer, eventLetterId, labelSpot, mountCanvas, toSafeLetter } from "./shared";
import { createLetterTexture, loadPaperFamily, paintLetterCanvas, paperBackColor, type PaintSpec } from "./textures";

export { toSafeLetter } from "./shared";

export interface EngineOptions {
  root: HTMLDivElement;
  /** Absolutely positioned wrapper the engine moves over the hovered letter. */
  labelAnchor: HTMLElement;
  /** The pill inside it; the engine sets its text and `data-visible`. */
  labelPill: HTMLElement;
  onOpen: (id: string) => void;
}

interface Flight {
  elapsed: number;
  duration: number;
  gentle: boolean;
  /** Control points, computed on the first visible frame (camera may have moved). */
  path: { p0: Vec3; c1: Vec3; c2: Vec3 } | null;
}

interface LetterNode {
  kind: "real" | "filler";
  letter: SceneLetter | null;
  /** Painted content (snippet/colour/memory); a change triggers a repaint. */
  key: string;
  /** Flown in by NEW_LETTER_EVENT and not (yet) in the `letters` prop: survives prop diffs. */
  sticky: boolean;
  /** −1 once retired (fading out). */
  slot: number;
  anchor: Vec3;
  calmDim: boolean;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial[]>;
  front: MeshStandardMaterial;
  back: MeshStandardMaterial;
  texture: CanvasTexture | null;
  ownsTexture: boolean;
  painted: boolean;
  addedAt: number;
  baseOpacity: number;
  phase: number;
  bobAmp: number;
  bobSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  spinSpeed: number;
  driftSpeed: number;
  tilt: Vec3;
  hover: number;
  fade: number;
  fadeTo: number;
  fadeRate: number;
  fadeDelay: number;
  flight: Flight | null;
}

interface PointerDown {
  x: number;
  y: number;
  t: number;
  id: number;
  type: string;
  moved: boolean;
}

const TAU = Math.PI * 2;

export class LettersEngine {
  private readonly root: HTMLDivElement;
  private readonly labelAnchor: HTMLElement;
  private readonly labelPill: HTMLElement;
  private readonly onOpen: (id: string) => void;
  private readonly profile: SceneProfile;
  private readonly renderer: WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly geometry: BufferGeometry;
  private readonly dust: Dust;
  private readonly anisotropy: number;
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly tmpObj = new Object3D();
  private readonly tmpV = new Vector3();
  private readonly tmpP: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly targets: Object3D[] = [];
  private readonly meshToNode = new Map<Object3D, LetterNode>();
  private readonly cleanups: Array<() => void> = [];

  private readonly rawSlots: RawSlot[];
  private resolved: ResolvedSlot[] = [];
  private preference: number[] = [];
  private readonly slots: Array<LetterNode | null>;
  private dying: LetterNode[] = [];
  private fillerTextures: CanvasTexture[] = [];
  private paintQueue: LetterNode[] = [];
  private desired: SceneLetter[] = [];
  private pendingNew: SceneLetter[] = [];
  /** Taken down during this visit: never shown again, whatever the props say. */
  private readonly hidden = new Set<string>();
  /** Slots [0, active) are in use; the Mitchell order keeps any prefix well spread. */
  private active = 0;
  private family = "";
  private addCounter = 0;

  private ready = false;
  private disposed = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private pageVisible = true;
  private intersecting = true;
  private contextLost = false;
  private reduced = false;
  /** The immersive tunnel is open on top of the hero. */
  private covered = isImmersiveOpen();

  private pointerX = 0;
  private pointerY = 0;
  private pointerOver = false;
  private clientX = 0;
  private clientY = 0;
  private camX = 0;
  private camY = 0;
  private scroll = 0;
  private scrollTarget = 0;
  private down: PointerDown | null = null;
  /** pointerType of a pointerdown→pointerup that qualified as a tap; consumed by the click. */
  private tap: string | null = null;
  private hovered: LetterNode | null = null;

  private labelNode: LetterNode | null = null;
  private labelShown = false;
  private labelUntil = 0;
  private labelFadeEnd = 0;
  private labelW = 0;
  private labelH = 0;
  private readonly preferLabelLeft: boolean;

  /** Throws when WebGL is unavailable (the caller then leaves the root empty). */
  constructor(opts: EngineOptions) {
    this.root = opts.root;
    this.labelAnchor = opts.labelAnchor;
    this.labelPill = opts.labelPill;
    this.onOpen = opts.onOpen;
    this.profile = window.matchMedia(MOBILE_QUERY).matches ? MOBILE : DESKTOP;

    this.renderer = createRenderer();
    this.anisotropy = Math.max(1, Math.min(this.profile.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));

    const canvas = this.renderer.domElement;
    this.canvas = canvas;
    try {
      this.rawSlots = generateSlots(this.profile.maxReal, mulberry32(LAYOUT_SEED), this.profile.spread);
      this.slots = new Array<LetterNode | null>(this.rawSlots.length).fill(null);
      this.camera = new PerspectiveCamera(FOV_LANDSCAPE, 1, 0.1, 60);
      this.geometry = createLetterGeometry();
      this.dust = createDust(this.profile.dust, 10, 6, LAYOUT_SEED + 7);
    } catch (err) {
      this.renderer.dispose();
      throw err;
    }

    this.preferLabelLeft = getComputedStyle(this.root).direction === "rtl";
    mountCanvas(this.root, canvas, "pan-y pinch-zoom");

    this.camera.position.set(0, 0, CAMERA_Z);

    this.scene.fog = new Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    addLights(this.scene);

    this.scene.add(this.dust.points);

    this.measure(true);
    this.bindEvents();
    void this.boot();
  }

  // ------------------------------------------------------------- public ---

  setLetters(list: readonly SceneLetter[]) {
    const seen = new Set<string>();
    const desired: SceneLetter[] = [];
    for (const raw of list) {
      const l = toSafeLetter(raw);
      if (!l || seen.has(l.id) || this.hidden.has(l.id)) continue;
      seen.add(l.id);
      desired.push(l);
      if (desired.length >= this.profile.maxReal) break;
    }
    this.desired = desired;
    if (this.ready) this.applyDiff();
  }

  addNewLetter(raw: unknown) {
    const letter = toSafeLetter(raw);
    if (!letter || this.disposed || this.hidden.has(letter.id)) return;
    if (!this.ready) {
      this.pendingNew.push(letter);
      return;
    }
    const existing = this.findNode(letter.id);
    if (existing) {
      this.flashLabel(existing, LABEL.landFlashMs);
      return;
    }
    const slot = this.pickSlot();
    if (slot < 0) return;
    const node = this.createNode("real", letter, slot);
    node.sticky = true;
    node.addedAt = ++this.addCounter;
    this.paintNode(node);
    this.assign(slot, node);
    node.fade = 0;
    node.fadeTo = 1;
    if (this.reduced) {
      node.fadeRate = 1 / FLIGHT.reducedFade;
    } else {
      node.fadeRate = 1 / 0.35;
      const gentle = letter.inMemory;
      node.flight = {
        elapsed: 0,
        duration: gentle ? FLIGHT.memoryDuration : FLIGHT.duration,
        gentle,
        path: null,
      };
    }
  }

  /** A letter stopped being public (e.g. a removal request): let it go, sticky or not. */
  hideLetter(id: string) {
    if (!id || this.disposed) return;
    this.hidden.add(id);
    this.desired = this.desired.filter((l) => l.id !== id);
    this.pendingNew = this.pendingNew.filter((l) => l.id !== id);
    if (!this.ready) return;
    const node = this.findNode(id);
    if (node) this.vacate(node.slot);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const fn of this.cleanups.splice(0)) fn();

    for (const n of this.slots) if (n) this.disposeNode(n);
    for (const n of this.dying) this.disposeNode(n);
    this.slots.fill(null);
    this.dying = [];
    this.paintQueue = [];
    for (const t of this.fillerTextures) t.dispose();
    this.fillerTextures = [];
    this.geometry.dispose();
    this.dust.dispose();
    this.scene.clear();

    this.renderer.dispose();
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* already lost */
    }
    this.canvas.remove();
    this.labelPill.textContent = "";
    this.labelPill.dataset.visible = "false";
  }

  // --------------------------------------------------------------- boot ---

  private async boot() {
    const family = await loadPaperFamily(1500);
    if (this.disposed) return;
    this.family = family;

    const fillerStyle = colorAt(5);
    for (let i = 0; i < this.profile.fillerTextures; i++) {
      const spec: PaintSpec = {
        text: FILLER_SNIPPETS[i % FILLER_SNIPPETS.length],
        kind: "filler",
        style: fillerStyle,
        seed: 9000 + i,
      };
      this.fillerTextures.push(createLetterTexture(paintLetterCanvas(spec, this.profile.fillerTex, family), this.anisotropy));
    }

    // Real letters take the preferred (near, outside the calm zone) slots of the active field.
    const n = this.desired.length;
    this.active = fieldSize(n, this.profile);
    const order = this.preference.filter((i) => i < this.active);
    this.desired.forEach((letter, i) => {
      const node = this.createNode("real", letter, order[i]);
      node.addedAt = n - i; // prop order is newest first
      this.assign(order[i], node);
      this.paintQueue.push(node);
    });
    this.addCounter = n + 1;
    for (let i = 0; i < this.active; i++) {
      if (!this.slots[i]) this.assign(i, this.createNode("filler", null, i));
    }
    for (const node of this.slots) {
      if (!node) continue;
      node.fadeDelay = this.rawSlots[node.slot].depth * INTRO.stagger;
      node.fadeRate = 1 / INTRO.fade;
    }

    this.ready = true;
    for (const l of this.pendingNew.splice(0)) this.addNewLetter(l);
    this.updateRunning();
  }

  // -------------------------------------------------------------- nodes ---

  private createNode(kind: LetterNode["kind"], letter: SceneLetter | null, slot: number): LetterNode {
    const style = letter ? cardStyle(letter) : colorAt(5);
    const paperKind: PaintSpec["kind"] = kind === "filler" ? "filler" : letter?.inMemory ? "memory" : "real";
    const placeholder = this.fillerTextures[slot % Math.max(1, this.fillerTextures.length)] ?? null;

    const front = new MeshStandardMaterial({
      color: 0xffffff,
      map: placeholder,
      roughness: ROUGHNESS,
      metalness: 0,
      transparent: true,
      opacity: 0,
      side: FrontSide,
    });
    const backColor = new Color(paperBackColor({ kind: paperKind, style })).multiplyScalar(BACK_SHADE);
    const back = new MeshStandardMaterial({
      color: backColor,
      emissive: backColor.clone(),
      emissiveIntensity: BACK_EMISSIVE,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0,
      side: FrontSide,
    });
    const mesh = new Mesh(this.geometry, [front, back]);
    mesh.visible = false;
    mesh.scale.setScalar(this.profile.letterScale);
    this.scene.add(mesh);

    const rng = mulberry32(hashString(letter ? letter.id : `filler:${slot}`) ^ (slot * 2654435761));
    const node: LetterNode = {
      kind,
      letter,
      key: letter ? contentKey(letter) : "",
      sticky: false,
      slot: -1,
      anchor: { x: 0, y: 0, z: -10 },
      calmDim: false,
      mesh,
      front,
      back,
      texture: kind === "filler" ? placeholder : null,
      ownsTexture: false,
      painted: kind === "filler",
      addedAt: 0,
      baseOpacity: kind === "filler" ? FILLER_OPACITY : 1,
      phase: rng() * TAU,
      bobAmp: range(rng, MOTION.bob[0], MOTION.bob[1]),
      bobSpeed: range(rng, MOTION.bobSpeed[0], MOTION.bobSpeed[1]),
      wobble: range(rng, MOTION.wobble[0], MOTION.wobble[1]),
      wobbleSpeed: range(rng, MOTION.wobbleSpeed[0], MOTION.wobbleSpeed[1]),
      spinSpeed: range(rng, MOTION.spinSpeed[0], MOTION.spinSpeed[1]) * (rng() < 0.5 ? -1 : 1),
      driftSpeed: range(rng, MOTION.driftSpeed[0], MOTION.driftSpeed[1]),
      tilt: { x: (rng() * 2 - 1) * TILT.x, y: (rng() * 2 - 1) * TILT.y, z: (rng() * 2 - 1) * TILT.z },
      hover: 0,
      fade: 0,
      fadeTo: 1,
      fadeRate: 1 / INTRO.fade,
      fadeDelay: 0,
      flight: null,
    };
    this.meshToNode.set(mesh, node);
    return node;
  }

  private paintNode(node: LetterNode) {
    const letter = node.letter;
    if (!letter || this.disposed) return;
    const style = cardStyle(letter);
    const spec: PaintSpec = {
      text: letter.snippet,
      kind: letter.inMemory ? "memory" : "real",
      style,
      seed: hashString(letter.id),
    };
    const tex = createLetterTexture(paintLetterCanvas(spec, this.profile.tex, this.family), this.anisotropy);
    if (node.ownsTexture) node.texture?.dispose();
    node.texture = tex;
    node.ownsTexture = true;
    node.front.map = tex;
    node.painted = true;
    const backColor = new Color(paperBackColor(spec)).multiplyScalar(BACK_SHADE);
    node.back.color.copy(backColor);
    node.back.emissive.copy(backColor);
  }

  private processPaintQueue() {
    if (!this.paintQueue.length) return;
    const t0 = performance.now();
    do {
      const node = this.paintQueue.shift();
      if (node && node.slot >= 0 && this.meshToNode.has(node.mesh)) this.paintNode(node);
    } while (this.paintQueue.length && performance.now() - t0 < PAINT_BUDGET_MS);
  }

  private assign(slot: number, node: LetterNode) {
    const old = this.slots[slot];
    if (old && old !== node) this.retire(old);
    this.slots[slot] = node;
    node.slot = slot;
    const r = this.resolved[slot];
    node.anchor = { x: r.x, y: r.y, z: r.z };
    node.calmDim = r.calmDim;
  }

  private retire(node: LetterNode) {
    node.slot = -1;
    node.fadeTo = 0;
    node.fadeDelay = 0;
    node.fadeRate = 1 / SWAP_FADE;
    this.dying.push(node);
    if (this.hovered === node) this.setHovered(null);
    if (this.labelNode === node) this.hideLabel();
  }

  private disposeNode(node: LetterNode) {
    this.scene.remove(node.mesh);
    this.meshToNode.delete(node.mesh);
    node.front.dispose();
    node.back.dispose();
    if (node.ownsTexture) node.texture?.dispose();
    node.texture = null;
    if (this.hovered === node) this.hovered = null;
    if (this.labelNode === node) {
      this.labelNode = null;
      this.labelShown = false;
      this.labelPill.dataset.visible = "false";
    }
  }

  private findNode(id: string): LetterNode | null {
    for (const n of this.slots) if (n?.letter?.id === id) return n;
    return null;
  }

  private realCount(): number {
    let real = 0;
    for (const n of this.slots) if (n?.kind === "real") real++;
    return real;
  }

  /**
   * Where a new real letter goes: a free (blank or filler) active slot, nearest
   * first; else the field grows by one slot; else the oldest real letter's slot.
   */
  private pickSlot(): number {
    for (const i of this.preference) if (i < this.active && this.slots[i]?.kind !== "real") return i;
    if (this.active < this.slots.length) return this.active++;
    let best = -1;
    let bestAt = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const n = this.slots[i];
      if (n?.kind === "real" && n !== this.hovered && !n.flight && n.addedAt < bestAt) {
        best = i;
        bestAt = n.addedAt;
      }
    }
    return best;
  }

  private applyDiff() {
    const want = new Map(this.desired.map((l) => [l.id, l]));
    for (let i = 0; i < this.slots.length; i++) {
      const node = this.slots[i];
      if (!node || node.kind !== "real" || !node.letter) continue;
      const next = want.get(node.letter.id);
      if (!next) {
        if (!node.sticky) this.vacate(i);
        continue;
      }
      want.delete(next.id);
      node.sticky = false;
      const repaint = contentKey(next) !== node.key;
      node.letter = next;
      if (this.labelNode === node) this.labelPill.textContent = next.label;
      node.key = contentKey(next);
      if (repaint) this.paintQueue.push(node);
    }
    // Oldest first so addedAt keeps newest = largest.
    for (const letter of [...want.values()].reverse()) {
      const slot = this.pickSlot();
      if (slot < 0) break;
      const node = this.createNode("real", letter, slot);
      node.addedAt = ++this.addCounter;
      node.fadeRate = 1 / INTRO.fade;
      this.assign(slot, node);
      this.paintQueue.push(node);
    }
  }

  /** A real letter leaves: blank paper takes its place while the field is short, else the slot empties. */
  private vacate(slot: number) {
    const old = this.slots[slot];
    if (!old) return;
    if (this.realCount() - (old.kind === "real" ? 1 : 0) < this.profile.minField) {
      const node = this.createNode("filler", null, slot);
      node.fadeRate = 1 / SWAP_FADE;
      this.assign(slot, node);
    } else {
      this.retire(old);
      this.slots[slot] = null;
    }
  }

  // ------------------------------------------------------------- layout ---

  private view(): ViewParams {
    return {
      aspect: this.camera.aspect,
      fovDeg: this.camera.fov,
      camZ: CAMERA_Z,
      zNear: this.profile.zNear,
      zFar: this.profile.zFar,
      calm: this.profile.calm,
      letterRadius: LETTER_W * 0.55 * this.profile.letterScale,
    };
  }

  private measure(force = false) {
    const w = Math.max(1, Math.round(this.root.clientWidth));
    const h = Math.max(1, Math.round(this.root.clientHeight));
    if (!force && w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovForAspect(this.camera.aspect, FOV_LANDSCAPE, FOV_PORTRAIT);
    this.camera.updateProjectionMatrix();

    const view = this.view();
    this.resolved = this.rawSlots.map((r) => resolveSlot(r, view));
    // Fixed once letters are placed; until then follow the real size (the first measure may be 1×1).
    if (!this.ready) this.preference = slotPreference(this.rawSlots, this.resolved);
    for (const node of this.slots) {
      if (!node) continue;
      const r = this.resolved[node.slot];
      node.anchor = { x: r.x, y: r.y, z: r.z };
      node.calmDim = r.calmDim;
    }
    const hh = halfHeightAt(16, this.camera.fov);
    this.dust.setBounds(hh * this.camera.aspect * 1.1, hh * 1.2);
    this.updateScroll();
  }

  private updateScroll() {
    const r = this.root.getBoundingClientRect();
    this.scrollTarget = r.height > 0 ? clamp(-r.top / r.height, 0, 1) : 0;
  }

  // ------------------------------------------------------------- events ---

  private bindEvents() {
    const on = <K extends keyof WindowEventMap>(
      target: Window,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn, opts));
    };
    const onCanvas = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      this.canvas.addEventListener(type, fn);
      this.cleanups.push(() => this.canvas.removeEventListener(type, fn));
    };

    on(window, "pointermove", (e) => this.onPointerMove(e), { passive: true });
    on(
      window,
      "scroll",
      () => {
        if (!this.intersecting) return; // the IntersectionObserver refreshes it on re-entry
        this.updateScroll();
        // The canvas moved under a still mouse: re-aim the hover ray (or drop it once off the canvas).
        if (this.pointerOver) this.pointerOver = this.setPointerNdc(this.clientX, this.clientY);
      },
      { passive: true },
    );

    onCanvas("pointerdown", (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType, moved: false };
      this.tap = null;
    });
    onCanvas("pointerup", (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId) return;
      const still = !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP.maxMove;
      const quick = performance.now() - d.t < TAP.maxMs;
      this.tap = still && quick && (d.type !== "mouse" || e.button === 0) ? d.type : null;
    });
    onCanvas("pointercancel", () => {
      this.down = null;
      this.tap = null;
    });
    onCanvas("pointerleave", (e) => {
      if (e.pointerType !== "touch") this.pointerOver = false;
    });
    // Open on `click` (after pointerup) so the synthesized click can't land on the modal we just opened.
    onCanvas("click", (e) => {
      const type = this.tap;
      this.tap = null;
      if (!type) return;
      const node = this.pickAt(e.clientX, e.clientY);
      if (!node?.letter) return;
      if (type !== "mouse" || this.hovered !== node) {
        this.flashLabel(node, LABEL.flashMs);
      }
      this.onOpen(node.letter.id);
    });

    const onLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.updateRunning();
    };
    const onRestored = () => {
      // three rebuilds its GL state; our textures re-upload from their canvases.
      this.contextLost = false;
      for (const t of this.fillerTextures) t.needsUpdate = true;
      for (const n of this.slots) if (n?.ownsTexture && n.texture) n.texture.needsUpdate = true;
      this.updateRunning();
    };
    this.canvas.addEventListener("webglcontextlost", onLost);
    this.canvas.addEventListener("webglcontextrestored", onRestored);
    this.cleanups.push(() => {
      this.canvas.removeEventListener("webglcontextlost", onLost);
      this.canvas.removeEventListener("webglcontextrestored", onRestored);
    });

    const onNew = (e: Event) => this.addNewLetter((e as CustomEvent<unknown>).detail);
    window.addEventListener(NEW_LETTER_EVENT, onNew);
    this.cleanups.push(() => window.removeEventListener(NEW_LETTER_EVENT, onNew));

    const onHidden = (e: Event) => {
      const id = eventLetterId(e);
      if (id) this.hideLetter(id);
    };
    window.addEventListener(LETTER_HIDDEN_EVENT, onHidden);
    this.cleanups.push(() => window.removeEventListener(LETTER_HIDDEN_EVENT, onHidden));

    this.cleanups.push(
      subscribeImmersive((open) => {
        this.covered = open;
        if (open) this.setHovered(null);
        this.updateRunning();
      }),
    );

    const onVisibility = () => {
      this.pageVisible = document.visibilityState !== "hidden";
      this.updateRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    onVisibility();

    const reducedMq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onReduced = () => {
      this.reduced = reducedMq.matches;
    };
    onReduced();
    reducedMq.addEventListener("change", onReduced);
    this.cleanups.push(() => reducedMq.removeEventListener("change", onReduced));

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.measure());
      ro.observe(this.root);
      this.cleanups.push(() => ro.disconnect());
    } else {
      on(window, "resize", () => this.measure());
    }

    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          this.intersecting = entry.isIntersecting;
          if (this.intersecting) this.updateScroll();
          this.updateRunning();
        },
        { rootMargin: "64px 0px" },
      );
      io.observe(this.root);
      this.cleanups.push(() => io.disconnect());
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) >= TAP.maxMove) {
      this.down.moved = true;
    }
    if (e.pointerType === "touch") return; // no hover/parallax while a finger scrolls the page
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    this.pointerX = clamp((e.clientX / vw) * 2 - 1, -1, 1);
    this.pointerY = clamp(-((e.clientY / vh) * 2 - 1), -1, 1);
    this.clientX = e.clientX;
    this.clientY = e.clientY;
    this.pointerOver = e.target === this.canvas;
    if (this.pointerOver) this.setPointerNdc(e.clientX, e.clientY);
  }

  /** Returns whether the point lies on the canvas. */
  private setPointerNdc(clientX: number, clientY: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.pointerNdc.set(x, y);
    return Math.abs(x) <= 1 && Math.abs(y) <= 1;
  }

  /** Raycasts the real, settled letters (world matrices from the last rendered frame). */
  private raycast(): LetterNode | null {
    const targets = this.targets;
    targets.length = 0;
    for (const n of this.slots) {
      if (n?.kind === "real" && n.painted && !n.flight && n.fade > 0.5 && n.mesh.visible) targets.push(n.mesh);
    }
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? (this.meshToNode.get(hit.object) ?? null) : null;
  }

  private pickAt(clientX: number, clientY: number): LetterNode | null {
    if (!this.ready) return null;
    this.setPointerNdc(clientX, clientY);
    this.camera.updateMatrixWorld();
    return this.raycast();
  }

  private setHovered(node: LetterNode | null) {
    if (node === this.hovered) return;
    this.hovered = node;
    this.canvas.style.cursor = node ? "pointer" : "";
    if (node) this.showLabel(node, 0);
    else if (!this.labelUntil) this.hideLabel();
  }

  // -------------------------------------------------------------- label ---

  private showLabel(node: LetterNode, flashMs: number) {
    if (!node.letter) return;
    if (this.labelNode !== node) {
      this.labelNode = node;
      this.labelPill.textContent = node.letter.label;
      this.labelW = this.labelPill.offsetWidth;
      this.labelH = this.labelPill.offsetHeight;
    }
    this.labelShown = true;
    this.labelUntil = flashMs > 0 ? performance.now() + flashMs : 0;
    this.positionLabel();
    this.labelPill.dataset.visible = "true";
  }

  private flashLabel(node: LetterNode, ms: number) {
    if (this.hovered && this.hovered !== node) return;
    this.showLabel(node, ms);
  }

  private hideLabel() {
    if (!this.labelShown) return;
    this.labelShown = false;
    this.labelUntil = 0;
    this.labelFadeEnd = performance.now() + 400;
    this.labelPill.dataset.visible = "false";
  }

  private updateLabel(now: number) {
    if (this.labelUntil && now > this.labelUntil) {
      this.labelUntil = 0;
      if (this.hovered !== this.labelNode) this.hideLabel();
    }
    if (this.labelNode && (this.labelShown || now < this.labelFadeEnd)) this.positionLabel();
  }

  /** Beside the letter (reading side first), clamped inside the scene. Physical px: projected from WebGL. */
  private positionLabel() {
    const node = this.labelNode;
    if (!node) return;
    const p = this.tmpV.copy(node.mesh.position).project(this.camera);
    if (p.z > 1) return;
    const sx = ((p.x + 1) / 2) * this.width;
    const sy = ((1 - p.y) / 2) * this.height;
    const dist = this.camera.position.distanceTo(node.mesh.position);
    const pxPerUnit = this.height / (2 * halfHeightAt(Math.max(0.5, dist), this.camera.fov));
    const half = (LETTER_W / 2) * node.mesh.scale.x * pxPerUnit * 0.85;
    const { x, y } = labelSpot(
      sx,
      sy,
      half,
      { w: this.labelW, h: this.labelH },
      { w: this.width, h: this.height },
      this.preferLabelLeft,
    );
    this.labelAnchor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  // --------------------------------------------------------------- loop ---

  /** Stop rendering while something covers the hero (e.g. the letter view). */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.labelPill.dataset.visible = "false";
    this.updateRunning();
  }

  private paused = false;

  private updateRunning() {
    const should =
      this.ready &&
      !this.disposed &&
      !this.paused &&
      !this.covered &&
      this.pageVisible &&
      this.intersecting &&
      !this.contextLost;
    if (should && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!should && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private readonly tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.frame(dt, now);
  };

  private frame(dt: number, now: number) {
    const motion = this.reduced ? MOTION.reducedScale : 1;
    this.time += dt * motion;

    this.processPaintQueue();
    this.updateCamera(dt);

    if (this.pointerOver) this.setHovered(this.raycast());
    else if (this.hovered) this.setHovered(null);

    const rise = this.scroll * SCROLL.rise;
    for (const node of this.slots) if (node) this.updateNode(node, dt, rise);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const node = this.dying[i];
      this.updateNode(node, dt, rise);
      // Unpainted nodes never fade (updateNode skips them), so drop them right away.
      if (node.fade <= 0 || !node.painted) {
        this.disposeNode(node);
        this.dying.splice(i, 1);
      }
    }

    this.dust.update(dt * motion, this.time);
    this.updateLabel(now);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number) {
    const parallax = this.reduced ? 0.3 : 1;
    const tx = this.pointerX * PARALLAX.x * parallax + Math.sin(this.time * SWAY.speedX) * SWAY.x;
    const ty = this.pointerY * PARALLAX.y * parallax + Math.cos(this.time * SWAY.speedY) * SWAY.y;
    const k = 1 - Math.exp(-dt * PARALLAX.ease);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.scroll += (this.scrollTarget - this.scroll) * (1 - Math.exp(-dt * SCROLL.ease));
    this.camera.position.set(this.camX, this.camY, CAMERA_Z - this.scroll * SCROLL.dolly);
    this.camera.lookAt(this.camX * 0.35, this.camY * 0.35, LOOK_Z);
    this.camera.updateMatrixWorld();
  }

  private updateNode(n: LetterNode, dt: number, rise: number) {
    if (!n.painted) {
      n.mesh.visible = false;
      return;
    }
    if (n.fadeDelay > 0) n.fadeDelay -= dt;
    else if (n.fade !== n.fadeTo) {
      const step = n.fadeRate * dt;
      n.fade = n.fadeTo > n.fade ? Math.min(n.fadeTo, n.fade + step) : Math.max(n.fadeTo, n.fade - step);
    }

    const t = this.time;
    const drift = MOTION.drift;
    let x = n.anchor.x + Math.sin(t * n.driftSpeed + n.phase) * drift;
    let y =
      n.anchor.y +
      Math.cos(t * n.driftSpeed * 0.8 + n.phase * 1.3) * drift * 0.6 +
      Math.sin(t * n.bobSpeed + n.phase) * n.bobAmp +
      rise;
    let z = n.anchor.z + Math.sin(t * n.driftSpeed * 0.6 + n.phase * 0.7) * drift * 0.5;
    let rx = n.tilt.x + Math.sin(t * n.wobbleSpeed + n.phase) * n.wobble;
    let ry = n.tilt.y + Math.cos(t * n.wobbleSpeed * 0.85 + n.phase) * n.wobble;
    let rz = n.tilt.z + t * n.spinSpeed;

    const f = n.flight;
    if (f) {
      if (!f.path) {
        const p0 = flightStart(this.camera.position, this.camera.fov, FLIGHT.startDist, f.gentle);
        const [c1, c2] = flightControls(p0, { x, y, z }, f.gentle);
        f.path = { p0, c1, c2 };
      }
      f.elapsed += dt;
      const ft = clamp(f.elapsed / f.duration, 0, 1);
      const e = f.gentle ? easeInOutSine(ft) : easeInOutCubic(ft);
      const p = cubicBezier(f.path.p0, f.path.c1, f.path.c2, { x, y, z }, e, this.tmpP);
      x = p.x;
      y = p.y;
      z = p.z;
      if (f.gentle) {
        rx *= e;
        ry *= e;
      } else {
        ry += (1 - e) * TAU * FLIGHT.spinTurns;
        rz += (1 - e) * 0.9;
      }
      if (ft >= 1) {
        n.flight = null;
        if (n.slot >= 0) this.flashLabel(n, LABEL.landFlashMs);
      }
    }

    const target = n === this.hovered ? 1 : 0;
    n.hover += (target - n.hover) * (1 - Math.exp(-dt * HOVER.ease));
    if (n.hover < 0.001) n.hover = 0;

    const mesh = n.mesh;
    const cam = this.camera.position;
    if (n.hover > 0) {
      // Slide toward the camera along the view ray: bigger, same spot on screen.
      const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z) || 1;
      const k = Math.min(0.5, HOVER.forward / d) * n.hover;
      x += (cam.x - x) * k;
      y += (cam.y - y) * k;
      z += (cam.z - z) * k;
    }
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    if (n.hover > 0) {
      this.tmpObj.position.copy(mesh.position);
      this.tmpObj.lookAt(cam);
      mesh.quaternion.slerp(this.tmpObj.quaternion, n.hover * HOVER.face);
    }
    mesh.scale.setScalar(this.profile.letterScale * (1 + HOVER.scale * n.hover));

    const dist = Math.hypot(cam.x - x, cam.y - y, cam.z - z);
    let o = n.baseOpacity * (1 - DEPTH_FADE.amount * smoothstep(DEPTH_FADE.near, DEPTH_FADE.far, dist));
    if (n.calmDim && !f) o *= CALM_DIM;
    o += (1 - o) * n.hover;
    o *= n.fade;
    n.front.opacity = o;
    n.back.opacity = o;
    mesh.visible = o > 0.004;
  }
}
