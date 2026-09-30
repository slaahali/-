import { Icon3D } from "@/components/ui/Icon3D";
import { COPY } from "@/lib/config";
import { MessageForm } from "./MessageForm";

export function WriteSection() {
  return (
    <section
      id="write"
      aria-labelledby="write-title"
      className="relative isolate pt-8 pb-12 sm:py-20 lg:py-28"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-canvas via-cream to-canvas"
      />

      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-start gap-6 sm:gap-9 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <header className="max-w-xl lg:sticky lg:top-28">
          <p className="eyebrow">{COPY.writeEyebrow}</p>
          <h2
            id="write-title"
            className="mt-3 text-[length:clamp(2rem,1.4rem+2.2vw,2.9rem)] leading-[1.25] font-bold text-balance text-plum"
          >
            {COPY.writeTitle}
          </h2>
          <p className="mt-3 text-body leading-7 text-ink-soft max-sm:text-pretty sm:mt-4 sm:text-[1.05rem] sm:leading-8">
            {COPY.writeLead}
          </p>

          <p className="mt-5 flex items-center gap-3 border-t border-dashed border-line-strong pt-4 text-ui leading-[1.65rem] font-bold text-plum sm:mt-6 sm:pt-5 sm:text-base sm:leading-7">
            <Icon3D name="gift" size={52} className="-my-1 size-10! shrink-0 sm:size-[52px]!" />
            <span>{COPY.writeGiftLead}</span>
          </p>
        </header>

        <MessageForm />
      </div>
    </section>
  );
}
