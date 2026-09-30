"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon3D } from "@/components/ui/Icon3D";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { COPY } from "@/lib/config";
import { ChefzLogo } from "./ChefzLogo";
import { GiftLink } from "./GiftLink";

const NAV = [
  { href: "#write", label: COPY.heroCtaWrite },
  { href: "#letters", label: "ابحث عن اسمك" },
] as const;

const GIFT_LABEL = "هدية لمعلمك";

/** Fixed top bar: see-through over the hero, a frosted cream bar once the page scrolls. */
export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-line/80 bg-canvas/85 shadow-[0_10px_30px_-22px_rgb(105_29_78/0.45)] backdrop-blur-md backdrop-saturate-150"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="container-page flex h-14 items-center gap-3 sm:h-16">
        <Link
          href="/"
          aria-label="ذا شفز — الصفحة الرئيسية"
          className="-mx-1.5 inline-flex min-h-11 shrink-0 items-center rounded-xl px-1.5"
        >
          <ChefzLogo fluid priority height={30} className="h-6 sm:h-[30px]" />
        </Link>

        <nav aria-label="أقسام الصفحة" className="ms-6 hidden items-center gap-1 md:flex lg:ms-10">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-[0.95rem] font-semibold text-plum/85 transition-colors hover:bg-plum-50 hover:text-plum"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <GiftLink
            from="header"
            className="hidden min-h-11 items-center gap-1.5 rounded-xl px-3 text-[0.95rem] font-bold text-orange-700 transition-colors hover:bg-orange-50 md:inline-flex"
          >
            <Icon3D name="gift" size={32} priority className="-my-1" />
            {GIFT_LABEL}
          </GiftLink>

          <a
            href="#write"
            className="btn btn-primary min-h-11 rounded-xl px-4 py-2 text-ui shadow-[0_6px_14px_-10px_rgb(235_101_44/0.8)] md:hidden"
          >
            {COPY.heroCtaWrite}
          </a>
          {/* Below 360px the bar can't hold all four; the gift is on the form and every letter. */}
          <GiftLink
            from="header"
            label={GIFT_LABEL}
            className="icon-btn shadow-soft max-[359px]:hidden md:hidden"
          >
            <Icon3D name="gift" size={28} priority />
          </GiftLink>
          {/* Phones: the sound switch lives up here, where it covers nothing (from md it's fixed at the bottom-end). */}
          <SoundToggle className="shadow-soft md:hidden" />
        </div>
      </div>
    </header>
  );
}
