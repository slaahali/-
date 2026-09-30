import { Icon3D } from "@/components/ui/Icon3D";
import { COPY } from "@/lib/config";
import { MessageForm } from "./MessageForm";

export function WriteSection() {
  return (
    <section
      id="write"
      aria-labelledby="write-title"
      className="relative isolate py-14 sm:py-20 lg:py-28"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-canvas via-cream to-canvas"
      />

      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-start gap-9 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <header className="max-w-xl lg:sticky lg:top-28">
          <p className="eyebrow">{COPY.writeEyebrow}</p>
          <h2
            id="write-title"
            className="mt-3 text-[length:clamp(2rem,1.4rem+2.2vw,2.9rem)] leading-[1.25] font-bold text-balance text-plum"
          >
            {COPY.writeTitle}
          </h2>
          <p className="mt-4 text-[1.05rem] leading-8 text-ink-soft">{COPY.writeLead}</p>

          <p className="mt-6 flex items-center gap-3 border-t border-dashed border-line-strong pt-5 leading-7 font-bold text-plum">
            <Icon3D name="gift" size={52} className="-my-1 shrink-0" />
            <span>{COPY.writeGiftLead}</span>
          </p>
        </header>

        <MessageForm />
      </div>
    </section>
  );
}
