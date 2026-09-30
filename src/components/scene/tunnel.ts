// Imperative three.js engine behind <ImmersiveLetters>: the camera flies down
// an endless tunnel of letters. A fixed pool of meshes (each with its own
// reusable canvas texture) is recycled as the camera moves, carrying the next
// letters from `source(k)`. Wheel / drag / keys move, idle drifts, hover shows
// the name, click / tap opens. `dispose()` releases every GPU resource.

import {
  type BufferGeometry,
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
  type WebGLRenderer,
} from "three";
import { cardStyle, colorAt } from "@/lib/assets";
import { LETTER_HIDDEN_EVENT, type SceneLetter } from "@/lib/events";
import {
  BACK_EMISSIVE,
  BACK_SHADE,
  FILLER_OPACITY,
  FILLER_SNIPPETS,
  FOG_COLOR,
  HOVER,
  LABEL,
  LAYOUT_SEED,
  LETTER_W,
  MOBILE_QUERY,
  MOTION,
  PAINT_BUDGET_MS,
  REDUCED_MOTION_QUERY,
  ROUGHNESS,
  TAP,
  TUNNEL,
  TUNNEL_DESKTOP,
  TUNNEL_MOBILE,
  type TunnelProfile,
} from "./constants";
import { createDust, type Dust } from "./dust";
import { createLetterGeometry } from "./geometry";
import { clamp, fovForAspect, halfHeightAt } from "./layout";
import type { SlotContent } from "./letter-list";
import { hashString } from "./random";
import { addLights, contentKey, createRenderer, eventLetterId, labelSpot, mountCanvas } from "./shared";
import { createLetterTexture, loadPaperFamily, paintLetterCanvas, paperBackColor, type PaintSpec } from "./textures";
import {
  focusSlot,
  placeSlot,
  slotAhead,
  stepTarget,
  travelFor,
  tunnelFade,
  visibleDepth,
  wheelPixels,
  windowStart,
  type SlotPlacement,
  type TunnelGeom,
} from "./tunnel-math";

export interface TunnelOptions {
  root: HTMLDivElement;
  labelAnchor: HTMLElement;
  labelPill: HTMLElement;
  /** What slot k shows. Call `refresh()` after the mapping changes. */
  source: (k: number) => SlotContent;
  onOpen: (id: string) => void;
  /** The slot at reading distance changed (counter + paging). */
  onFocus: (k: number) => void;
  /** First wheel / drag / step (e.g. to hide the hint). */
  onInteract?: () => void;
  /** Resume at this slot. */
  startSlot?: number;
  /** Where wheel / trackpad scrolling is caught (defaults to `root`), e.g. the whole overlay. */
  wheelTarget?: HTMLElement;
}

interface TunnelNode {
  /** Slot index, −1 while free. */
  k: number;
  content: SlotContent;
  /** Content to swap in once this node has faded out (a visible letter changed). */
  next: SlotContent | undefined;
  /** What the node's own canvas currently holds. */
  paintedKey: string;
  place: SlotPlacement | null;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial[]>;
  front: MeshStandardMaterial;
  back: MeshStandardMaterial;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  /** Ready to show (own canvas painted, or a filler texture). */
  ready: boolean;
  opacity: number;
  hover: number;
  fade: number;
  fadeTo: number;
  fadeRate: number;
}

interface PointerDown {
  x: number;
  y: number;
  lastY: number;
  lastT: number;
  t: number;
  id: number;
  type: string;
  dragging: boolean;
  /** Smoothed travel velocity while dragging (units/s). */
  vel: number;
}

const letterKey = (l: SceneLetter) => `${l.id}\u0000${contentKey(l)}`;

function sameContent(a: SlotContent | undefined, b: SlotContent): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  return letterKey(a) === letterKey(b);
}

export class TunnelEngine {
  private readonly opts: TunnelOptions;
  private readonly profile: TunnelProfile;
  private readonly geom: TunnelGeom;
  private readonly depth: number;
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
  private readonly targets: Object3D[] = [];
  private readonly meshToNode = new Map<Object3D, TunnelNode>();
  private readonly cleanups: Array<() => void> = [];
  private readonly preferLabelLeft: boolean;

  private nodes: TunnelNode[] = [];
  private readonly bySlot = new Map<number, TunnelNode>();
  private fillerTextures: CanvasTexture[] = [];
  private family = "";

  private ready = false;
  private disposed = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  /** Half view at reading distance: the ring is expressed in fractions of it. */
  private ringW = 1;
  private ringH = 1;
  private pageVisible = true;
  private contextLost = false;
  private paused = false;
  private reduced = false;

  private travel = 0;
  private target = 0;
  private velocity = 0;
  private fling = 0;
  private kMin = -1;
  private focus = -1;
  private lastInput = 0;
  private interacted = false;
  private lastStepAt = 0;
  /** Flash the label of this slot's letter once the camera arrives there. */
  private arriveSlot = -1;

  private pointerX = 0;
  private pointerY = 0;
  private pointerOver = false;
  private camX = 0;
  private camY = 0;
  private down: PointerDown | null = null;
  private tap: string | null = null;
  private hovered: TunnelNode | null = null;

  private labelNode: TunnelNode | null = null;
  private labelShown = false;
  private labelUntil = 0;
  private labelFadeEnd = 0;
  private labelW = 0;
  private labelH = 0;

  /** Throws when WebGL is unavailable. */
  constructor(opts: TunnelOptions) {
    this.opts = opts;
    this.profile = window.matchMedia(MOBILE_QUERY).matches ? TUNNEL_MOBILE : TUNNEL_DESKTOP;
    this.geom = { spacing: TUNNEL.spacing, readDist: TUNNEL.readDist, behind: TUNNEL.behind, pool: this.profile.pool };
    this.depth = visibleDepth(this.geom);
    this.reduced = window.matchMedia(REDUCED_MOTION_QUERY).matches;

    this.renderer = createRenderer();
    this.anisotropy = Math.max(1, Math.min(this.profile.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));
    this.canvas = this.renderer.domElement;
    try {
      this.camera = new PerspectiveCamera(TUNNEL.fov.landscape, 1, 0.05, this.depth + 8);
      this.geometry = createLetterGeometry();
      this.dust = createDust(this.profile.dust, 8, 6, LAYOUT_SEED + 11);
    } catch (err) {
      this.renderer.dispose();
      throw err;
    }

    this.preferLabelLeft = getComputedStyle(opts.root).direction === "rtl";
    mountCanvas(opts.root, this.canvas, "none");

    this.scene.fog = new Fog(FOG_COLOR, TUNNEL.fogNear, this.depth * 1.05);
    addLights(this.scene);
    this.scene.add(this.dust.points);

    const start = Math.max(0, Math.floor(opts.startSlot ?? 0));
    this.target = travelFor(start, this.geom);
    // Glide in from a little way back (may start before slot 0); only a nudge when resuming.
    this.travel = this.reduced ? this.target : this.target - (start > 0 ? TUNNEL.spacing : TUNNEL.introPullback);
    this.lastInput = performance.now();

    this.measure(true);
    this.bindEvents();
    void this.boot();
  }

  // ------------------------------------------------------------- public ---

  /** The mapping behind `source` changed: swap what each live slot shows. */
  refresh() {
    if (!this.ready) return;
    for (const n of this.nodes) {
      if (n.k < 0) continue;
      const c = this.opts.source(n.k);
      if (sameContent(n.next !== undefined ? n.next : n.content, c)) continue;
      if (n.opacity < 0.02) this.setContent(n, c);
      else this.swapLater(n, c);
    }
  }

  /** Lets a letter go (it was taken down). */
  hideLetter(id: string) {
    for (const n of this.nodes) {
      const c = n.next !== undefined ? n.next : n.content;
      if (c && typeof c === "object" && c.id === id) {
        if (n.opacity < 0.02) this.setContent(n, null);
        else this.swapLater(n, null);
      }
    }
  }

  /** One letter forward (1) or back (−1), skipping blank paper. */
  step(dir: 1 | -1) {
    const from = Math.round(this.target / this.geom.spacing);
    const k = stepTarget(from, dir, (s) => {
      const c = this.opts.source(s);
      return Boolean(c && typeof c === "object");
    });
    this.fling = 0;
    this.target = travelFor(k, this.geom);
    this.arriveSlot = k;
    this.markInput();
  }

  /** Back to the first letter (a cut, not a long flight). */
  goToStart() {
    this.fling = 0;
    this.target = 0;
    this.travel = this.reduced ? 0 : Math.min(this.travel, 1.2);
    this.syncWindow();
    for (const n of this.nodes) {
      n.fade = 0;
      n.fadeTo = 1;
      n.fadeRate = 1 / 0.45;
    }
    this.arriveSlot = 0;
    this.markInput();
  }

  /** Opens the letter at reading distance (keyboard / "open" button). */
  openFocused(): boolean {
    const k = focusSlot(this.travel, this.geom);
    for (const s of [k, k + 1, k - 1, k + 2]) {
      const c = s >= 0 ? this.opts.source(s) : null;
      if (c && typeof c === "object") {
        this.opts.onOpen(c.id);
        return true;
      }
    }
    return false;
  }

  /** The slot at reading distance. */
  get focusedSlot(): number {
    return focusSlot(this.travel, this.geom);
  }

  /** Stop rendering while something covers the tunnel (the letter view). */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.down = null;
      this.setHovered(null);
      this.opts.labelPill.dataset.visible = "false";
      this.labelShown = false;
    }
    this.updateRunning();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const fn of this.cleanups.splice(0)) fn();
    for (const n of this.nodes) {
      this.scene.remove(n.mesh);
      n.front.dispose();
      n.back.dispose();
      n.texture.dispose();
      n.canvas.width = 0;
      n.canvas.height = 0;
    }
    this.nodes = [];
    this.bySlot.clear();
    this.meshToNode.clear();
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
    this.opts.labelPill.textContent = "";
    this.opts.labelPill.dataset.visible = "false";
  }

  // --------------------------------------------------------------- boot ---

  private async boot() {
    const family = await loadPaperFamily(1500);
    if (this.disposed) return;
    this.family = family;

    const fillerStyle = colorAt(5);
    for (let i = 0; i < this.profile.fillerTextures; i++) {
      const spec: PaintSpec = { text: FILLER_SNIPPETS[i % FILLER_SNIPPETS.length], kind: "filler", style: fillerStyle, seed: 7000 + i };
      this.fillerTextures.push(createLetterTexture(paintLetterCanvas(spec, this.profile.fillerTex, family), this.anisotropy));
    }
    for (let i = 0; i < this.profile.pool; i++) this.nodes.push(this.createNode());

    this.ready = true;
    this.syncWindow(true);
    this.updateRunning();
  }

  // -------------------------------------------------------------- nodes ---

  private createNode(): TunnelNode {
    const canvas = document.createElement("canvas");
    canvas.width = this.profile.tex.w;
    canvas.height = this.profile.tex.h;
    const texture = createLetterTexture(canvas, this.anisotropy);
    const front = new MeshStandardMaterial({
      color: 0xffffff,
      map: this.fillerTextures[0] ?? texture,
      roughness: ROUGHNESS,
      metalness: 0,
      transparent: true,
      opacity: 0,
      side: FrontSide,
    });
    const back = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
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
    const node: TunnelNode = {
      k: -1,
      content: null,
      next: undefined,
      paintedKey: "",
      place: null,
      mesh,
      front,
      back,
      canvas,
      texture,
      ready: false,
      opacity: 0,
      hover: 0,
      fade: 1,
      fadeTo: 1,
      fadeRate: 1 / 0.3,
    };
    this.meshToNode.set(mesh, node);
    return node;
  }

  /** Moves the pool so it covers the slots around the camera. */
  private syncWindow(force = false) {
    const kMin = windowStart(this.travel, this.geom);
    if (!force && kMin === this.kMin) return;
    this.kMin = kMin;
    const kMax = kMin + this.geom.pool - 1;
    const free: TunnelNode[] = [];
    for (const n of this.nodes) {
      if (n.k >= kMin && n.k <= kMax) continue;
      if (n.k >= 0) this.bySlot.delete(n.k);
      if (this.hovered === n) this.setHovered(null);
      if (this.labelNode === n) this.dropLabel();
      n.k = -1;
      free.push(n);
    }
    for (let k = kMin; k <= kMax && free.length; k++) {
      if (this.bySlot.has(k)) continue;
      const n = free.pop();
      if (!n) break;
      n.k = k;
      n.place = placeSlot(k, this.profile.ring, TUNNEL.tilt, this.geom.spacing);
      n.hover = 0;
      n.fade = 1;
      n.fadeTo = 1;
      n.next = undefined;
      this.bySlot.set(k, n);
      this.setContent(n, this.opts.source(k));
    }
  }

  private setContent(n: TunnelNode, c: SlotContent) {
    if (this.hovered === n) this.setHovered(null);
    if (this.labelNode === n) this.dropLabel();
    n.content = c;
    n.next = undefined;
    if (!c) {
      n.ready = false;
      return;
    }
    if (c === "filler") {
      const tex = this.fillerTextures[Math.abs(n.k) % Math.max(1, this.fillerTextures.length)];
      if (tex) n.front.map = tex;
      const back = new Color(paperBackColor({ kind: "filler", style: colorAt(5) })).multiplyScalar(BACK_SHADE);
      n.back.color.copy(back);
      n.back.emissive.copy(back);
      n.ready = Boolean(tex);
      return;
    }
    if (n.paintedKey === letterKey(c)) {
      n.front.map = n.texture;
      n.ready = true;
    } else {
      n.ready = false; // painted by the queue, nearest first
    }
  }

  private swapLater(n: TunnelNode, c: SlotContent) {
    n.next = c;
    n.fadeTo = 0;
    n.fadeRate = 1 / 0.3;
    if (this.hovered === n) this.setHovered(null);
    if (this.labelNode === n) this.hideLabel();
  }

  private paint(n: TunnelNode) {
    const c = n.content;
    if (!c || typeof c !== "object") return;
    const style = cardStyle(c);
    const spec: PaintSpec = { text: c.snippet, kind: c.inMemory ? "memory" : "real", style, seed: hashString(c.id) };
    paintLetterCanvas(spec, this.profile.tex, this.family, n.canvas);
    n.texture.needsUpdate = true;
    n.front.map = n.texture;
    n.paintedKey = letterKey(c);
    const back = new Color(paperBackColor(spec)).multiplyScalar(BACK_SHADE);
    n.back.color.copy(back);
    n.back.emissive.copy(back);
    n.ready = true;
  }

  /** Paints waiting letters, nearest to the camera first, within the frame budget. */
  private processPaintQueue() {
    const t0 = performance.now();
    for (;;) {
      let best: TunnelNode | null = null;
      let bestD = Infinity;
      for (const n of this.nodes) {
        if (n.k < 0 || n.ready || !n.content || typeof n.content !== "object") continue;
        const d = Math.abs(slotAhead(n.k, this.travel, this.geom) - 1);
        if (d < bestD) {
          best = n;
          bestD = d;
        }
      }
      if (!best) return;
      this.paint(best);
      if (performance.now() - t0 >= PAINT_BUDGET_MS) return;
    }
  }

  // ------------------------------------------------------------- layout ---

  private measure(force = false) {
    const root = this.opts.root;
    const w = Math.max(1, Math.round(root.clientWidth));
    const h = Math.max(1, Math.round(root.clientHeight));
    if (!force && w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovForAspect(this.camera.aspect, TUNNEL.fov.landscape, TUNNEL.fov.portrait);
    this.camera.updateProjectionMatrix();
    this.ringH = halfHeightAt(TUNNEL.readDist, this.camera.fov);
    // Very wide screens: keep the tunnel round-ish instead of a flat band.
    this.ringW = this.ringH * Math.min(this.camera.aspect, 1.9);
    const far = halfHeightAt(12, this.camera.fov);
    this.dust.setBounds(far * Math.min(this.camera.aspect, 1.9), far);
  }

  // ------------------------------------------------------------- events ---

  private bindEvents() {
    const listen = <T extends Event>(
      target: EventTarget,
      type: string,
      fn: (e: T) => void,
      options?: AddEventListenerOptions,
    ) => {
      const h = fn as EventListener;
      target.addEventListener(type, h, options);
      this.cleanups.push(() => target.removeEventListener(type, h, options));
    };
    const canvas = this.canvas;

    listen<PointerEvent>(window, "pointermove", (e) => this.onPointerMove(e), { passive: true });
    listen<PointerEvent>(canvas, "pointerdown", (e) => this.onPointerDown(e));
    listen<PointerEvent>(canvas, "pointerup", (e) => this.onPointerUp(e));
    // Released off the canvas before a drag started: forget the press (it would block the drift).
    listen<PointerEvent>(window, "pointerup", (e) => {
      if (e.target !== canvas && this.down?.id === e.pointerId && !this.down.dragging) this.down = null;
    });
    listen<PointerEvent>(canvas, "pointercancel", () => {
      this.down = null;
      this.tap = null;
    });
    listen<PointerEvent>(canvas, "pointerleave", (e) => {
      if (e.pointerType !== "touch") this.pointerOver = false;
    });
    // Open on `click` (after pointerup) so the synthesized click can't land on the letter view.
    listen<MouseEvent>(canvas, "click", (e) => {
      const type = this.tap;
      this.tap = null;
      if (!type || this.paused) return;
      const node = this.pickAt(e.clientX, e.clientY);
      const c = node?.content;
      if (!node || !c || typeof c !== "object") return;
      if (type !== "mouse" || this.hovered !== node) this.showLabel(node, LABEL.flashMs);
      this.opts.onOpen(c.id);
    });
    listen<WheelEvent>(this.opts.wheelTarget ?? this.opts.root, "wheel", (e) => this.onWheel(e), { passive: true });

    listen<Event>(canvas, "webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.updateRunning();
    });
    listen<Event>(canvas, "webglcontextrestored", () => {
      this.contextLost = false;
      for (const t of this.fillerTextures) t.needsUpdate = true;
      for (const n of this.nodes) if (n.paintedKey) n.texture.needsUpdate = true;
      this.updateRunning();
    });

    listen<Event>(window, LETTER_HIDDEN_EVENT, (e) => {
      const id = eventLetterId(e);
      if (id) this.hideLetter(id);
    });

    const onVisibility = () => {
      this.pageVisible = document.visibilityState !== "hidden";
      this.updateRunning();
    };
    listen<Event>(document, "visibilitychange", onVisibility);
    onVisibility();

    const reducedMq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onReduced = () => {
      this.reduced = reducedMq.matches;
    };
    reducedMq.addEventListener("change", onReduced);
    this.cleanups.push(() => reducedMq.removeEventListener("change", onReduced));

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.measure());
      ro.observe(this.opts.root);
      this.cleanups.push(() => ro.disconnect());
    } else {
      listen<UIEvent>(window, "resize", () => this.measure());
    }
  }

  private markInput() {
    this.lastInput = performance.now();
    if (!this.interacted) {
      this.interacted = true;
      this.opts.onInteract?.();
    }
  }

  private onWheel(e: WheelEvent) {
    if (this.paused || e.ctrlKey) return; // ctrl+wheel is pinch-zoom
    const px = wheelPixels(e.deltaY, e.deltaMode, this.height);
    if (Math.abs(px) < 1) return;
    if (this.reduced) {
      const now = performance.now();
      if (now - this.lastStepAt < TUNNEL.stepCooldownMs) return;
      this.lastStepAt = now;
      this.step(px > 0 ? 1 : -1);
      return;
    }
    this.fling = 0;
    this.arriveSlot = -1;
    this.target = Math.max(0, this.target + clamp(px, -240, 240) * TUNNEL.wheel);
    this.markInput();
  }

  private onPointerDown(e: PointerEvent) {
    if (this.paused) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const now = performance.now();
    this.down = { x: e.clientX, y: e.clientY, lastY: e.clientY, lastT: now, t: now, id: e.pointerId, type: e.pointerType, dragging: false, vel: 0 };
    this.tap = null;
    this.fling = 0;
  }

  private onPointerUp(e: PointerEvent) {
    const d = this.down;
    this.down = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.dragging) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      if (this.reduced) {
        // Direct manipulation, then settle on the nearest letter.
        const k = Math.round(this.target / this.geom.spacing);
        this.target = travelFor(k, this.geom);
        this.arriveSlot = k;
      } else if (Math.abs(d.vel) > 0.4) {
        this.fling = clamp(d.vel, -TUNNEL.flingMax, TUNNEL.flingMax);
      }
      this.markInput();
      return;
    }
    const quick = performance.now() - d.t < TAP.maxMs;
    const still = Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP.maxMove;
    this.tap = still && quick ? d.type : null;
  }

  private onPointerMove(e: PointerEvent) {
    const d = this.down;
    if (d && d.id === e.pointerId) {
      if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP.maxMove) {
        d.dragging = true;
        d.lastY = e.clientY;
        d.lastT = performance.now();
        this.arriveSlot = -1;
        this.setHovered(null);
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }
      if (d.dragging) {
        const now = performance.now();
        const dy = e.clientY - d.lastY;
        // Finger / mouse up = forward, like scrolling down a page.
        const delta = -dy * TUNNEL.drag;
        this.target = Math.max(0, this.target + delta);
        const dt = Math.max(1, now - d.lastT) / 1000;
        d.vel = d.vel * 0.6 + (delta / dt) * 0.4;
        d.lastY = e.clientY;
        d.lastT = now;
        this.markInput();
      }
    }
    if (e.pointerType === "touch") return; // no hover on touch
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    this.pointerX = clamp((e.clientX / vw) * 2 - 1, -1, 1);
    this.pointerY = clamp(-((e.clientY / vh) * 2 - 1), -1, 1);
    this.pointerOver = e.target === this.canvas && !this.down?.dragging;
    if (this.pointerOver) this.setPointerNdc(e.clientX, e.clientY);
  }

  private setPointerNdc(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  private raycast(): TunnelNode | null {
    const targets = this.targets;
    targets.length = 0;
    for (const n of this.nodes) {
      if (n.k < 0 || !n.ready || n.next !== undefined || !n.content || typeof n.content !== "object") continue;
      if (n.opacity > 0.35 && n.mesh.visible) targets.push(n.mesh);
    }
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? (this.meshToNode.get(hit.object) ?? null) : null;
  }

  private pickAt(clientX: number, clientY: number): TunnelNode | null {
    if (!this.ready) return null;
    this.setPointerNdc(clientX, clientY);
    this.camera.updateMatrixWorld();
    return this.raycast();
  }

  private setHovered(node: TunnelNode | null) {
    if (node === this.hovered) return;
    this.hovered = node;
    this.canvas.style.cursor = node ? "pointer" : "";
    if (node) this.showLabel(node, 0);
    else if (!this.labelUntil) this.hideLabel();
  }

  // -------------------------------------------------------------- label ---

  private showLabel(node: TunnelNode, flashMs: number) {
    const c = node.content;
    if (!c || typeof c !== "object") return;
    const pill = this.opts.labelPill;
    if (this.labelNode !== node || pill.textContent !== c.label) {
      this.labelNode = node;
      pill.textContent = c.label;
      this.labelW = pill.offsetWidth;
      this.labelH = pill.offsetHeight;
    }
    this.labelShown = true;
    this.labelUntil = flashMs > 0 ? performance.now() + flashMs : 0;
    this.positionLabel();
    pill.dataset.visible = "true";
  }

  private hideLabel() {
    if (!this.labelShown) return;
    this.labelShown = false;
    this.labelUntil = 0;
    this.labelFadeEnd = performance.now() + 400;
    this.opts.labelPill.dataset.visible = "false";
  }

  /** The labelled letter is leaving the pool: hide at once, stop following it. */
  private dropLabel() {
    this.hideLabel();
    this.labelNode = null;
    this.labelFadeEnd = 0;
  }

  private updateLabel(now: number) {
    if (this.labelUntil && now > this.labelUntil) {
      this.labelUntil = 0;
      if (this.hovered !== this.labelNode) this.hideLabel();
    }
    if (this.labelNode && (this.labelShown || now < this.labelFadeEnd)) this.positionLabel();
  }

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
    this.opts.labelAnchor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  // --------------------------------------------------------------- loop ---

  private updateRunning() {
    const should = this.ready && !this.disposed && !this.paused && this.pageVisible && !this.contextLost;
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
    this.time += dt * (this.reduced ? MOTION.reducedScale : 1);
    this.move(dt, now);
    this.syncWindow();
    this.processPaintQueue();

    const focus = focusSlot(this.travel, this.geom);
    if (focus !== this.focus) {
      this.focus = focus;
      this.opts.onFocus(focus);
    }

    for (const n of this.nodes) this.updateNode(n, dt);

    if (this.pointerOver && !this.down?.dragging) this.setHovered(this.raycast());
    else if (this.hovered) this.setHovered(null);

    if (this.arriveSlot >= 0 && Math.abs(this.travel - this.target) < 0.05) {
      const node = this.bySlot.get(this.arriveSlot);
      this.arriveSlot = -1;
      if (node && node.ready && !this.hovered) this.showLabel(node, LABEL.landFlashMs);
    }

    this.dust.follow(this.camera.position.z);
    this.dust.update(dt * (this.reduced ? MOTION.reducedScale : 1), this.time);
    this.updateLabel(now);
    this.renderer.render(this.scene, this.camera);
  }

  private move(dt: number, now: number) {
    const idle = (now - this.lastInput) / 1000;
    if (!this.reduced && !this.down && !this.hovered && idle > TUNNEL.idleAfter && this.arriveSlot < 0) {
      const ramp = clamp((idle - TUNNEL.idleAfter) / TUNNEL.driftRamp, 0, 1);
      this.target += TUNNEL.drift * ramp * dt;
    }
    if (this.fling !== 0) {
      this.target = Math.max(0, this.target + this.fling * dt);
      this.fling *= Math.exp(-TUNNEL.flingDecay * dt);
      if (Math.abs(this.fling) < 0.05) this.fling = 0;
    }

    const ease = this.down?.dragging ? 14 : TUNNEL.ease;
    const maxStep = TUNNEL.maxSpeed * dt;
    const step = clamp((this.target - this.travel) * (1 - Math.exp(-dt * ease)), -maxStep, maxStep);
    this.travel += step;
    this.velocity = dt > 0 ? step / dt : 0;

    const parallax = this.reduced ? 0.25 : 1;
    const tx = this.pointerX * 0.35 * parallax + Math.sin(this.time * 0.11) * 0.12;
    const ty = this.pointerY * 0.22 * parallax + Math.cos(this.time * 0.09) * 0.08;
    const k = 1 - Math.exp(-dt * 2.2);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    const z = -this.travel;
    this.camera.position.set(this.camX, this.camY, z);
    this.camera.lookAt(this.camX * 0.25, this.camY * 0.25, z - 10);
    // A slight bank while flying.
    this.camera.rotateZ(clamp(this.velocity * 0.012, -0.05, 0.05) + Math.sin(this.time * 0.07) * 0.015);
    this.camera.updateMatrixWorld();
  }

  private updateNode(n: TunnelNode, dt: number) {
    const mesh = n.mesh;
    if (n.k < 0 || !n.place || !n.content || !n.ready) {
      mesh.visible = false;
      n.opacity = 0;
      return;
    }
    if (n.fade !== n.fadeTo) {
      const s = n.fadeRate * dt;
      n.fade = n.fadeTo > n.fade ? Math.min(n.fadeTo, n.fade + s) : Math.max(n.fadeTo, n.fade - s);
    }
    if (n.next !== undefined && n.fade <= 0) {
      this.setContent(n, n.next);
      n.fadeTo = 1;
      if (!n.content || !n.ready) {
        mesh.visible = false;
        n.opacity = 0;
        return;
      }
    }

    const p = n.place;
    const t = this.time;
    const zBase = -(TUNNEL.readDist + n.k * this.geom.spacing) + p.dz;
    let x = p.u * this.ringW + Math.sin(t * 0.21 + p.phase) * 0.06;
    let y = p.v * this.ringH + Math.sin(t * p.bobSpeed + p.phase) * p.bob;
    let z = zBase;
    const cam = this.camera.position;

    const target = n === this.hovered ? 1 : 0;
    n.hover += (target - n.hover) * (1 - Math.exp(-dt * HOVER.ease));
    if (n.hover < 0.001) n.hover = 0;
    if (n.hover > 0) {
      const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z) || 1;
      const k = Math.min(0.16, 0.5 / d) * n.hover;
      x += (cam.x - x) * k;
      y += (cam.y - y) * k;
      z += (cam.z - z) * k;
    }
    mesh.position.set(x, y, z);
    mesh.rotation.set(
      p.tilt.x + Math.sin(t * p.wobbleSpeed + p.phase) * p.wobble,
      p.tilt.y + Math.cos(t * p.wobbleSpeed * 0.85 + p.phase) * p.wobble,
      p.tilt.z + t * p.spin,
    );
    this.tmpObj.position.copy(mesh.position);
    this.tmpObj.lookAt(cam);
    mesh.quaternion.slerp(this.tmpObj.quaternion, TUNNEL.face + (1 - TUNNEL.face) * HOVER.face * n.hover);
    mesh.scale.setScalar(this.profile.letterScale * (1 + HOVER.scale * 0.6 * n.hover));

    const dist = cam.z - zBase;
    const base = n.content === "filler" ? FILLER_OPACITY : 1;
    let o = base * tunnelFade(dist, this.depth, TUNNEL.near, TUNNEL.farFadeFrom);
    o += (1 - o) * n.hover;
    o *= n.fade;
    n.opacity = o;
    n.front.opacity = o;
    n.back.opacity = o;
    mesh.visible = o > 0.004;
  }
}
