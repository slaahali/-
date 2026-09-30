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
            className="-m-1.5 inline-block rounded-xl p-1.5"
          >
            <ChefzLogo height={28} />
            <span className="visually-hidden"> (تفتح في صفحة جديدة)</span>
          </a>
          <p className="mt-4 text-lg font-bold text-plum">{COPY.footerCampaign} 💜</p>
          <p className="mt-2 text-[0.95rem] leading-7 text-ink-soft">{COPY.footerNote}</p>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <span className="inline-flex min-h-10 items-center rounded-full border border-plum-200 bg-white px-4 text-[0.95rem] font-bold text-plum">
            {HASHTAG}
          </span>
          <GiftLink
            from="footer"
            className="group inline-flex min-h-11 items-center gap-2 rounded-full bg-white ps-1.5 pe-4 font-bold text-orange-700 shadow-soft transition-transform duration-200 hover:-translate-y-px"
          >
            <span className="grid size-8 place-items-center rounded-full bg-orange-50">
              <Icon3D name="gift" size={28} />
            </span>
            {COPY.giftLink}
          </GiftLink>
        </div>
      </div>

      <div className="border-t border-plum-100">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-5 text-sm text-ink-mute">
          <span>© {COPY.brand}</span>
          <span>صُنع بحب لكل معلم 💜</span>
        </div>
      </div>
    </footer>
  );
}
