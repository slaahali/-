import { afterEach, describe, expect, it, vi } from "vitest";
import { HASHTAG, permalink, searchLink } from "@/lib/config";
import type { PublicMessage } from "@/lib/types";
import {
  copyToClipboard,
  isAbortError,
  letterPayload,
  nativeShare,
  searchPayload,
  shareUrl,
  snapchatUrl,
  telegramUrl,
  trackShare,
  whatsappUrl,
  xUrl,
} from "./links";

const m: PublicMessage = {
  id: "Ab3_xYz9",
  title: "ustadha",
  toName: "نورة",
  school: null,
  body: "شكراً",
  fromName: null,
  likes: 0,
  createdAt: "2026-10-05T00:00:00.000Z",
  variant: 0,
  inMemory: false,
};

const params = (url: string) => new URL(url).searchParams;

describe("payloads", () => {
  it("letter: permalink + memory-aware text", () => {
    const p = letterPayload(m);
    expect(shareUrl(m)).toBe(permalink(m.id));
    expect(p.url).toBe(permalink(m.id));
    expect(p.text).toContain("أستاذة نورة");
    const mem = letterPayload({ ...m, inMemory: true });
    expect(mem.text).toContain("روح");
    expect(mem.text).not.toBe(p.text);
  });
  it("letter payload never includes private fields", () => {
    const rec = { ...m, contact: "0551234567" } as PublicMessage;
    expect(JSON.stringify(letterPayload(rec))).not.toContain("0551234567");
  });
  it("search: link + count-aware text", () => {
    expect(searchPayload(" نورة ", 3).url).toBe(searchLink("نورة"));
    expect(searchPayload("نورة", 3).text).toContain("نورة");
    expect(searchPayload("نورة", 0).text).not.toBe(searchPayload("نورة", 3).text);
  });
});

describe("intent URLs", () => {
  const p = { title: "t", text: "رسالة شكر 💜 & more", url: "https://example.com/m/abc?x=1" };
  it("WhatsApp carries text + url in one param", () => {
    const u = whatsappUrl(p);
    expect(u.startsWith("https://wa.me/?text=")).toBe(true);
    expect(params(u).get("text")).toBe(`${p.text} ${p.url}`);
  });
  it("X uses intent/post with url and hashtag without #", () => {
    const u = xUrl(p);
    expect(u.startsWith("https://x.com/intent/post?")).toBe(true);
    expect(params(u).get("text")).toBe(p.text);
    expect(params(u).get("url")).toBe(p.url);
    expect(params(u).get("hashtags")).toBe(HASHTAG.replace(/^#/, ""));
  });
  it("Telegram + Snapchat", () => {
    expect(params(telegramUrl(p)).get("url")).toBe(p.url);
    expect(params(telegramUrl(p)).get("text")).toBe(p.text);
    const snap = snapchatUrl(p);
    expect(snap.startsWith("https://www.snapchat.com/scan?")).toBe(true);
    expect(params(snap).get("attachmentUrl")).toBe(p.url);
  });
});

describe("browser helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tracks letter vs search shares", () => {
    const push = vi.fn();
    vi.stubGlobal("window", { dataLayer: { push } });
    trackShare({ kind: "letter", id: "a1" }, "whatsapp");
    trackShare({ kind: "search", q: "نورة" }, "copy");
    expect(push).toHaveBeenNthCalledWith(1, { event: "letter_share", id: "a1", channel: "whatsapp" });
    expect(push).toHaveBeenNthCalledWith(2, { event: "search_share", q: "نورة", channel: "copy" });
  });

  it("nativeShare: AbortError is a cancel, other errors fail", async () => {
    const payload = { title: "t", text: "x", url: "https://e.com" };
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })) });
    expect(await nativeShare(payload)).toBe("cancelled");
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new Error("nope")) });
    expect(await nativeShare(payload)).toBe("failed");
    vi.stubGlobal("navigator", { share: vi.fn().mockResolvedValue(undefined) });
    expect(await nativeShare(payload)).toBe("shared");
    vi.stubGlobal("navigator", {});
    expect(await nativeShare(payload)).toBe("failed");
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("copyToClipboard prefers the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});
