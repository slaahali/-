"use client";

import { useSyncExternalStore } from "react";
import { setSoundEnabled, soundEnabled, soundEnabledServer, subscribeSound } from "@/lib/sound";

/** Round speaker button (like the reference's corner control). */
export function SoundToggle({ className = "" }: { className?: string }) {
  const on = useSyncExternalStore(subscribeSound, soundEnabled, soundEnabledServer);
  return (
    <button
      type="button"
      onClick={() => setSoundEnabled(!on)}
      aria-pressed={on}
      aria-label={on ? "كتم الأصوات" : "تشغيل الأصوات"}
      title={on ? "كتم الأصوات" : "تشغيل الأصوات"}
      className={`icon-btn ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
        {on ? (
          <>
            <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
            <path d="M18 6.5a7.8 7.8 0 0 1 0 11" />
          </>
        ) : (
          <path d="M16 9.5l5 5m0-5l-5 5" />
        )}
      </svg>
    </button>
  );
}
