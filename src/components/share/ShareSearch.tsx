"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { COPY } from "@/lib/config";
import { searchPayload, shareCopy, shareNative, trackShare, whatsappUrl, xUrl, type ShareTarget } from "@/lib/share/links";
import { LinkIcon, ShareIcon, WhatsAppIcon, XLogoIcon } from "./icons";
import { MENU_ICON, MENU_ITEM, PILL, SharePopover, ShareToast, useCanNativeShare, useFlash } from "./SharePopover";

const T = {
  whatsapp: "واتساب",
  x: "X",
  copy: "نسخ الرابط",
  copied: "تم نسخ الرابط ✓",
  copyPrompt: "انسخ الرابط:",
  newTab: " (تفتح في نافذة جديدة)",
};

/**
 * «شارك النتيجة»: shares the search permalink (/?q=…#letters), which renders the
 * same results server-side with its own preview image. Uses the OS share sheet
 * when available, otherwise a popover / bottom sheet.
 */
export function ShareSearch({ q, count, className = "" }: { q: string; count: number; className?: string }) {
  const payload = useMemo(() => searchPayload(q, count), [q, count]);
  const target = useMemo<ShareTarget>(() => ({ kind: "search", q: q.trim() }), [q]);
  const canNative = useCanNativeShare();
  const [open, setOpen] = useState(false);
  const [note, flash] = useFlash(2400);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(({ restoreFocus }: { restoreFocus: boolean }) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const onTrigger = async () => {
    if (open) return close({ restoreFocus: false });
    // Web Share first; fall back to our own menu when it isn't there or fails.
    if (canNative && (await shareNative(target, payload)) !== "failed") return;
    setOpen(true);
  };

  const linkAction = (channel: "whatsapp" | "x") => () => {
    trackShare(target, channel);
    setTimeout(() => close({ restoreFocus: true }), 0);
  };

  const copy = async () => {
    close({ restoreFocus: true });
    if (await shareCopy(target, payload)) flash(T.copied);
    else window.prompt(T.copyPrompt, payload.url);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${PILL} ${className}`}
        aria-haspopup={canNative ? undefined : "dialog"}
        aria-expanded={canNative && !open ? undefined : open}
        aria-controls={open ? panelId : undefined}
        onClick={onTrigger}
      >
        <ShareIcon size={18} />
        {COPY.shareSearch}
      </button>
      <span className="visually-hidden" aria-live="polite">
        {note ?? ""}
      </span>

      <SharePopover open={open} anchorRef={triggerRef} onClose={close} id={panelId} label={COPY.shareSearch}>
        <a
          data-share-item
          className={MENU_ITEM}
          href={whatsappUrl(payload)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={linkAction("whatsapp")}
        >
          <span className={MENU_ICON}>
            <WhatsAppIcon size={19} className="text-[#1c9e50]" />
          </span>
          {T.whatsapp}
          <span className="visually-hidden">{T.newTab}</span>
        </a>
        <a
          data-share-item
          className={MENU_ITEM}
          href={xUrl(payload)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={linkAction("x")}
        >
          <span className={MENU_ICON}>
            <XLogoIcon size={16} className="text-ink" />
          </span>
          {T.x}
          <span className="visually-hidden">{T.newTab}</span>
        </a>
        <button type="button" data-share-item className={MENU_ITEM} onClick={copy}>
          <span className={MENU_ICON}>
            <LinkIcon size={18} />
          </span>
          {T.copy}
        </button>
      </SharePopover>

      <ShareToast message={note} />
    </>
  );
}
