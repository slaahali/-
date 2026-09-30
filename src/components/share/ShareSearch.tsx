"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { COPY } from "@/lib/config";
import { searchPayload, shareCopy, shareNative, trackShare, whatsappUrl, xUrl, type ShareTarget } from "@/lib/share/links";
import { LinkIcon, ShareIcon, WhatsAppIcon, XLogoIcon } from "./icons";
import { PILL, SHARE_ITEM, SharePopover, ShareToast, TILE, TILE_ICON, useCanNativeShare, useFlash } from "./SharePopover";

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

  const item = { [SHARE_ITEM]: "" };
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

      <SharePopover open={open} anchorRef={triggerRef} onClose={close} id={panelId} label={COPY.shareSearch} subtitle={q.trim()}>
        <div className="flex items-start gap-1">
          <a
            {...item}
            className={TILE}
            href={whatsappUrl(payload)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={linkAction("whatsapp")}
          >
            <span className={`${TILE_ICON} bg-[#e4f5ea] text-[#1c9e50]`}>
              <WhatsAppIcon size={22} />
            </span>
            {T.whatsapp}
            <span className="visually-hidden">{T.newTab}</span>
          </a>
          <a {...item} className={TILE} href={xUrl(payload)} target="_blank" rel="noopener noreferrer" onClick={linkAction("x")}>
            <span className={`${TILE_ICON} bg-[#efe9ed] text-ink`}>
              <XLogoIcon size={18} />
            </span>
            {T.x}
            <span className="visually-hidden">{T.newTab}</span>
          </a>
          <button type="button" {...item} className={TILE} onClick={copy}>
            <span className={`${TILE_ICON} bg-plum-50 text-plum`}>
              <LinkIcon size={20} />
            </span>
            {T.copy}
          </button>
        </div>
      </SharePopover>

      <ShareToast message={note} />
    </>
  );
}
