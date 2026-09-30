"use client";

import { useEffect, useRef } from "react";
import type { SceneLetter } from "@/lib/events";
import { play } from "@/lib/sound";
import { LettersEngine } from "./engine";
import { LABEL_PILL_CLASS } from "./label-style";

export type LettersSceneProps = {
  /** Real letters to float (≤ 40); the scene pads the field with blank ones. */
  letters: SceneLetter[];
  /** Click/tap on a real letter. */
  onOpen: (id: string) => void;
  /** Stop the render loop, e.g. while the letter view covers the hero. */
  paused?: boolean;
  className?: string;
};

const POSITIONED = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/;

/**
 * Floating folded letters (three.js): the newest letters, padded with blank
 * ones only while there are few. Decorative: the canvas is aria-hidden and the
 * wall below is the accessible way to reach every letter. Also flies in letters
 * announced with NEW_LETTER_EVENT and lets go of LETTER_HIDDEN_EVENT ones.
 * Plays the "open" sound on the tap that opens a letter. Renders an empty box
 * without WebGL.
 */
export default function LettersScene({ letters, onOpen, paused = false, className }: LettersSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LettersEngine | null>(null);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    const root = rootRef.current;
    const labelAnchor = anchorRef.current;
    const labelPill = pillRef.current;
    if (!root || !labelAnchor || !labelPill) return;
    let engine: LettersEngine | null = null;
    try {
      engine = new LettersEngine({
        root,
        labelAnchor,
        labelPill,
        onOpen: (id) => {
          void play("open"); // inside the click: the gesture unlocks audio
          onOpenRef.current(id);
        },
      });
    } catch {
      engine = null; // no WebGL: the hero's CSS layer carries the look
    }
    engineRef.current = engine;
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Runs after the engine effect on mount (and again on every change): diffed by id.
  useEffect(() => {
    engineRef.current?.setLetters(letters);
  }, [letters]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  const cls = ["overflow-hidden", POSITIONED.test(className ?? "") ? "" : "relative", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={rootRef} className={cls}>
      {/* Hover label. The engine moves the anchor with a physical translate projected from WebGL. */}
      <div
        ref={anchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-10 will-change-transform"
      >
        <div
          ref={pillRef}
          data-visible="false"
          className={LABEL_PILL_CLASS}
        />
      </div>
    </div>
  );
}
