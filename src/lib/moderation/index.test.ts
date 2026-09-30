import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/config";
import type { CreateMessageInput } from "@/lib/types";
import { AI_UNAVAILABLE_MESSAGE, MODERATION_MESSAGES, moderateSubmission } from "./index";

function input(over: Partial<CreateMessageInput> = {}): CreateMessageInput {
  return {
    title: "ustadha",
    toName: "نورة الزهراني",
    school: "ثانوية الملك فهد",
    body: "شكراً لأنك آمنتِ فيني يوم ما أحد آمن، للحين أتذكر كلامك 💜",
    fromName: "ريم",
    variant: 2,
    inMemory: false,
    surpriseOptIn: false,
    contact: null,
    ...over,
  };
}

function aiReply(verdict: object, init: ResponseInit = { status: 200 }) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(verdict) }], stop_reason: "end_turn" }),
    { headers: { "content-type": "application/json" }, ...init },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("moderateSubmission — word lists (MODERATION_AI=off)", () => {
  beforeEach(() => {
    vi.stubEnv("MODERATION_AI", "off");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });

  it("publishes a clean letter without flags", async () => {
    const v = await moderateSubmission(input());
    expect(v).toMatchObject({ ok: true, reason: null, layer: "wordlist", suspicious: false, fields: [] });
    expect(v.suspicionReason).toBeUndefined();
  });

  it("publishes a clean in-memory letter", async () => {
    const v = await moderateSubmission(
      input({ inMemory: true, body: "الله يرحمك يا أستاذ سعد ويجعل قبرك روضة من رياض الجنة، علمتنا الصدق 🤍" }),
    );
    expect(v).toMatchObject({ ok: true, suspicious: false });
  });

  it("never checks the private contact field", async () => {
    const v = await moderateSubmission(
      input({ surpriseOptIn: true, contact: "0551234567 noura@gmail.com https://x.com/n يا حمار" }),
    );
    expect(v).toMatchObject({ ok: true, suspicious: false });
  });

  it("rejects profanity with the generic copy and the offending field", async () => {
    const v = await moderateSubmission(input({ body: "انت حمار وما تعرف تشرح أبداً" }));
    expect(v).toMatchObject({
      ok: false,
      reason: "profanity",
      layer: "wordlist",
      fields: ["body"],
      message: COPY.moderationError,
      suspicious: false,
    });
  });

  it("rejects contact details, links and spam with specific messages", async () => {
    const phone = await moderateSubmission(input({ fromName: "ريم 0551234567" }));
    expect(phone).toMatchObject({ ok: false, reason: "contact_info", fields: ["fromName"] });
    expect(phone.message).toBe(MODERATION_MESSAGES.contact_info);
    expect(phone.message).toContain("الخصوصية");

    const link = await moderateSubmission(input({ school: "www.school.com" }));
    expect(link).toMatchObject({ ok: false, reason: "link", fields: ["school"] });
    expect(link.message).toContain("روابط");

    const spam = await moderateSubmission(input({ body: "شكرا ".repeat(10) }));
    expect(spam).toMatchObject({ ok: false, reason: "spam", fields: ["body"] });
    expect(spam.message).toContain("مكررة");
  });

  it("reports every failing field and the most serious reason", async () => {
    const v = await moderateSubmission(input({ toName: "الاستاذ الغبي", body: "زوروا متجري www.shop.com 💜 شكرا" }));
    expect(v.reason).toBe("profanity");
    expect(v.fields).toEqual(expect.arrayContaining(["toName", "body"]));
  });

  it("flags soft words for review but lets the letter through", async () => {
    const v = await moderateSubmission(input({ body: "كان ظالم معنا بالدرجات بس الحين فهمت ليش 😅" }));
    expect(v).toMatchObject({ ok: true, suspicious: true });
    expect(v.suspicionReason).toContain("ظالم");
  });

  it("flags unaddressed insults next to the teacher's name", async () => {
    const v = await moderateSubmission(input({ toName: "نورة البقرة" }));
    expect(v).toMatchObject({ ok: true, suspicious: true });
    expect(v.suspicionReason).toContain("toName");
  });

  it("flags bodies that are mostly not Arabic", async () => {
    const v = await moderateSubmission(
      input({ body: "Buy cheap followers now, best prices in town, limited offer for everyone" }),
    );
    expect(v).toMatchObject({ ok: true, suspicious: true });
    expect(v.suspicionReason).toContain("non-Arabic");
  });

  it("does not flag mixed Arabic/English letters that are mostly Arabic", async () => {
    const v = await moderateSubmission(
      input({
        toName: "مس سارة",
        body: "Ms. Sarah, you taught me English… بس الحقيقة علمتيني أتكلم بدون خوف قدام الفصل كله. اليوم أقدّم عروض في شغلي بكل ثقة. Thank you 💛",
      }),
    );
    expect(v).toMatchObject({ ok: true, suspicious: false });
  });

  it("does not call the AI when it is off", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    await moderateSubmission(input());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("moderateSubmission — AI layer", () => {
  it("auto without a key: word lists only, not suspicious", async () => {
    vi.stubEnv("MODERATION_AI", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const v = await moderateSubmission(input());
    expect(v).toMatchObject({ ok: true, layer: "wordlist", suspicious: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("auto with a key", () => {
    beforeEach(() => {
      vi.stubEnv("MODERATION_AI", "auto");
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    });

    it("sends only public fields to Claude Haiku and accepts a confident allow", async () => {
      const fetchSpy = vi.fn(async (..._args: unknown[]) =>
        aiReply({ allowed: true, confidence: 0.97, fields: [], reason: "thank-you letter" }),
      );
      vi.stubGlobal("fetch", fetchSpy);
      const v = await moderateSubmission(input({ surpriseOptIn: true, contact: "0551234567" }));
      expect(v).toMatchObject({ ok: true, layer: "ai", suspicious: false });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      const headers = init.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("sk-test");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("claude-haiku-4-5");
      expect(String(init.body)).toContain("نورة الزهراني");
      expect(String(init.body)).not.toContain("0551234567");
    });

    it("marks a low-confidence allow as suspicious", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => aiReply({ allowed: true, confidence: 0.6, fields: [], reason: "unclear joke" })));
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: true, layer: "ai", suspicious: true });
      expect(v.suspicionReason).toContain("AI unsure");
    });

    it("rejects what the AI flags, highlighting its fields", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => aiReply({ allowed: false, confidence: 0.9, fields: ["body"], reason: "mockery of teacher" })),
      );
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({
        ok: false,
        reason: "ai_flagged",
        layer: "ai",
        fields: ["body"],
        message: COPY.moderationError,
      });
    });

    it("falls back to the word list (suspicious) when the AI call fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: true, layer: "wordlist", suspicious: true });
      expect(v.suspicionReason).toContain("AI check unavailable");
    });

    it("treats an HTTP error as unavailable", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn(async () => new Response("overloaded", { status: 529 })));
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: true, suspicious: true });
    });

    it("never calls the AI for text the word list already rejected", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const v = await moderateSubmission(input({ body: "يا حمار ما تفهم شي أبداً" }));
      expect(v).toMatchObject({ ok: false, layer: "wordlist" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("required", () => {
    beforeEach(() => vi.stubEnv("MODERATION_AI", "required"));

    it("rejects with a friendly message when no key is configured", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: false, layer: "ai", message: AI_UNAVAILABLE_MESSAGE });
    });

    it("rejects when the AI can't answer", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
      vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: false, message: AI_UNAVAILABLE_MESSAGE });
    });

    it("publishes when the AI allows it", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
      vi.stubGlobal("fetch", vi.fn(async () => aiReply({ allowed: true, confidence: 0.9, fields: [], reason: "ok" })));
      const v = await moderateSubmission(input());
      expect(v).toMatchObject({ ok: true, layer: "ai", suspicious: false });
    });
  });
});
