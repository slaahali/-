import { describe, expect, it } from "vitest";
import { FIELD_ERRORS, charCount, normalizeContact, parseCreateBody } from "./validation";

const base = {
  title: "ustadha",
  toName: "نورة القحطاني",
  school: "ثانوية الملك فهد",
  body: "شكراً لأنك آمنتِ فيني يوم ما أحد آمن 💜",
  fromName: "سارة",
};

function ok(body: unknown) {
  const r = parseCreateBody(body);
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.fields)}`);
  return r;
}

function fields(body: unknown) {
  const r = parseCreateBody(body);
  if (r.ok) throw new Error("expected validation errors");
  return r.fields;
}

describe("parseCreateBody", () => {
  it("accepts a normal letter with defaults", () => {
    const { input, isBot } = ok(base);
    expect(isBot).toBe(false);
    expect(input).toEqual({
      title: "ustadha",
      toName: "نورة القحطاني",
      school: "ثانوية الملك فهد",
      body: base.body,
      fromName: "سارة",
      variant: null,
      inMemory: false,
      surpriseOptIn: false,
      contact: null,
    });
  });

  it("cleans whitespace and turns empty optionals into null", () => {
    const { input } = ok({ ...base, toName: "  نورة   القحطاني ", school: "   ", fromName: "" });
    expect(input.toName).toBe("نورة القحطاني");
    expect(input.school).toBeNull();
    expect(input.fromName).toBeNull();
  });

  it("keeps line breaks in the body", () => {
    const { input } = ok({ ...base, body: "سطر أول يا أستاذة\nسطر ثاني" });
    expect(input.body).toBe("سطر أول يا أستاذة\nسطر ثاني");
  });

  it("only accepts known titles", () => {
    expect(ok({ ...base, title: "dr_m" }).input.title).toBe("dr_m");
    expect(ok({ ...base, title: "king" }).input.title).toBeNull();
    expect(ok({ ...base, title: null }).input.title).toBeNull();
  });

  it("drops a title typed twice", () => {
    expect(ok({ ...base, toName: "أستاذة نورة" }).input.toName).toBe("نورة");
    expect(ok({ ...base, toName: "أ.نورة" }).input.toName).toBe("نورة");
    expect(ok({ ...base, title: "dr_m", toName: "د. خالد" }).input.toName).toBe("خالد");
    expect(ok({ ...base, title: null, toName: "أستاذة نورة" }).input.toName).toBe("أستاذة نورة");
  });

  it("reports each field in Arabic", () => {
    expect(fields({ ...base, toName: "" }).toName).toBe(FIELD_ERRORS.toNameEmpty);
    expect(fields({ ...base, toName: "ن" }).toName).toBe(FIELD_ERRORS.toNameShort);
    expect(fields({ ...base, toName: "ن".repeat(41) }).toName).toBe(FIELD_ERRORS.toNameLong);
    expect(fields({ ...base, school: "م".repeat(71) }).school).toBe(FIELD_ERRORS.schoolLong);
    expect(fields({ ...base, body: "شكراً" }).body).toBe(FIELD_ERRORS.bodyShort);
    expect(fields({ ...base, body: "ش".repeat(601) }).body).toBe(FIELD_ERRORS.bodyLong);
    expect(fields({ ...base, fromName: "س".repeat(41) }).fromName).toBe(FIELD_ERRORS.fromNameLong);
    expect(Object.keys(fields({}))).toEqual(["toName", "body"]);
    expect(Object.keys(fields(null))).toEqual(["toName", "body"]);
    expect(Object.keys(fields([1, 2]))).toEqual(["toName", "body"]);
  });

  it("counts characters by code point (emoji count once)", () => {
    expect(charCount("💜💜")).toBe(2);
    expect(ok({ ...base, body: "💜".repeat(600) }).input.body).toHaveLength(1200);
    expect(fields({ ...base, body: "💜".repeat(601) }).body).toBe(FIELD_ERRORS.bodyLong);
  });

  it("takes the writer's card colour when it is valid", () => {
    expect(ok({ ...base, variant: 0 }).input.variant).toBe(0);
    expect(ok({ ...base, variant: 5 }).input.variant).toBe(5);
    for (const v of [6, -1, 2.5, "3", null, undefined]) {
      expect(ok({ ...base, variant: v }).input.variant).toBeNull();
    }
  });

  it("reads inMemory / surpriseOptIn as strict booleans", () => {
    expect(ok({ ...base, inMemory: true }).input.inMemory).toBe(true);
    expect(ok({ ...base, inMemory: "true" }).input.inMemory).toBe(false);
    expect(ok({ ...base, surpriseOptIn: 1, contact: "0501234567" }).input.surpriseOptIn).toBe(false);
  });

  it("requires a valid contact when opted in to the surprise", () => {
    expect(fields({ ...base, surpriseOptIn: true }).contact).toBe(FIELD_ERRORS.contactMissing);
    expect(fields({ ...base, surpriseOptIn: true, contact: "  " }).contact).toBe(FIELD_ERRORS.contactMissing);
    expect(fields({ ...base, surpriseOptIn: true, contact: "12345" }).contact).toBe(FIELD_ERRORS.contactInvalid);
    const r = ok({ ...base, surpriseOptIn: true, contact: "٠٥٠ ١٢٣ ٤٥٦٧" });
    expect(r.input.surpriseOptIn).toBe(true);
    expect(r.input.contact).toBe("+966501234567");
  });

  it("drops the contact when not opted in", () => {
    const { input } = ok({ ...base, surpriseOptIn: false, contact: "0501234567" });
    expect(input.contact).toBeNull();
    expect(ok({ ...base, contact: "not even valid" }).input.contact).toBeNull();
  });

  it("flags the honeypot", () => {
    expect(ok({ ...base, website: "http://spam.example" }).isBot).toBe(true);
    expect(ok({ ...base, website: "   " }).isBot).toBe(false);
  });
});

describe("normalizeContact", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["+966501234567", "+966501234567"],
    ["00966501234567", "+966501234567"],
    ["966501234567", "+966501234567"],
    ["+966 0501234567", "+966501234567"],
    ["050-123-4567", "+966501234567"],
    ["(050) 123 4567", "+966501234567"],
    ["+966 (55) 123-4567", "+966551234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
    ["۰۵۰۱۲۳۴۵۶۷", "+966501234567"],
    ["+٩٦٦٥٠١٢٣٤٥٦٧", "+966501234567"],
  ])("phone %s → %s", (raw, expected) => {
    expect(normalizeContact(raw)).toBe(expected);
  });

  it.each([
    ["Name@Example.COM", "name@example.com"],
    ["first.last+tcz@mail.co.sa", "first.last+tcz@mail.co.sa"],
  ])("email %s → %s", (raw, expected) => {
    expect(normalizeContact(raw)).toBe(expected);
  });

  it.each([
    "",
    "0401234567", // landline-ish / not a mobile
    "05012345678", // too long
    "050123456", // too short
    "+971501234567", // not Saudi
    "0501234567x",
    "name@",
    "@example.com",
    "name@example",
    "name@@example.com",
    "na me@example.com",
    "a..b@example.com",
    `${"a".repeat(80)}@example.com`,
  ])("rejects %s", (raw) => {
    expect(normalizeContact(raw)).toBeNull();
  });
});
