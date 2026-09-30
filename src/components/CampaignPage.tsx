"use client";

import { useEffect, useMemo } from "react";
import { LettersProvider } from "@/components/LettersProvider";
import { Hero } from "@/components/hero/Hero";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { LetterModal } from "@/components/letter/LetterModal";
import { WallSection } from "@/components/wall/WallSection";
import { WriteSection } from "@/components/write/WriteSection";
import type { ListResult, PublicMessage } from "@/lib/types";

export interface CampaignPageProps {
  /** Wall's first page (already filtered when initialQuery is set). */
  initial: ListResult;
  /** From /?q= (shareable search). */
  initialQuery?: string;
  /** Newest unfiltered letters for the 3D scene. */
  heroLetters: PublicMessage[];
  initialOpen?: PublicMessage | null;
  /**
   * Count of ALL published letters for the hero counter. When the wall is a
   * search result, `initial.total` only counts matches, so pages pass the
   * unfiltered total here. Falls back to the best estimate we have.
   */
  total?: number;
}

function uniqueById(...lists: PublicMessage[][]): PublicMessage[] {
  const seen = new Map<string, PublicMessage>();
  for (const list of lists) for (const m of list) if (!seen.has(m.id)) seen.set(m.id, m);
  return [...seen.values()];
}

export function CampaignPage({
  initial,
  initialQuery,
  heroLetters,
  initialOpen = null,
  total,
}: CampaignPageProps) {
  const initialTotal =
    total ?? (initialQuery ? Math.max(heroLetters.length, initial.total) : initial.total);

  // The provider only reads this once (to seed its cache), so a stable memo is enough.
  const seed = useMemo(() => uniqueById(heroLetters, initial.items), [heroLetters, initial.items]);

  // Shared search links land on the results (the #letters hash may be missing
  // when the link was re-typed or stripped by an app).
  useEffect(() => {
    if (!initialQuery) return;
    const raf = requestAnimationFrame(() => {
      document.getElementById("letters")?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [initialQuery]);

  return (
    <LettersProvider initialTotal={initialTotal} initialMessages={seed} initialOpen={initialOpen}>
      <a
        href="#write"
        className="fixed start-3 top-3 z-[60] -translate-y-24 rounded-full bg-plum px-4 py-2 font-bold text-white shadow-lift transition-transform focus:translate-y-0"
      >
        انتقل إلى كتابة رسالتك
      </a>
      <Header />
      <main id="main">
        <Hero letters={heroLetters} />
        <WriteSection />
        <WallSection initial={initial} initialQuery={initialQuery} />
      </main>
      <Footer />
      <LetterModal />
    </LettersProvider>
  );
}
