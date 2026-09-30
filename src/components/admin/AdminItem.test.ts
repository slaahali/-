import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminFilter } from "@/lib/types";
import type { AdminMessage } from "./admin-api";
import { ADMIN_FILTERS } from "./admin-model";
import { AdminDashboard } from "./AdminDashboard";
import { AdminItem, type AdminItemProps } from "./AdminItem";

const CONTACT = "0551234567";

const letter: AdminMessage = {
  id: "abc123",
  title: "ustadha",
  toName: "نورة <b>",
  school: "ثانوية الملك فهد",
  body: 'شكراً <script>alert("x")</script>\nسطر ثاني',
  fromName: null,
  likes: 4,
  createdAt: "2026-09-29T10:00:00.000Z",
  variant: 1,
  inMemory: false,
  status: "pending",
  reports: 2,
  removalRequested: true,
  reviewReason: "suspicious: profanity",
  starred: true,
  surpriseOptIn: true,
  contact: CONTACT,
  moderation: { layer: "wordlist", flagged: false, suspicious: true, reason: "profanity" },
};

const noop = () => {};

function render(filter: AdminFilter, over: Partial<AdminMessage> = {}): string {
  const props: AdminItemProps = {
    m: { ...letter, ...over },
    filter,
    now: Date.parse("2026-09-30T10:00:00.000Z"),
    selected: false,
    active: false,
    busy: false,
    rowRef: noop,
    onSelect: noop,
    onActivate: noop,
    onStatus: noop,
    onStar: noop,
    onDelete: noop,
    onCopy: noop,
  };
  return renderToStaticMarkup(createElement(AdminItem, props));
}

describe("AdminItem", () => {
  it("shows the private contact only in the starred / surprise tabs", () => {
    for (const f of ADMIN_FILTERS) {
      const html = render(f);
      const shouldShow = f === "starred" || f === "surprise";
      expect(html.includes(CONTACT), f).toBe(shouldShow);
      expect(html.includes("وافق على التواصل"), f).toBe(shouldShow);
    }
  });

  it("escapes user text", () => {
    const html = render("pending");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("نورة <b>");
  });

  it("shows moderation context and the right actions per status", () => {
    const pending = render("pending");
    expect(pending).toContain("طلب حذف من الشخص المذكور");
    expect(pending).toContain("اشتباه من الفلتر: ألفاظ غير لائقة");
    expect(pending).toContain("اعتماد ونشر");
    expect(pending).toContain("إخفاء");
    expect(pending).not.toContain("إرجاع للمراجعة");
    expect(pending).not.toContain('href="/m/');
    expect(pending).toContain('aria-keyshortcuts="A"');

    const published = render("published", { status: "published" });
    expect(published).toContain('href="/m/abc123"');
    expect(published).toContain('target="_blank"');
    expect(published).toContain("إرجاع للمراجعة");
    expect(published).not.toContain("اعتماد ونشر");
    expect(published).not.toContain("aria-keyshortcuts");
  });

  it("marks in-memory letters", () => {
    expect(render("all", { inMemory: true })).toContain("في ذكرى 🕊️");
    expect(render("all", { inMemory: true })).toContain("إلى روح");
  });
});

describe("AdminDashboard", () => {
  it("server-renders only a loading shell (no gate, no token field)", () => {
    const html = renderToStaticMarkup(createElement(AdminDashboard));
    expect(html).toContain("جاري التحميل");
    expect(html).not.toContain("<input");
  });
});
