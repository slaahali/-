// The tunnel's reading list: every letter seen so far, newest first, deduped,
// minus the ones taken down during this visit. Maps tunnel slots to letters
// (wrapping around at the end) and pads a very short list with blank paper so
// the same three letters don't fill the whole tunnel.

import type { SceneLetter } from "@/lib/events";
import { toSceneLetter } from "@/lib/format";
import type { PublicMessage } from "@/lib/types";

export type SlotContent = SceneLetter | "filler" | null;

/** Below this many letters, blank letters are mixed in between the real ones. */
export const SPARSE_BELOW = 16;

export class LetterList {
  private readonly messages: PublicMessage[] = [];
  private readonly scene: SceneLetter[] = [];
  private readonly ids = new Set<string>();
  private readonly hidden = new Set<string>();

  /** Appends unseen letters (in order); returns how many were new. */
  add(list: readonly PublicMessage[]): number {
    let added = 0;
    for (const m of list) {
      if (!m || typeof m.id !== "string" || this.ids.has(m.id) || this.hidden.has(m.id)) continue;
      this.ids.add(m.id);
      this.messages.push(m);
      this.scene.push(toSceneLetter(m));
      added++;
    }
    return added;
  }

  /** Marks a letter as taken down (its slots stay empty). Returns whether it was listed. */
  hide(id: string): boolean {
    if (this.hidden.has(id)) return false;
    this.hidden.add(id);
    return this.ids.has(id);
  }

  isHidden(id: string): boolean {
    return this.hidden.has(id);
  }

  get length(): number {
    return this.messages.length;
  }

  /** Letters still public. */
  get visibleCount(): number {
    let n = 0;
    for (const m of this.messages) if (!this.hidden.has(m.id)) n++;
    return n;
  }

  /** Slots per real letter: 1 normally; 2–3 while the list is short. */
  stride(): number {
    const n = this.messages.length;
    if (n === 0 || n >= SPARSE_BELOW) return 1;
    return n >= 8 ? 2 : 3;
  }

  /** Index into the list shown at slot k, or −1 for a blank slot. */
  indexAt(k: number): number {
    const n = this.messages.length;
    if (n === 0 || k < 0) return -1;
    const s = this.stride();
    if (k % s !== 0) return -1;
    return Math.floor(k / s) % n;
  }

  /** What slot k shows: a letter, blank paper, or nothing (taken down). */
  at(k: number): SlotContent {
    if (this.messages.length === 0) return "filler";
    const i = this.indexAt(k);
    if (i < 0) return "filler";
    return this.hidden.has(this.messages[i].id) ? null : this.scene[i];
  }

  message(i: number): PublicMessage | null {
    return this.messages[i] ?? null;
  }

  letter(i: number): SceneLetter | null {
    return this.scene[i] ?? null;
  }

  /** Listed letters that were taken down. */
  get hiddenCount(): number {
    return this.messages.length - this.visibleCount;
  }

  /** The list index of the nearest real letter at or around slot k (−1 when empty). */
  nearestIndex(k: number): number {
    const s = this.stride();
    return this.indexAt(Math.max(0, Math.round(k / s) * s));
  }
}
