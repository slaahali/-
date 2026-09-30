// Server-render smoke test for the wall + letter view (no DOM needed).
import { Fragment, createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LetterModal } from "@/components/letter/LetterModal";
import { LettersProvider } from "@/components/LettersProvider";
import { WallSection } from "@/components/wall/WallSection";
import type { PublicMessage } from "@/lib/types";

// Share buttons are another module's concern; render them as nothing here.
vi.mock("@/components/share/ShareMenu", () => ({ ShareMenu: () => null }));
vi.mock("@/components/share/ShareSearch", () => ({ ShareSearch: () => null }));

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
const memory: PublicMessage = {
  ...letter,
  id: "mem456",
  title: "dr_m",
  toName: "سعد",
  inMemory: true,
  fromName: null,
};
const long: PublicMessage = { ...letter, id: "long789", body: "سطر طويل ".repeat(80) };

function render(opts: {
  items: PublicMessage[];
  q?: string;
  open?: PublicMessage | null;
  total?: number;
}) {
  const page = h(
    Fragment,
    null,
    h(WallSection, {
      initial: {
        items: opts.items,
        nextCursor: opts.items.length ? "cursor" : null,
        total: opts.total ?? opts.items.length,
      },
      initialQuery: opts.q,
    }),
    h(LetterModal),
  );
  const html = renderToString(
    h(LettersProvider, {
      initialTotal: 42,
      initialMessages: opts.items,
      initialOpen: opts.open ?? null,
      children: page,
    }),
  );
  return html.replace(/<!-- -->/g, "");
}

describe("wall SSR", () => {
  it("renders cards, memory wording and load more", () => {
    const html = render({ items: [letter, memory, long] });
    expect(html).toContain('id="letters"');
    expect(html).toContain("جدار الامتنان");
    expect(html).toContain("أستاذة نورة القحطاني");
    expect(html).toContain("إلى روح");
    expect(html).toContain("في ذكرى 🕊️");
    expect(html).toContain("دعوة بالرحمة");
    expect(html).toContain("عرض المزيد");
    expect(html).not.toContain('role="dialog"');
  });

  it("shows the result count for a shared search", () => {
    const html = render({ items: [letter], q: "نورة", total: 1 });
    expect(html).toContain("1 رسالة لـ «نورة»");
    expect(html).toContain('value="نورة"');
  });

  it("turns an empty search into an invitation without the honorific", () => {
    const html = render({ items: [], q: "الأستاذة منى" });
    expect(html).toContain("ما أحد كتب لك للحين؟");
    expect(html).toContain("اكتب رسالة لـ «منى» ✍️");
    expect(html).toContain("اكتب لأحد علّمك ✍️");
  });

  it("renders the empty wall", () => {
    expect(render({ items: [] })).toContain("كن أول من يكتب");
  });

  it("escapes user text", () => {
    const evil = { ...letter, body: "<script>alert(1)</script>", toName: "<b>x</b>" };
    const html = render({ items: [evil], open: evil });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never renders fields outside PublicMessage", () => {
    const leaky = { ...letter, contact: "0551234567", surpriseOptIn: true } as PublicMessage;
    expect(render({ items: [leaky], open: leaky })).not.toContain("0551234567");
  });
});

describe("letter view SSR", () => {
  it("renders an opened letter from a permalink", () => {
    const html = render({ items: [letter], open: letter });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("رسالة إلى");
    expect(html).toContain("شكراً معلمي");
    expect(html).toContain("أرسل لها هدية");
    expect(html).toContain("— سارة");
  });

  it("renders memory letters calmly: respectful wording, no gift", () => {
    const html = render({ items: [memory], open: memory });
    expect(html).toContain("إلى روح الدكتور سعد");
    expect(html).toContain("في ذكراك 🤍");
    expect(html).not.toContain("هدية 🎁");
    expect(html).toContain("— أحد طلابك");
  });
});
