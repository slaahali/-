"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useLetters } from "@/components/LettersProvider";
import { ShareSearch } from "@/components/share/ShareSearch";
import { Icon3D } from "@/components/ui/Icon3D";
import { LETTER_HIDDEN_EVENT } from "@/lib/events";
import { COPY } from "@/lib/config";
import { formatCount } from "@/lib/format";
import type { ListResult, PublicMessage, SortMode } from "@/lib/types";
import { Spinner } from "./glyphs";
import { MessageCard, SkeletonCard } from "./MessageCard";
import { SearchBar } from "./SearchBar";
import { useWall } from "./useWall";
import { cleanQueryName, lettersCount } from "./wall-utils";
import styles from "./wall.module.css";

const RESULTS_ID = "wall-results";
const LEAVE_MS = 450;
const FRESH_MS = 9000;
const TOAST_MS = 3800;

/** «3 رسائل لـ «نورة»» with the right noun form (COPY.searchResults can't inflect). */
const resultsLine = (n: number, q: string) => `${lettersCount(n)} لـ «${q}»`;

/** «جدار الامتنان»: search, sort and the masonry of letters (section #letters). */
export function WallSection({
  initial,
  initialQuery,
}: {
  initial: ListResult;
  initialQuery?: string;
}) {
  const { total: allTotal, remember, setWallOrder, onNewMessage, requestPrefill } = useLetters();
  const wall = useWall(initial, initialQuery ?? "");
  const [freshId, setFreshId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  // Everything on the wall can be opened instantly and stepped through in order.
  useEffect(() => {
    remember(wall.items);
    setWallOrder(wall.items.filter((m) => !leaving.has(m.id)).map((m) => m.id));
  }, [wall.items, leaving, remember, setWallOrder]);

  const handleNew = useEffectEvent((m: PublicMessage) => {
    if (wall.sort === "new" && !wall.appliedQuery && !wall.query.trim()) {
      wall.prepend(m);
      setFreshId(m.id);
    } else {
      setToast({ text: m.inMemory ? "وصلت رسالتك 🤍" : "وصلت رسالتك 💜", key: Date.now() });
    }
  });
  useEffect(() => onNewMessage((m) => handleNew(m)), [onNewMessage]);

  const handleHidden = useEffectEvent((id: string) => {
    if (!wall.items.some((m) => m.id === id)) return;
    setLeaving((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      wall.remove(id);
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, LEAVE_MS);
  });
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) handleHidden(id);
    };
    window.addEventListener(LETTER_HIDDEN_EVENT, on);
    return () => window.removeEventListener(LETTER_HIDDEN_EVENT, on);
  }, []);

  useEffect(() => {
    if (!freshId) return;
    const t = window.setTimeout(() => setFreshId(null), FRESH_MS);
    return () => window.clearTimeout(t);
  }, [freshId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const q = wall.appliedQuery;
  const searching = q.length > 0;
  const loading = wall.status === "loading";
  const loadingMore = wall.status === "loading-more";
  const empty = wall.items.length === 0;
  const listFailed = wall.failed === "list";
  const settledEmpty = empty && !loading && !listFailed;

  let announce = "";
  if (loading) announce = "جاري البحث…";
  else if (searching && !listFailed)
    announce = empty ? COPY.emptySearchTitle : resultsLine(wall.total, q);

  return (
    <>
      <section
        id="letters"
        aria-labelledby="wall-title"
        className={`${styles.section} pt-8 pb-12 sm:scroll-mt-16 sm:py-24`}
      >
        <div className="container-page">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-end lg:gap-12">
            <header className="max-w-2xl">
              {allTotal > 0 && (
                <p className="mb-2 flex items-center gap-2.5 text-[0.95rem] font-bold text-orange-700">
                  <span aria-hidden="true" className="h-[1.5px] w-7 bg-current opacity-60" />
                  {lettersCount(allTotal, { one: "رسالة وحدة" })} على الجدار
                </p>
              )}
              <h2
                id="wall-title"
                className="text-h2 leading-[1.2] font-bold text-plum sm:text-5xl"
              >
                {COPY.wallTitle}
              </h2>
              <p className="mt-2 text-letter leading-snug font-bold text-ink sm:text-[1.55rem]">
                {COPY.wallCta}
              </p>
            </header>

            <SearchBar
              value={wall.query}
              onChange={wall.setQuery}
              busy={loading}
              controls={RESULTS_ID}
            />
          </div>

          <p role="status" className="visually-hidden">
            {announce}
          </p>

          {!settledEmpty && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-1 sm:mt-8">
              <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {searching && !empty && (
                  <>
                    <p className="text-[1.05rem] font-bold text-plum [overflow-wrap:anywhere] sm:text-lg">
                      {resultsLine(wall.total, q)}
                    </p>
                    <ShareSearch q={q} count={wall.total} />
                  </>
                )}
              </div>
              <SortControl value={wall.sort} onChange={wall.setSort} />
            </div>
          )}

          <div id={RESULTS_ID} aria-busy={loading || loadingMore} className="mt-4 sm:mt-6">
            {listFailed && <ErrorBanner onRetry={wall.retry} />}

            {loading && empty ? (
              <SkeletonGrid count={6} />
            ) : settledEmpty && searching ? (
              <Invitation q={q} onWrite={requestPrefill} />
            ) : settledEmpty ? (
              <EmptyWall />
            ) : (
              <ul
                role="list"
                className={`columns-1 gap-6 pt-3 transition-opacity duration-300 sm:columns-2 sm:pt-5 lg:columns-3 lg:gap-7 ${
                  loading ? "opacity-45 delay-150" : ""
                }`}
              >
                {wall.items.map((m, i) => (
                  <li key={m.id} className="mb-7 break-inside-avoid lg:mb-8">
                    <MessageCard
                      message={m}
                      index={i}
                      fresh={m.id === freshId}
                      leaving={leaving.has(m.id)}
                    />
                  </li>
                ))}
                {loadingMore &&
                  [0, 1, 2].map((i) => (
                    <li
                      key={`skeleton-${i}`}
                      aria-hidden="true"
                      className="mb-7 break-inside-avoid lg:mb-8"
                    >
                      <SkeletonCard lines={4 + (i % 2)} />
                    </li>
                  ))}
              </ul>
            )}

            {wall.failed === "more" && <ErrorBanner onRetry={wall.retry} />}

            {wall.nextCursor && !empty && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={wall.loadMore}
                  disabled={loading || loadingMore}
                  className="btn btn-ghost min-w-52 text-[1.05rem]"
                >
                  {loadingMore ? (
                    <>
                      <Spinner size={18} /> جاري التحميل…
                    </>
                  ) : (
                    <>
                      {COPY.loadMore} <span aria-hidden="true">↓</span>
                    </>
                  )}
                </button>
                <p className="text-sm text-ink-mute">
                  {formatCount(wall.items.length)} من {lettersCount(wall.total)}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Outside the section's stacking context so it floats above everything. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {toast && (
          <p
            key={toast.key}
            className={`rounded-full bg-plum px-5 py-3 text-center font-bold text-white shadow-lift ${styles.toast}`}
          >
            {toast.text}
          </p>
        )}
      </div>
    </>
  );
}

function SortControl({ value, onChange }: { value: SortMode; onChange: (s: SortMode) => void }) {
  const options: { value: SortMode; label: string }[] = [
    { value: "new", label: COPY.sortNew },
    { value: "top", label: COPY.sortTop },
  ];
  return (
    <div role="group" aria-label="ترتيب الرسائل" className="-me-2 ms-auto flex shrink-0 items-center">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`relative min-h-11 rounded-lg px-3 text-[0.98rem] font-bold transition-colors duration-200 ${
              on ? "text-plum" : "text-ink-mute hover:text-plum"
            }`}
          >
            {o.label}
            {on && (
              <svg
                aria-hidden="true"
                viewBox="0 0 60 6"
                preserveAspectRatio="none"
                className={styles.sortMark}
              >
                <path
                  d="M1 4.2C12 2.2 26 1.6 38 2.4c7 .5 14 1.3 21 .6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div aria-hidden="true" className="columns-1 gap-5 pt-3 sm:columns-2 lg:columns-3 lg:gap-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="mb-5 break-inside-avoid lg:mb-6">
          <SkeletonCard lines={3 + (i % 3)} />
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto my-5 flex max-w-xl flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-2.5 text-[0.95rem] font-semibold text-orange-700"
    >
      <span>ما قدرنا نحمّل الرسائل</span>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-full bg-white px-4 font-bold text-plum shadow-soft transition-colors hover:bg-plum-50"
      >
        حاول مرة ثانية
      </button>
    </div>
  );
}

function EmptyWall() {
  return (
    <div className={`${styles.invite} mx-auto max-w-xl px-5 pt-8 pb-9 text-center sm:px-10`}>
      <Icon3D name="envelope" size={148} className="mx-auto" />
      <p className="mt-5 text-xl leading-snug font-bold text-plum sm:text-2xl">{COPY.emptyWall}</p>
      <a href="#write" className="btn btn-primary mt-6 text-[1.05rem]">
        {COPY.heroCtaWrite}
      </a>
    </div>
  );
}

/** A search with no letters becomes an invitation to write one. */
function Invitation({ q, onWrite }: { q: string; onWrite: (toName: string) => void }) {
  const name = cleanQueryName(q);
  return (
    <div className={`${styles.invite} mx-auto max-w-3xl px-5 pt-8 pb-9 text-center sm:px-12 sm:pt-10 sm:pb-12`}>
      <Icon3D name="envelope" size={132} className="mx-auto" />
      <h3 className="mt-4 text-h3 leading-tight font-bold text-plum sm:text-[2.4rem]">
        {COPY.emptySearchTitle}
      </h3>
      <p className="mx-auto mt-3 max-w-md text-lg leading-relaxed font-bold text-ink sm:text-[1.3rem]">
        {COPY.emptySearch}
      </p>
      <p className="mx-auto mt-1 max-w-md text-[0.95rem] text-ink-soft [overflow-wrap:anywhere]">
        ما لقينا رسائل لـ «{q}» للحين.
      </p>
      <div className="mx-auto mt-7 flex max-w-lg flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => onWrite("")}
          className="btn btn-primary text-[1.05rem]"
        >
          {COPY.emptySearchCta}
        </button>
        {name && (
          <button
            type="button"
            onClick={() => onWrite(name)}
            className="btn btn-ghost text-[1.05rem] whitespace-normal [overflow-wrap:anywhere]"
          >
            {COPY.emptySearchCtaTo(name)}
          </button>
        )}
      </div>
      <div className="mt-6 flex justify-center">
        <ShareSearch q={q} count={0} />
      </div>
    </div>
  );
}
