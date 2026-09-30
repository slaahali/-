import Link from "next/link";
import { ChefzLogo } from "@/components/layout/ChefzLogo";
import { Footer } from "@/components/layout/Footer";
import { Icon3D } from "@/components/ui/Icon3D";
import { COPY } from "@/lib/config";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Link
          href="/"
          aria-label="ذا شفز — الصفحة الرئيسية"
          className="-mx-1.5 inline-flex min-h-11 items-center rounded-xl px-1.5"
        >
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
        <div className="paper flex w-full max-w-md animate-fade-up flex-col items-start px-6 pt-8 pb-9 sm:px-10">
          <Icon3D name="letter" size={96} priority className="-ms-2 -rotate-6" />
          <p className="eyebrow mt-4">404</p>
          <h1 className="mt-2 text-[1.75rem] leading-snug font-bold text-balance text-plum">
            الرسالة هذي مو موجودة…
          </h1>
          <p className="mt-3 leading-8 text-ink-soft">
            يمكن انحذفت أو لسا تحت المراجعة. تقدر تتصفح باقي الرسائل أو تكتب رسالتك لمعلمك 💜
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
            <Link href="/#write" className="btn btn-primary">
              {COPY.heroCtaWrite}
            </Link>
            <Link href="/" className="btn btn-ghost">
              رجوع للرئيسية
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
