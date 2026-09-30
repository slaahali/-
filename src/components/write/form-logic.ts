// Pure helpers behind <MessageForm>: client validation (mirrors the API's
// messages), the request body, and the local draft. No React / DOM here.

import {
  LIMITS,
  TEACHER_TITLE_KEYS,
  VARIANT_COUNT,
  type CreateMessageBody,
  type InputField,
  type TeacherTitle,
} from "@/lib/types";

export interface FormFields {
  title: TeacherTitle | null;
  toName: string;
  school: string;
  body: string;
  fromName: string;
  variant: number;
  inMemory: boolean;
  surpriseOptIn: boolean;
  /** PRIVATE. Never persisted, only sent when the writer opted in. */
  contact: string;
}

export type FieldErrors = Partial<Record<InputField, string>>;

/** Focus / reading order of the inputs, for "focus the first invalid field". */
export const FIELD_ORDER: readonly InputField[] = ["toName", "school", "body", "fromName", "contact"];

export const FORM_ERRORS = {
  toNameEmpty: "اكتب اسم المعلم 💜",
  toNameShort: "الاسم قصير شوي",
  toNameLong: "الاسم طويل شوي",
  schoolLong: "اسم المدرسة طويل شوي",
  bodyShort: "اكتب لمعلمك كم كلمة زيادة 💜",
  bodyLong: "الرسالة أطول من ٦٠٠ حرف",
  fromNameLong: "اسمك طويل شوي",
  contactEmpty: "اكتب رقم جوالك أو إيميلك عشان نتواصل معك",
  contactInvalid: "تأكد من رقم الجوال أو الإيميل 🙏",
  contactLong: "طويل شوي — اكتب رقم جوال أو إيميل واحد",
} as const;

/** Length in code points (an emoji counts once), same as the server. */
export function charCount(s: string): number {
  return [...s].length;
}

/** Cut to `max` code points without splitting a surrogate pair. */
export function clampChars(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const tidyBody = (s: string) => s.replace(/\r\n?/g, "\n").trim();

const toAsciiDigits = (s: string) =>
  s
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SA_MOBILE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

/** A Saudi mobile (05…, 5…, +9665…, 009665…) or an email address. */
export function isValidContact(value: string): boolean {
  const s = toAsciiDigits(value).trim();
  if (EMAIL_RE.test(s)) return true;
  return SA_MOBILE_RE.test(s.replace(/[\s\-().]/g, ""));
}

/** The surprise block doesn't apply to «في ذكرى» letters (it's hidden in the form). */
export const wantsSurprise = (f: Pick<FormFields, "surpriseOptIn" | "inMemory">) =>
  f.surpriseOptIn && !f.inMemory;

export function validateForm(f: FormFields): FieldErrors {
  const errors: FieldErrors = {};

  const to = charCount(squash(f.toName));
  if (to === 0) errors.toName = FORM_ERRORS.toNameEmpty;
  else if (to < LIMITS.toName.min) errors.toName = FORM_ERRORS.toNameShort;
  else if (to > LIMITS.toName.max) errors.toName = FORM_ERRORS.toNameLong;

  if (charCount(squash(f.school)) > LIMITS.school.max) errors.school = FORM_ERRORS.schoolLong;

  const body = charCount(tidyBody(f.body));
  if (body < LIMITS.body.min) errors.body = FORM_ERRORS.bodyShort;
  else if (body > LIMITS.body.max) errors.body = FORM_ERRORS.bodyLong;

  if (charCount(squash(f.fromName)) > LIMITS.fromName.max) errors.fromName = FORM_ERRORS.fromNameLong;

  if (wantsSurprise(f)) {
    const contact = f.contact.trim();
    if (!contact) errors.contact = FORM_ERRORS.contactEmpty;
    else if (charCount(contact) > LIMITS.contact.max) errors.contact = FORM_ERRORS.contactLong;
    else if (!isValidContact(contact)) errors.contact = FORM_ERRORS.contactInvalid;
  }

  return errors;
}

export function firstInvalid(fields: Iterable<string>): InputField | null {
  const set = new Set(fields);
  return FIELD_ORDER.find((f) => set.has(f)) ?? null;
}

export function buildRequestBody(f: FormFields, website: string): CreateMessageBody {
  const surprise = wantsSurprise(f);
  return {
    title: f.title,
    toName: squash(f.toName),
    school: squash(f.school) || null,
    body: tidyBody(f.body),
    fromName: squash(f.fromName) || null,
    variant: f.variant,
    inMemory: f.inMemory,
    surpriseOptIn: surprise,
    // The private contact only ever leaves the browser when the writer opted in.
    contact: surprise ? f.contact.trim() : null,
    website,
  };
}

// ---------------------------------------------------------------------------
// Draft (localStorage). `contact` is deliberately never stored.
// ---------------------------------------------------------------------------

export const DRAFT_KEY = "tcz_draft_v1";

export type Draft = Omit<FormFields, "contact">;

export function serializeDraft(f: FormFields | Draft): string | null {
  const draft: Draft = {
    title: f.title,
    toName: f.toName,
    school: f.school,
    body: f.body,
    fromName: f.fromName,
    variant: f.variant,
    inMemory: f.inMemory,
    surpriseOptIn: f.surpriseOptIn,
  };
  const hasText = [draft.toName, draft.school, draft.body, draft.fromName].some((s) => s.trim());
  return hasText ? JSON.stringify(draft) : null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? clampChars(v, max) : "");

/** Reads a stored draft defensively. `variant` is -1 when the stored one is unusable. */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const variant = Number(d.variant);
  const draft: Draft = {
    title:
      typeof d.title === "string" && (TEACHER_TITLE_KEYS as string[]).includes(d.title)
        ? (d.title as TeacherTitle)
        : null,
    toName: str(d.toName, LIMITS.toName.max),
    school: str(d.school, LIMITS.school.max),
    body: str(d.body, LIMITS.body.max),
    fromName: str(d.fromName, LIMITS.fromName.max),
    variant: Number.isInteger(variant) && variant >= 0 && variant < VARIANT_COUNT ? variant : -1,
    inMemory: d.inMemory === true,
    surpriseOptIn: d.surpriseOptIn === true,
  };
  return serializeDraft(draft) ? draft : null;
}
