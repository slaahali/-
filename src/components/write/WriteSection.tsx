import type { CSSProperties } from "react";
import { Icon3D } from "@/components/ui/Icon3D";
import { COPY } from "@/lib/config";
import { MessageForm } from "./MessageForm";

export function WriteSection() {
  return (
    <section
      id="write"
      aria-labelledby="write-title"
      className="relative isolate py-16 sm:py-20 lg:py-28"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-canvas via-cream to-canvas"
      />

      <div className="container-page grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28">
          <span className="eyebrow">اكتب رسالتك ✍️</span>
          <h2
            id="write-title"
            className="mt-4 text-[length:clamp(1.9rem,1.35rem+2.1vw,2.75rem)] leading-tight font-bold text-balance text-plum"
          >
            {COPY.writeTitle}
          </h2>
          <p className="mt-4 max-w-xl text-[1.05rem] leading-8 text-ink-soft">{COPY.writeLead}</p>

          <div className="mt-6 flex max-w-xl items-center gap-4 rounded-card border border-orange-100 bg-white/75 p-4 shadow-soft">
            <Icon3D name="gift" size={64} className="shrink-0" />
            <p className="leading-7 font-semibold text-plum">{COPY.writeGiftLead}</p>
          </div>

          <div aria-hidden className="relative mt-10 hidden h-40 lg:block">
            <div
              className="absolute start-6 top-0 animate-float"
              style={{ "--r": "-8deg" } as CSSProperties}
            >
              <Icon3D name="pencil" size={112} />
            </div>
            <div
              className="absolute start-40 top-10 animate-float"
              style={{ "--r": "6deg", animationDelay: "-3s" } as CSSProperties}
            >
              <Icon3D name="letter" size={96} />
            </div>
          </div>
        </div>

        <MessageForm />
      </div>
    </section>
  );
}
