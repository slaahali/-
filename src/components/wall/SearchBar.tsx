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

  // Only reserve room for the spinner / clear button while they are shown, so
  // the placeholder fits on a 360px phone.
  const endPad = value ? (busy ? "pe-[5.25rem]" : "pe-14") : busy ? "pe-11" : "pe-4";

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
        <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-plum/55 transition-colors group-focus-within:text-orange">
          <SearchGlyph size={22} />
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
          className={`h-14 w-full rounded-[14px] border-[1.5px] border-line-strong bg-paper ps-12 ${endPad} text-[1.0625rem] font-medium text-ink shadow-[0_1px_1px_rgb(61_15_45/0.06),0_10px_24px_-18px_rgb(105_29_78/0.35)] transition-[border-color,box-shadow] duration-200 outline-none placeholder:font-normal placeholder:text-ink-mute hover:border-plum-200 focus:border-plum focus:shadow-[0_0_0_4px_rgb(105_29_78/0.1)] focus-visible:outline-none sm:h-15 sm:text-[1.15rem] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none`}
        />
        <div className="absolute inset-y-0 end-1.5 flex items-center gap-1">
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
