"use client";

import { useId, useRef } from "react";
import { COPY } from "@/lib/config";
import { CloseGlyph, SearchGlyph, Spinner } from "./glyphs";

const LABEL = "ابحث عن اسمك أو اسم مدرستك";

export function SearchBar({
  value,
  onChange,
  busy,
  controls,
  className = "",
}: {
  value: string;
  onChange: (q: string, opts?: { immediate?: boolean }) => void;
  /** A search request is in flight. */
  busy: boolean;
  /** id of the results region. */
  controls: string;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    onChange("", { immediate: true });
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      aria-label="البحث في الرسائل"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        onChange(value, { immediate: true });
        // Closes the on-screen keyboard so the results are visible.
        inputRef.current?.blur();
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        {LABEL}
      </label>
      <div className="group relative">
        <span className="pointer-events-none absolute inset-y-0 start-5 flex items-center text-plum/60 transition-colors group-focus-within:text-orange">
          <SearchGlyph size={24} />
        </span>
        <input
          ref={inputRef}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={60}
          value={value}
          placeholder={COPY.searchPlaceholder}
          aria-controls={controls}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              clear();
            }
          }}
          className="h-15 w-full rounded-full border-2 border-plum-200 bg-white ps-14 pe-24 text-[1.125rem] font-medium text-ink shadow-soft transition-[border-color,box-shadow] duration-200 outline-none placeholder:font-normal placeholder:text-ink-mute hover:border-plum/40 focus:border-plum focus:shadow-[0_0_0_5px_rgb(105_29_78/0.12),0_18px_40px_-20px_rgb(105_29_78/0.45)] focus-visible:outline-none sm:h-16 sm:text-[1.2rem] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        />
        <div className="absolute inset-y-0 end-2 flex items-center gap-1">
          {busy && <Spinner size={20} className="text-orange" />}
          {value && (
            <button
              type="button"
              onClick={clear}
              aria-label="مسح البحث"
              className="grid size-11 place-items-center rounded-full text-plum transition-colors hover:bg-plum-50"
            >
              <CloseGlyph size={18} stroke={2.2} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
