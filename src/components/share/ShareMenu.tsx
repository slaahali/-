"use client";

import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cardStyle } from "@/lib/assets";
import { toLine } from "@/lib/format";
import { envelopeColors } from "@/lib/og/art";
import {
  letterPayload,
  shareCopy,
  shareNative,
  trackShare,
  whatsappUrl,
  xUrl,
  type ShareTarget,
} from "@/lib/share/links";
import { shareOrDownloadStoryCard, storyCardBlob } from "@/lib/share/storyCard";
import type { PublicMessage } from "@/lib/types";
import { LinkIcon, ShareIcon, SpinnerIcon, StoryIcon, SystemShareIcon, WhatsAppIcon, XLogoIcon } from "./icons";
import { SHARE_ITEM, SharePopover, ShareToast, TILE, TILE_ICON, useCanNativeShare, useFlash } from "./SharePopover";

const T = {
  /** Trigger name: contains «مشاركة» so a visible "مشاركة" label stays part of it. */
  trigger: "مشاركة الرسالة",
  menuLabel: "شارك الرسالة",
  native: "المزيد",
  whatsapp: "واتساب",
  x: "X",
  copy: "نسخ الرابط",
  copied: "تم النسخ ✓",
  copiedLive: "تم نسخ الرابط ✓",
  copyPrompt: "انسخ الرابط:",
  story: "صورة للستوري",
  storySub: "جاهزة لإنستقرام وسناب",
  storyBusy: "نجهّز الصورة…",
  storySaved: "نزّلنا الصورة ✓ شاركها في الستوري",
  storyFailed: "ما قدرنا نجهّز الصورة، حاول مرة ثانية 🙏",
  nativeFailed: "ما انفتحت المشاركة، جرّب نسخ الرابط",
  newTab: " (تفتح في نافذة جديدة)",
};

/** Shared behaviour for every layout: copy, native share, story image + their feedback. */
function useLetterShare(message: PublicMessage) {
  const payload = useMemo(() => letterPayload(message), [message]);
  const target = useMemo<ShareTarget>(() => ({ kind: "letter", id: message.id }), [message.id]);
  const [copied, flashCopied] = useFlash(2000);
  const [note, flashNote] = useFlash(2800);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const copy = useCallback(async () => {
    if (await shareCopy(target, payload)) {
      flashCopied(T.copied);
      flashNote(T.copiedLive);
    } else {
      // Last resort (very old browsers): let the visitor copy it by hand.
      window.prompt(T.copyPrompt, payload.url);
    }
  }, [target, payload, flashCopied, flashNote]);

  const native = useCallback(async () => {
    if ((await shareNative(target, payload)) === "failed") flashNote(T.nativeFailed);
  }, [target, payload, flashNote]);

  const story = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await shareOrDownloadStoryCard(message);
      if (result !== "failed") trackShare(target, "story");
      if (result === "downloaded") flashNote(T.storySaved);
      if (result === "failed") flashNote(T.storyFailed);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [message, target, flashNote]);

  return { payload, target, copied, note, busy, copy, native, story };
}

/**
 * Renders the story image in the background once `active` (after `delay` ms,
 * when the browser is idle) and returns an object URL for a thumbnail. Having
 * it ready also lets a tap on «صورة للستوري» open the OS share sheet while the
 * tap still counts as a user gesture.
 */
function useStoryThumb(message: PublicMessage, active: boolean, delay: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const render = useEffectEvent(() => storyCardBlob(message));
  const key = `${message.id}:${message.variant}:${message.inMemory ? 1 : 0}`;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let obj: string | null = null;
    let idle: number | undefined;
    const run = () =>
      render()
        .then((b) => {
          if (!alive) return;
          obj = URL.createObjectURL(b);
          setUrl(obj);
        })
        .catch(() => {});
    const t = setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, delay);
    return () => {
      alive = false;
      clearTimeout(t);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (obj) URL.revokeObjectURL(obj);
      setUrl(null);
    };
  }, [key, active, delay]);
  return url;
}

// --- layout pieces --------------------------------------------------------------

type Share = ReturnType<typeof useLetterShare>;

/** Everything a letter can be shared as: the story image (with a thumbnail) + round target tiles. */
function ShareOptions({
  message,
  s,
  thumb,
  canNative,
  after,
}: {
  message: PublicMessage;
  s: Share;
  thumb: string | null;
  canNative: boolean;
  /** Runs after an action (the sheet closes itself here). */
  after?: { now: () => void; later: () => void };
}) {
  const env = envelopeColors(cardStyle(message));
  const link = (channel: "whatsapp" | "x") => () => {
    trackShare(s.target, channel);
    after?.later();
  };
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        {...{ [SHARE_ITEM]: "" }}
        className="group flex min-h-11 w-full items-center gap-3.5 rounded-[18px] bg-cream p-2 pe-3 text-start transition-colors duration-150 hover:bg-cream-2 focus-visible:bg-cream-2 disabled:cursor-progress"
        onClick={async () => {
          await s.story();
          after?.now();
        }}
        disabled={s.busy}
        aria-busy={s.busy}
      >
        <span
          aria-hidden="true"
          className="relative h-[76px] w-[43px] shrink-0 -rotate-3 overflow-hidden rounded-[5px] shadow-soft ring-1 ring-black/5"
          style={{ backgroundColor: env.base }}
        >
          {thumb ? (
            // A blob: URL of the image we just drew — nothing for next/image to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <span className="absolute inset-x-[5px] top-[9px] bottom-[26px] rounded-[2px] bg-paper/90" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-bold text-plum">{s.busy ? T.storyBusy : T.story}</span>
          <span className="block text-sm leading-snug text-ink-soft">{T.storySub}</span>
        </span>
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-orange-700">
          {s.busy ? <SpinnerIcon size={18} /> : <StoryIcon size={19} />}
        </span>
      </button>

      <div className="flex items-start gap-1">
        <a
          {...{ [SHARE_ITEM]: "" }}
          className={TILE}
          href={whatsappUrl(s.payload)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={link("whatsapp")}
        >
          <span className={`${TILE_ICON} bg-[#e4f5ea] text-[#1c9e50]`}>
            <WhatsAppIcon size={22} />
          </span>
          {T.whatsapp}
          <span className="visually-hidden">{T.newTab}</span>
        </a>
        <a
          {...{ [SHARE_ITEM]: "" }}
          className={TILE}
          href={xUrl(s.payload)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={link("x")}
        >
          <span className={`${TILE_ICON} bg-[#efe9ed] text-ink`}>
            <XLogoIcon size={18} />
          </span>
          {T.x}
          <span className="visually-hidden">{T.newTab}</span>
        </a>
        <button
          type="button"
          {...{ [SHARE_ITEM]: "" }}
          className={TILE}
          onClick={() => {
            after?.now();
            void s.copy();
          }}
        >
          <span className={`${TILE_ICON} bg-plum-50 text-plum`}>
            <LinkIcon size={20} />
          </span>
          {s.copied ?? T.copy}
        </button>
        {canNative && (
          <button
            type="button"
            {...{ [SHARE_ITEM]: "" }}
            className={TILE}
            onClick={() => {
              after?.now();
              void s.native();
            }}
          >
            <span className={`${TILE_ICON} bg-orange-50 text-orange-700`}>
              <SystemShareIcon size={20} />
            </span>
            {T.native}
          </button>
        )}
      </div>
    </div>
  );
}

// --- public components ------------------------------------------------------------

export function ShareMenu({
  message,
  mode = "full",
  className = "",
}: {
  message: PublicMessage;
  /** "full": the options inline (success panel, letter view). "compact": one icon button that opens a popover/bottom sheet (cards). */
  mode?: "full" | "compact";
  className?: string;
}) {
  return mode === "compact" ? (
    <ShareSheetButton message={message} className={`icon-btn ${className}`} />
  ) : (
    <FullShare message={message} className={className} />
  );
}

function FullShare({ message, className }: { message: PublicMessage; className: string }) {
  const s = useLetterShare(message);
  const canNative = useCanNativeShare();
  const thumb = useStoryThumb(message, true, 700);
  return (
    <div className={className}>
      <ShareOptions message={message} s={s} thumb={thumb} canNative={canNative} />
      <span className="visually-hidden" aria-live="polite">
        {s.note ?? ""}
      </span>
      {s.note && s.note !== T.copiedLive && (
        <p aria-hidden="true" className="mt-2 text-sm font-bold text-ink-soft">
          {s.note}
        </p>
      )}
    </div>
  );
}

/**
 * A button that opens the letter's share sheet (bottom sheet on phones, popover
 * from 640px): story image, WhatsApp, X, copy link and the OS share sheet.
 *
 * Use it wherever a "مشاركة" action lives outside ShareMenu, e.g. the letter
 * view's sticky bottom bar:
 *
 *   <ShareSheetButton message={m} className="btn btn-ghost">
 *     <ShareIcon size={18} /> مشاركة
 *   </ShareSheetButton>
 *
 * Without children it renders the share glyph and labels itself «مشاركة الرسالة»
 * (pass `className="icon-btn"` for the round icon button). With icon-only
 * children, pass `ariaLabel`. The sheet sits above the letter view (z-100),
 * traps focus, closes on Esc / backdrop / swipe-down and returns focus here.
 */
export function ShareSheetButton({
  message,
  className = "",
  children,
  ariaLabel,
}: {
  message: PublicMessage;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const s = useLetterShare(message);
  const canNative = useCanNativeShare();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const thumb = useStoryThumb(message, open, 300);

  const close = useCallback(({ restoreFocus }: { restoreFocus: boolean }) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const after = useMemo(
    () => ({
      now: () => close({ restoreFocus: true }),
      // Let a link open before the menu unmounts.
      later: () => setTimeout(() => close({ restoreFocus: true }), 0),
    }),
    [close],
  );

  const label = ariaLabel ?? (children ? undefined : T.trigger);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-label={label}
        title={children ? undefined : T.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {children ?? <ShareIcon size={19} />}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {s.note ?? ""}
      </span>

      <SharePopover open={open} anchorRef={triggerRef} onClose={close} id={panelId} label={T.menuLabel} subtitle={toLine(message)}>
        <ShareOptions message={message} s={s} thumb={thumb} canNative={canNative} after={after} />
      </SharePopover>

      <ShareToast message={s.note} />
    </>
  );
}
