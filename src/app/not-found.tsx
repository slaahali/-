import Link from "next/link";
import type { CSSProperties } from "react";
import { ChefzLogo } from "@/components/layout/ChefzLogo";
import { Footer } from "@/components/layout/Footer";
import { Icon3D } from "@/components/ui/Icon3D";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Link href="/" aria-label="ذا شفز — الصفحة الرئيسية" className="-m-1.5 rounded-xl p-1.5">
          <ChefzLogo height={25} priority />
        </Link>
      </header>

      <main
        className="relative isolate flex flex-1 items-center justify-center px-4 py-16"
        style={{
          background:
            "radial-gradient(50% 45% at 50% 38%, rgb(253 230 219 / 0.7), transparent 75%), radial-gradient(40% 40% at 15% 90%, rgb(244 230 238 / 0.8), transparent 75%)",
        }}
      >
        <div className="paper-plain flex w-full max-w-md animate-fade-up flex-col items-center px-6 py-10 text-center sm:px-10">
          <div className="animate-float" style={{ "--r": "-6deg" } as CSSProperties}>
            <Icon3D name="letter" size={128} priority />
          </div>
          <p className="mt-2 text-sm font-bold tracking-wide text-orange-700">404</p>
          <h1 className="mt-2 text-2xl leading-snug font-bold text-balance text-plum sm:text-[1.75rem]">
            الرسالة هذي مو موجودة…
          </h1>
          <p className="mt-3 leading-7 text-balance text-ink-soft">
            يمكن انحذفت أو لسا تحت المراجعة. تقدر تتصفح باقي الرسائل أو تكتب رسالتك لمعلمك 💜
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/" className="btn btn-primary">
              رجوع للرئيسية
            </Link>
            <Link href="/#write" className="btn btn-ghost">
              اكتب رسالتك ✍️
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
