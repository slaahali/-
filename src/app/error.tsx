"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChefzLogo } from "@/components/layout/ChefzLogo";
import { Icon3D } from "@/components/ui/Icon3D";

// Shown when a page fails to render, e.g. /m/:id during a short database blip
// (data.ts throws instead of pretending the letter doesn't exist).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Link href="/" aria-label="ذا شفز — الصفحة الرئيسية" className="-mx-1.5 inline-flex min-h-11 items-center rounded-xl px-1.5">
          <ChefzLogo height={28} priority />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="paper flex w-full max-w-md flex-col items-start px-6 pt-8 pb-9 sm:px-10">
          <Icon3D name="plane" size={96} priority className="-ms-2 rotate-6" />
          <h1 className="mt-4 text-[1.75rem] leading-snug font-bold text-balance text-plum">
            الرسائل اتأخرت شوي…
          </h1>
          <p className="mt-3 leading-8 text-ink-soft">صار عندنا ضغط بسيط. جرّب مرة ثانية بعد لحظات.</p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="btn btn-primary">
              حاول مرة ثانية
            </button>
            <Link href="/" className="btn btn-ghost">
              الصفحة الرئيسية
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
