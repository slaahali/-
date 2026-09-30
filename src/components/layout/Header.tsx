"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon3D } from "@/components/ui/Icon3D";
import { ChefzLogo } from "./ChefzLogo";
import { GiftLink } from "./GiftLink";

const NAV = [
  { href: "#write", label: "اكتب رسالتك" },
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
      <div className="container-page flex h-16 items-center gap-3">
        <Link
          href="/"
          aria-label="ذا شفز — الصفحة الرئيسية"
          className="-m-1.5 shrink-0 rounded-xl p-1.5"
        >
          <ChefzLogo fluid priority height={30} className="h-[26px] sm:h-[30px]" />
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
            className="hidden h-11 items-center gap-2 rounded-full border border-orange-100 bg-white/85 ps-1.5 pe-4 text-sm font-bold text-plum shadow-soft transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-orange-300 hover:bg-white md:inline-flex"
          >
            <span className="grid size-8 place-items-center rounded-full bg-orange-50">
              <Icon3D name="gift" size={28} priority />
            </span>
            {GIFT_LABEL}
          </GiftLink>

          <a
            href="#write"
            className="btn btn-primary min-h-11 px-4 py-2 text-sm md:hidden"
          >
            اكتب رسالتك
          </a>
          <GiftLink from="header" label={GIFT_LABEL} className="icon-btn shadow-soft md:hidden">
            <Icon3D name="gift" size={28} priority />
          </GiftLink>
        </div>
      </div>
    </header>
  );
}
