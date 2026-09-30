"use client";

import { Icon3D } from "@/components/ui/Icon3D";
import { BRAND_URL, COPY, HASHTAG } from "@/lib/config";
import { ChefzLogo } from "./ChefzLogo";
import { GiftLink } from "./GiftLink";

export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-plum-100 bg-plum-50">
      <div className="container-page grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-12 md:py-14">
        <div className="max-w-xl">
          <a
            href={BRAND_URL}
            target="_blank"
            rel="noopener"
            className="-mx-1.5 inline-flex min-h-11 items-center rounded-xl px-1.5"
          >
            <ChefzLogo height={28} />
            <span className="visually-hidden"> (تفتح في صفحة جديدة)</span>
          </a>
          <p className="mt-3 text-lg font-bold text-plum">{COPY.footerCampaign}</p>
          <p className="mt-2 text-[0.95rem] leading-7 text-ink-soft">{COPY.footerNote}</p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="text-[1.05rem] font-bold text-plum" dir="auto">
            {HASHTAG}
          </p>
          <GiftLink
            from="footer"
            className="group -ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-bold text-orange-700 transition-colors hover:bg-white md:ms-0 md:-me-2"
          >
            <Icon3D name="gift" size={32} className="-my-1" />
            {COPY.giftLink}
          </GiftLink>
        </div>
      </div>

      {/* Bottom padding keeps the fixed sound button (bottom-end) off the last line. */}
      <div className="border-t border-plum-100">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+4rem))] text-sm text-ink-mute xl:pb-5">
          <span>© {COPY.brand}</span>
          <span>{COPY.footerMadeWith}</span>
        </div>
      </div>
    </footer>
  );
}
