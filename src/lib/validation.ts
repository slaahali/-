import { cleanInput } from "@/lib/text/normalize";
import {
  LIMITS,
  TEACHER_TITLE_KEYS,
  TEACHER_TITLES,
  VARIANT_COUNT,
  type CreateMessageInput,
  type InputField,
  type TeacherTitle,
} from "./types";

export type FieldErrors = Partial<Record<InputField, string>>;

/** CreateMessageInput, except `variant` is null when the writer didn't pick a colour. */
export type ParsedMessageInput = Omit<CreateMessageInput, "variant"> & { variant: number | null };

export type ParseCreateResult =
  | { ok: true; input: ParsedMessageInput; isBot: boolean }
  | { ok: false; fields: FieldErrors };

export const FIELD_ERRORS = {
  toNameEmpty: "اكتب اسم المعلم 💜",
  toNameShort: "الاسم قصير شوي",
  toNameLong: "الاسم طويل شوي",
  schoolLong: "اسم المدرسة طويل شوي",
  bodyShort: "اكتب لمعلمك كم كلمة زيادة 💜",
  bodyLong: "الرسالة أطول من ٦٠٠ حرف",
  fromNameLong: "اسمك طويل شوي",
  contactMissing: "اكتب رقم جوالك أو إيميلك عشان نتواصل معك",
  contactInvalid: "اكتب رقم جوال سعودي أو إيميل صحيح",
} as const;

/** Length in code points, so an emoji counts once (matches the form counter). */
export function charCount(s: string): number {
  return [...s].length;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseTitle(v: unknown): TeacherTitle | null {
  return typeof v === "string" && (TEACHER_TITLE_KEYS as string[]).includes(v)
    ? (v as TeacherTitle)
    : null;
}

function parseVariant(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < VARIANT_COUNT ? v : null;
}

// Visitors often pick the «أستاذة» chip *and* type "أستاذة نورة"; drop the
// duplicate so the card doesn't read "أستاذة أستاذة نورة".
const TITLE_PREFIXES: Record<TeacherTitle, string[]> = {
  ustadh: [TEACHER_TITLES.ustadh, "الأستاذ", "الاستاذ", "استاذ", "أ."],
  ustadha: [TEACHER_TITLES.ustadha, "الأستاذة", "الاستاذة", "استاذة", "أ."],
  dr_m: [TEACHER_TITLES.dr_m, "دكتور", "د."],
  dr_f: [TEACHER_TITLES.dr_f, "دكتورة", "د."],
};

function stripDuplicateTitle(name: string, title: TeacherTitle | null): string {
  if (!title) return name;
  const prefixes = [...TITLE_PREFIXES[title]].sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    if (name.startsWith(p)) {
      const rest = name.slice(p.length);
      // Only strip a whole word ("أ." may be glued to the name: "أ.نورة").
      if (rest && (/^\s/.test(rest) || p.endsWith("."))) {
        const trimmed = rest.trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return name;
}

// ---------------------------------------------------------------------------
// Private surprise contact
// ---------------------------------------------------------------------------

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. */
function asciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

// 05XXXXXXXX · 5XXXXXXXX · +9665XXXXXXXX · 009665XXXXXXXX · 9665XXXXXXXX
// (plus the common "+966 05…" slip).
const SAUDI_MOBILE_RE = /^(?:(?:\+|00)?9660?|0)?(5\d{8})$/;
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;

/**
 * A Saudi mobile as +9665XXXXXXXX, or a lowercased email. null when it's neither.
 * `raw` should already be cleaned (cleanInput).
 */
export function normalizeContact(raw: string): string | null {
  const s = asciiDigits(raw).trim();
  if (!s) return null;

  const phone = s.replace(/[\s()\-‐-―−]/g, "");
  const m = SAUDI_MOBILE_RE.exec(phone);
  if (m) return `+966${m[1]}`;

  const email = s.toLowerCase();
  if (charCount(email) <= LIMITS.contact.max && EMAIL_RE.test(email) && !email.includes("..")) {
    return email;
  }
  return null;
}

// ---------------------------------------------------------------------------

export function parseCreateBody(body: unknown): ParseCreateResult {
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  const fields: FieldErrors = {};

  const title = parseTitle(b.title);
  const toName = stripDuplicateTitle(cleanInput(str(b.toName)), title);
  const school = cleanInput(str(b.school));
  const text = cleanInput(str(b.body), { multiline: true });
  const from = cleanInput(str(b.fromName));
  const inMemory = b.inMemory === true;
  const surpriseOptIn = b.surpriseOptIn === true;

  const toLen = charCount(toName);
  if (toLen === 0) fields.toName = FIELD_ERRORS.toNameEmpty;
  else if (toLen < LIMITS.toName.min) fields.toName = FIELD_ERRORS.toNameShort;
  else if (toLen > LIMITS.toName.max) fields.toName = FIELD_ERRORS.toNameLong;

  if (charCount(school) > LIMITS.school.max) fields.school = FIELD_ERRORS.schoolLong;

  const bodyLen = charCount(text);
  if (bodyLen < LIMITS.body.min) fields.body = FIELD_ERRORS.bodyShort;
  else if (bodyLen > LIMITS.body.max) fields.body = FIELD_ERRORS.bodyLong;

  if (charCount(from) > LIMITS.fromName.max) fields.fromName = FIELD_ERRORS.fromNameLong;

  // The contact is only kept when the writer opted in; otherwise it's dropped unread.
  let contact: string | null = null;
  if (surpriseOptIn) {
    const rawContact = cleanInput(str(b.contact));
    if (!rawContact) fields.contact = FIELD_ERRORS.contactMissing;
    else {
      contact = normalizeContact(rawContact);
      if (!contact) fields.contact = FIELD_ERRORS.contactInvalid;
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    input: {
      title,
      toName,
      school: school || null,
      body: text,
      fromName: from || null,
      variant: parseVariant(b.variant),
      inMemory,
      surpriseOptIn,
      contact,
    },
    isBot: str(b.website).trim().length > 0,
  };
}
