import { COPY } from "./config";
import type { SceneLetter } from "./events";
import { TEACHER_TITLES, type PublicMessage, type TeacherTitle } from "./types";

/** "أستاذة نورة" — title label + name (just the name when no title). */
export function displayTo(m: { title: TeacherTitle | null; toName: string }): string {
  return m.title ? `${TEACHER_TITLES[m.title]} ${m.toName}` : m.toName;
}

/** "إلى: أستاذة نورة" */
export function toLine(m: { title: TeacherTitle | null; toName: string }): string {
  return `${COPY.labelTo} ${displayTo(m)}`;
}

/** Signature line. Anonymous letters are signed "أحد طلابك". */
export function fromName(m: { fromName: string | null }): string {
  return m.fromName?.trim() || COPY.anonymousFrom;
}

const numberFmt = new Intl.NumberFormat("ar-SA-u-nu-latn");
export function formatCount(n: number): string {
  return numberFmt.format(n);
}

const rtf = new Intl.RelativeTimeFormat("ar-SA-u-nu-latn", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
});

/**
 * Arabic relative time ("قبل 3 ساعات", "أمس"…). Depends on the clock, so call it
 * from an effect / client-only render to avoid hydration mismatches.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((t - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "الآن";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return dateFmt.format(new Date(t));
}

/** Collapse whitespace and cut to `max` chars on a word boundary, adding "…". */
export function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

export function toSceneLetter(m: PublicMessage): SceneLetter {
  return { id: m.id, label: toLine(m), snippet: excerpt(m.body, 90), variant: m.variant };
}
