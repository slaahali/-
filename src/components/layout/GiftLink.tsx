"use client";

import type { ReactNode } from "react";
import { GIFT_URL } from "@/lib/config";
import { track } from "@/lib/track";

export type GiftFrom = "header" | "footer" | "form" | "success" | "hero";

/** Outbound link to The Chefz gifts page (new tab) that reports where it was clicked. */
export function GiftLink({
  from,
  className = "",
  label,
  children,
}: {
  from: GiftFrom;
  className?: string;
  /** Accessible name when the visible content is only an icon. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={GIFT_URL}
      target="_blank"
      rel="noopener"
      aria-label={label ? `${label} (تفتح في صفحة جديدة)` : undefined}
      onClick={() => track("gift_click", { from })}
      className={className}
    >
      {children}
      {!label && <span className="visually-hidden"> (تفتح في صفحة جديدة)</span>}
    </a>
  );
}
