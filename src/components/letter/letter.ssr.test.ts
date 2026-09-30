// Server render of the letter view (a /m/:id permalink): content, wording and safety.
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LettersProvider } from "@/components/LettersProvider";
import type { PublicMessage } from "@/lib/types";
import { LetterModal } from "./LetterModal";

vi.mock("@/components/share/ShareMenu", () => ({ ShareMenu: () => null }));

const letter: PublicMessage = {
  id: "abc123",
  title: "ustadha",
  toName: "نورة القحطاني",
  school: "ثانوية الملك فهد",
  body: "شكراً لأنك آمنت فيني يوم ما أحد آمن\nللحين أتذكر عبارتك",
  fromName: "سارة",
  likes: 12,
  createdAt: "2026-09-29T08:00:00.000Z",
  variant: 1,
  inMemory: false,
};
const memory: PublicMessage = { ...letter, id: "mem456", title: "dr_m", toName: "سعد", inMemory: true, fromName: null };

function render(open: PublicMessage | null): string {
  return renderToString(
    h(LettersProvider, {
      initialTotal: 1,
      initialMessages: open ? [open] : [],
      initialOpen: open,
      children: h(LetterModal),
    }),
  ).replace(/<!-- -->/g, "");
}

describe("letter view SSR", () => {
  it("renders nothing while no letter is open", () => {
    expect(render(null)).not.toContain('role="dialog"');
  });

  it("addresses the letter like stationery", () => {
    const html = render(letter);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/<h2[^>]*id="[^"]+"[^>]*><span[^>]*>إلى<\/span> <span[^>]*>أستاذة نورة القحطاني<\/span><\/h2>/);
    expect(html).toContain("ثانوية الملك فهد");
    expect(html).toContain("شكراً لأنك آمنت فيني");
    expect(html).toContain("— سارة");
    expect(html).toContain("شكراً معلمي");
    // postage stamp + postmark
    expect(html).toContain("يوم المعلم");
    expect(html).toContain("٥ أكتوبر");
    expect(html).toContain("٢٠٢٦");
    // actions
    expect(html).toContain("أرسل لها ");
    expect(html).toContain("إبلاغ / طلب حذف");
    expect(html).not.toContain("رسالة إلى");
  });

  it("keeps memory letters calm: «إلى روح», memory stamp, no gift", () => {
    const html = render(memory);
    expect(html).toContain("إلى روح");
    expect(html).toContain("الدكتور سعد");
    expect(html).toContain("في ذكراك 🤍");
    expect(html).toContain("دعوة بالرحمة");
    expect(html).toContain("— أحد طلابك");
    expect(html).not.toContain("هدية");
  });

  it("escapes user text and never shows private fields", () => {
    const evil = {
      ...letter,
      body: "<script>alert(1)</script>",
      toName: "<b>x</b>",
      contact: "0551234567",
    } as PublicMessage;
    const html = render(evil);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("0551234567");
  });

  it("sets long laughter runs in the book face, not the handwriting", () => {
    const html = render({ ...letter, fromName: "ههههههههه" });
    const sign = html.match(/<p class="([^"]*)">— ههههههههه<\/p>/);
    expect(sign).not.toBeNull();
    expect(sign?.[1]).not.toContain("font-hand");
    expect(render(letter)).toMatch(/<p class="font-hand [^"]*">— سارة<\/p>/);
  });
});
