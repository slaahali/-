"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { COPY } from "@/lib/config";
import {
  letterPayload,
  shareCopy,
  shareNative,
  trackShare,
  whatsappUrl,
  xUrl,
  type ShareTarget,
} from "@/lib/share/links";
import { prepareStoryCard, shareOrDownloadStoryCard } from "@/lib/share/storyCard";
import type { PublicMessage } from "@/lib/types";
import { LinkIcon, ShareIcon, SpinnerIcon, StoryIcon, SystemShareIcon, WhatsAppIcon, XLogoIcon } from "./icons";
import {
  MENU_ICON,
  MENU_ITEM,
  PILL,
  SharePopover,
  ShareToast,
  useCanNativeShare,
  useFlash,
} from "./SharePopover";

const T = {
  menuLabel: "مشاركة الرسالة",
  nativeItem: "مشاركة عبر…",
  whatsapp: "واتساب",
  x: "X",
  copy: "نسخ الرابط",
  copied: "تم النسخ ✓",
  copiedLive: "تم نسخ الرابط ✓",
  copyPrompt: "انسخ الرابط:",
  story: "صورة للستوري",
  storyBusy: "جاري التجهيز…",
  storySaved: "نزّلنا الصورة ✓ شاركها في الستوري",
  storyFailed: "ما قدرنا نجهّز الصورة، حاول مرة ثانية 🙏",
  nativeFailed: "ما انفتحت المشاركة، جرّب نسخ الرابط",
  newTab: " (تفتح في نافذة جديدة)",
};

const WHATSAPP_GREEN = "text-[#1c9e50]";

/** Shared behaviour for both layouts: copy, native share, story image + their feedback. */
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

  const warmStory = useCallback(() => prepareStoryCard(message), [message]);

  return { payload, target, copied, note, busy, copy, native, story, warmStory };
}

export function ShareMenu({
  message,
  mode = "full",
  className = "",
}: {
  message: PublicMessage;
  /** "full": row of labelled buttons (success panel, letter view). "compact": one icon button that opens a popover/bottom sheet (cards). */
  mode?: "full" | "compact";
  className?: string;
}) {
  return mode === "compact" ? (
    <CompactShare message={message} className={className} />
  ) : (
    <FullShare message={message} className={className} />
  );
}

function FullShare({ message, className }: { message: PublicMessage; className: string }) {
  const s = useLetterShare(message);
  const canNative = useCanNativeShare();

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {canNative && (
        <button type="button" className={PILL} onClick={s.native}>
          <SystemShareIcon size={18} />
          {COPY.share}
        </button>
      )}
      <LinkPill href={whatsappUrl(s.payload)} onClick={() => trackShare(s.target, "whatsapp")}>
        <WhatsAppIcon size={19} className={WHATSAPP_GREEN} />
        {T.whatsapp}
      </LinkPill>
      <LinkPill href={xUrl(s.payload)} onClick={() => trackShare(s.target, "x")}>
        <XLogoIcon size={16} className="text-ink" />
        {T.x}
      </LinkPill>
      <button type="button" className={PILL} onClick={s.copy}>
        <LinkIcon size={18} />
        {s.copied ?? T.copy}
      </button>
      <button
        type="button"
        className={PILL}
        onClick={s.story}
        onPointerEnter={s.warmStory}
        onFocus={s.warmStory}
        disabled={s.busy}
        aria-busy={s.busy}
      >
        {s.busy ? <SpinnerIcon size={18} /> : <StoryIcon size={18} />}
        {s.busy ? T.storyBusy : T.story}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {s.note ?? ""}
      </span>
      {s.note && s.note !== T.copiedLive && (
        <p aria-hidden="true" className="basis-full text-sm font-semibold text-ink-soft">
          {s.note}
        </p>
      )}
    </div>
  );
}

function LinkPill({ href, onClick, children }: { href: string; onClick: () => void; children: ReactNode }) {
  return (
    <a className={PILL} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {children}
      <span className="visually-hidden">{T.newTab}</span>
    </a>
  );
}

function CompactShare({ message, className }: { message: PublicMessage; className: string }) {
  const s = useLetterShare(message);
  const canNative = useCanNativeShare();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(({ restoreFocus }: { restoreFocus: boolean }) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Render the story image in the background once the menu is open, so a tap on
  // "صورة للستوري" can open the share sheet while it still counts as a gesture.
  const { warmStory } = s;
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(warmStory, 350);
    return () => clearTimeout(t);
  }, [open, warmStory]);

  const linkAction = (channel: "whatsapp" | "x") => () => {
    trackShare(s.target, channel);
    // Let the link open before the menu unmounts.
    setTimeout(() => close({ restoreFocus: true }), 0);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-btn ${className}`}
        aria-label={T.menuLabel}
        title={T.menuLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <ShareIcon size={19} />
      </button>
      <span className="visually-hidden" aria-live="polite">
        {s.note ?? ""}
      </span>

      <SharePopover open={open} anchorRef={triggerRef} onClose={close} id={panelId} label={T.menuLabel}>
        {canNative && (
          <button
            type="button"
            data-share-item
            className={MENU_ITEM}
            onClick={() => {
              close({ restoreFocus: true });
              void s.native();
            }}
          >
            <span className={MENU_ICON}>
              <SystemShareIcon size={18} />
            </span>
            {T.nativeItem}
          </button>
        )}
        <MenuLink href={whatsappUrl(s.payload)} onClick={linkAction("whatsapp")}>
          <span className={MENU_ICON}>
            <WhatsAppIcon size={19} className={WHATSAPP_GREEN} />
          </span>
          {T.whatsapp}
        </MenuLink>
        <MenuLink href={xUrl(s.payload)} onClick={linkAction("x")}>
          <span className={MENU_ICON}>
            <XLogoIcon size={16} className="text-ink" />
          </span>
          {T.x}
        </MenuLink>
        <button
          type="button"
          data-share-item
          className={MENU_ITEM}
          onClick={() => {
            close({ restoreFocus: true });
            void s.copy();
          }}
        >
          <span className={MENU_ICON}>
            <LinkIcon size={18} />
          </span>
          {T.copy}
        </button>
        <button
          type="button"
          data-share-item
          className={MENU_ITEM}
          disabled={s.busy}
          aria-busy={s.busy}
          onClick={async () => {
            await s.story();
            close({ restoreFocus: true });
          }}
        >
          <span className={MENU_ICON}>{s.busy ? <SpinnerIcon size={18} /> : <StoryIcon size={18} />}</span>
          {s.busy ? T.storyBusy : T.story}
        </button>
      </SharePopover>

      <ShareToast message={s.note} />
    </>
  );
}

function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: ReactNode }) {
  return (
    <a data-share-item className={MENU_ITEM} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {children}
      <span className="visually-hidden">{T.newTab}</span>
    </a>
  );
}
