"use client";

import { useRef, type KeyboardEvent } from "react";
import type { AdminFilter } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { ADMIN_TABS, type AdminTab } from "./admin-model";
import { cx } from "./ui";

export const tabId = (f: AdminFilter) => `admin-tab-${f}`;

function badgeTone(tab: AdminTab, n: number, selected: boolean): string {
  if (selected) return "bg-white/20 text-white";
  if (n > 0 && tab.tone === "review") return "bg-orange text-white";
  if (n > 0 && tab.tone === "alert") return "bg-danger text-white";
  return "bg-cream-2 text-ink-mute";
}

/** WAI-ARIA tabs (arrow keys follow the reading direction) with live counts. */
export function AdminTabs({
  value,
  counts,
  onChange,
  panelId,
}: {
  value: AdminFilter;
  counts: Record<AdminFilter, number>;
  onChange: (f: AdminFilter) => void;
  panelId: string;
}) {
  const refs = useRef(new Map<AdminFilter, HTMLButtonElement>());

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    let next: number;
    if (e.key === "ArrowLeft") next = rtl ? index + 1 : index - 1;
    else if (e.key === "ArrowRight") next = rtl ? index - 1 : index + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ADMIN_TABS.length - 1;
    else return;
    e.preventDefault();
    const f = ADMIN_TABS[(next + ADMIN_TABS.length) % ADMIN_TABS.length].filter;
    onChange(f);
    refs.current.get(f)?.focus();
  }

  return (
    // `relative`: the badges' visually-hidden spans are absolutely positioned; without a
    // positioned ancestor they escape the scroller and widen the whole page on phones.
    <div className="relative -mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label="تصنيفات الرسائل" className="flex w-max gap-1.5 py-1">
        {ADMIN_TABS.map((t, i) => {
          const selected = t.filter === value;
          const n = counts[t.filter];
          return (
            <button
              key={t.filter}
              ref={(el) => {
                if (el) refs.current.set(t.filter, el);
                else refs.current.delete(t.filter);
              }}
              type="button"
              role="tab"
              id={tabId(t.filter)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.filter)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cx(
                "inline-flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] px-3.5 text-sm font-bold whitespace-nowrap transition-colors lg:min-h-10",
                selected
                  ? "border-plum bg-plum text-white"
                  : "border-line bg-white text-ink-soft hover:border-plum-200 hover:text-plum",
              )}
            >
              {t.label}
              <span
                className={cx(
                  "min-w-6 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums",
                  badgeTone(t, n, selected),
                )}
              >
                <span className="visually-hidden">(</span>
                {formatCount(n)}
                <span className="visually-hidden">)</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
