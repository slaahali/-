import { describe, expect, it } from "vitest";
import {
  buildRequestBody,
  charCount,
  clampChars,
  firstInvalid,
  FORM_ERRORS,
  isValidContact,
  parseDraft,
  serializeDraft,
  validateForm,
  type FormFields,
} from "./form-logic";

const base: FormFields = {
  title: "ustadha",
  toName: "نورة",
  school: "",
  body: "شكراً لأنك آمنتِ فيني دايماً",
  fromName: "",
  variant: 2,
  inMemory: false,
  surpriseOptIn: false,
  contact: "",
};

describe("validateForm", () => {
  it("accepts a minimal valid letter", () => {
    expect(validateForm(base)).toEqual({});
  });

  it("uses the API's wording for name and body", () => {
    expect(validateForm({ ...base, toName: "   " }).toName).toBe(FORM_ERRORS.toNameEmpty);
    expect(validateForm({ ...base, toName: "ن" }).toName).toBe(FORM_ERRORS.toNameShort);
    expect(validateForm({ ...base, toName: "ن".repeat(41) }).toName).toBe(FORM_ERRORS.toNameLong);
    expect(validateForm({ ...base, body: "  قصير  " }).body).toBe(FORM_ERRORS.bodyShort);
    expect(validateForm({ ...base, body: "ا".repeat(601) }).body).toBe(FORM_ERRORS.bodyLong);
    expect(validateForm({ ...base, school: "م".repeat(71) }).school).toBe(FORM_ERRORS.schoolLong);
    expect(validateForm({ ...base, fromName: "س".repeat(41) }).fromName).toBe(FORM_ERRORS.fromNameLong);
  });

  it("counts emoji as one character", () => {
    expect(validateForm({ ...base, body: "💜".repeat(600) }).body).toBeUndefined();
    expect(validateForm({ ...base, body: "💜".repeat(601) }).body).toBe(FORM_ERRORS.bodyLong);
  });

  it("requires a contact only when opted in", () => {
    expect(validateForm({ ...base, surpriseOptIn: true }).contact).toBe(FORM_ERRORS.contactEmpty);
    expect(validateForm({ ...base, surpriseOptIn: true, contact: "hello" }).contact).toBe(
      FORM_ERRORS.contactInvalid,
    );
    expect(validateForm({ ...base, surpriseOptIn: true, contact: "0551234567" })).toEqual({});
    expect(validateForm({ ...base, contact: "junk" })).toEqual({});
  });

  it("ignores the surprise opt-in for in-memory letters", () => {
    expect(validateForm({ ...base, inMemory: true, surpriseOptIn: true })).toEqual({});
  });
});

describe("isValidContact", () => {
  it.each([
    "0551234567",
    "551234567",
    "+966551234567",
    "+966 0551234567",
    "966551234567",
    "00966 55 123 4567",
    "055-123-4567",
    "٠٥٥١٢٣٤٥٦٧",
    "a@b.co",
    "Name.Last@Mail.COM",
  ])("accepts %s", (v) => expect(isValidContact(v)).toBe(true));
  it.each(["", "12345", "0451234567", "name@", "@mail.com", "a@b", "a..b@mail.com", "نورة@مثال.سعودي"])(
    "rejects %s",
    (v) => expect(isValidContact(v)).toBe(false),
  );
});

describe("buildRequestBody", () => {
  it("trims, nulls empty optionals and passes the honeypot through", () => {
    const body = buildRequestBody(
      { ...base, toName: "  نورة   العتيبي ", school: "  ", fromName: " " },
      "",
    );
    expect(body).toMatchObject({
      title: "ustadha",
      toName: "نورة العتيبي",
      school: null,
      fromName: null,
      variant: 2,
      inMemory: false,
      surpriseOptIn: false,
      contact: null,
      website: "",
    });
  });

  it("keeps line breaks in the body", () => {
    expect(buildRequestBody({ ...base, body: "  سطر\r\nسطر  " }, "").body).toBe("سطر\nسطر");
  });

  it("never sends the contact unless opted in (and not in memory)", () => {
    expect(buildRequestBody({ ...base, contact: "0551234567" }, "").contact).toBeNull();
    expect(
      buildRequestBody({ ...base, inMemory: true, surpriseOptIn: true, contact: "0551234567" }, ""),
    ).toMatchObject({ surpriseOptIn: false, contact: null });
    expect(
      buildRequestBody({ ...base, surpriseOptIn: true, contact: " 0551234567 " }, ""),
    ).toMatchObject({ surpriseOptIn: true, contact: "0551234567" });
  });
});

describe("draft", () => {
  it("never stores the contact", () => {
    const raw = serializeDraft({ ...base, surpriseOptIn: true, contact: "0551234567" });
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("0551234567");
    expect(JSON.parse(raw!)).not.toHaveProperty("contact");
  });

  it("skips empty drafts", () => {
    expect(serializeDraft({ ...base, toName: " ", body: "", school: "", fromName: "" })).toBeNull();
  });

  it("round-trips", () => {
    const { contact: _contact, ...rest } = base;
    void _contact;
    expect(parseDraft(serializeDraft(base))).toEqual(rest);
  });

  it("is defensive about junk", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{nope")).toBeNull();
    expect(parseDraft("42")).toBeNull();
    const d = parseDraft(JSON.stringify({ title: "sir", toName: 5, body: "hi", variant: 99 }));
    expect(d).toMatchObject({ title: null, toName: "", body: "hi", variant: -1, inMemory: false });
  });
});

describe("small helpers", () => {
  it("clamps by code points", () => {
    expect(clampChars("💜💜💜", 2)).toBe("💜💜");
    expect(charCount(clampChars("💜💜💜", 2))).toBe(2);
    expect(clampChars("abc", 5)).toBe("abc");
  });

  it("finds the first invalid field in reading order", () => {
    expect(firstInvalid(["contact", "body", "school"])).toBe("school");
    expect(firstInvalid([])).toBeNull();
  });
});
