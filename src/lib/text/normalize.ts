// Text cleaning + Arabic normalisation shared by validation, search and the
// moderation filter. Isomorphic: no Node-only imports (search normalisation can
// run in the browser too).

import type { TeacherTitle } from "../types";

// Invisible / formatting characters people (or bots) paste to break words
// apart or smuggle hidden text. ZWJ (U+200D) is handled separately because
// emoji sequences like 👩🏫 need it.
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]|\uDB40[\uDC00-\uDC7F]|\uDB40[\uDD00-\uDDEF]|\uD834[\uDD73-\uDD7A]/g;
// C0/C1 controls except \n (tabs are turned into spaces before this runs).
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const ODD_SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u2800\u3000]/g;
const LINE_BREAKS = /\r\n?|[\u0085\u2028\u2029]/g;
// Combining marks: Latin/general + Arabic harakat/Quranic marks.
const MARK_CLASS =
  "\\u0300-\\u036F\\u0483-\\u0489\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u08D3-\\u08FF\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F";
const MARKS = new RegExp(`[${MARK_CLASS}]`, "g");
// More than 4 stacked marks on one letter is "Zalgo" text, never real Arabic.
const ZALGO = new RegExp(`([${MARK_CLASS}]{4})[${MARK_CLASS}]+`, "g");

function isEmojiPart(cp: number | undefined): boolean {
  if (cp === undefined) return false;
  return (
    cp >= 0x1f000 ||
    (cp >= 0x2190 && cp <= 0x2bff) ||
    cp === 0xfe0f ||
    cp === 0x20e3 ||
    cp === 0x00a9 ||
    cp === 0x00ae
  );
}

/** Drops ZWJ unless it glues two emoji together (👩\u200D🏫, ❤\uFE0F\u200D🔥). */
function stripStrayZwj(s: string): string {
  if (!s.includes("\u200D")) return s;
  const cps = Array.from(s);
  let out = "";
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i];
    if (ch === "\u200D") {
      if (isEmojiPart(cps[i - 1]?.codePointAt(0)) && isEmojiPart(cps[i + 1]?.codePointAt(0))) {
        out += ch;
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Cleans raw form input before validation/storage: NFC, strips control and
 * invisible characters, trims, collapses runs of spaces. `multiline` keeps line
 * breaks (max one blank line in a row); otherwise newlines become spaces.
 */
export function cleanInput(s: string, opts: { multiline?: boolean } = {}): string {
  let t = String(s ?? "").normalize("NFC");
  t = t.replace(LINE_BREAKS, "\n").replace(/\t/g, " ");
  t = t.replace(INVISIBLE, "").replace(CONTROL, "");
  t = stripStrayZwj(t);
  t = t.replace(ODD_SPACES, " ").replace(ZALGO, "$1");
  if (opts.multiline) {
    return t
      .split("\n")
      .map((line) => line.replace(/ {2,}/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return t.replace(/\n+/g, " ").replace(/ {2,}/g, " ").trim();
}

// Letter variants → one canonical letter. Hamza-carrying letters (أ إ آ ؤ ئ)
// lose their hamza when the combining marks are stripped after NFKD.
const LETTER_GROUPS: Array<[canonical: string, variants: string]> = [
  ["ا", "ٱٲٳٵ"], // wasla + alef variants
  ["ي", "ىیېے"], // ى, Persian/Urdu yeh
  ["ه", "ةۀہۃھە"], // ة and heh variants
  ["ك", "کڪچ"], // Persian ک, Najdi چ
  ["ق", "گڨٯ"], // Gulf/Iraqi گ (g)
  ["ف", "ڤڥڡ"], // ڤ (v)
  ["ب", "پٮ"], // پ (p)
  ["ز", "ژ"],
  ["ت", "ٹٺ"],
  ["د", "ڈ"],
  ["ر", "ڑڕ"],
  ["ن", "ں"],
  ["ل", "ڵ"],
  ["و", "ۆۇۈۋ"],
];
const LETTER_MAP: Record<string, string> = {};
for (const [canonical, variants] of LETTER_GROUPS) for (const v of variants) LETTER_MAP[v] = canonical;
const LETTER_RE = new RegExp(`[${Object.keys(LETTER_MAP).join("")}]`, "g");
const TATWEEL_AND_VS = /[\u0640\uFE00-\uFE0F]/g;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/**
 * Everything normalizeArabic does except turning punctuation into spaces:
 * compatibility forms, case, diacritics, tatweel, invisibles, letter variants,
 * digits. The moderation filter uses this so it can still see "@", "$", "." etc.
 */
export function foldText(s: string): string {
  let t = String(s ?? "").normalize("NFKD").toLowerCase();
  t = t.replace(MARKS, "").normalize("NFC");
  t = t.replace(INVISIBLE, "").replace(/\u200D/g, "").replace(TATWEEL_AND_VS, "");
  t = t.replace(LETTER_RE, (c) => LETTER_MAP[c] ?? c);
  return asciiDigits(t);
}

const NON_WORD = /[^\p{L}\p{N}]+/gu;

/**
 * Normalises text for matching (search + moderation): NFKC, lowercase, no
 * tashkeel/tatweel, أإآٱ→ا, ى→ي, ة→ه, ؤ→و, ئ→ي, ک/ی→ك/ي, ASCII digits,
 * punctuation/emoji → space, single spaces.
 */
export function normalizeArabic(s: string): string {
  return foldText(s).replace(NON_WORD, " ").replace(/\s+/g, " ").trim();
}

// Honorifics, already normalised. Removed as whole words only.
const TITLES = new Set([
  "ا", "د", "م",
  "استاذ", "استاذه", "الاستاذ", "الاستاذه", "استاذي", "استاذتي", "استاذنا", "استاذتنا",
  "دكتور", "دكتوره", "الدكتور", "الدكتوره", "دكتوري", "دكتورتي", "دكتورنا", "دكتورتنا",
  "معلم", "معلمه", "المعلم", "المعلمه", "معلمي", "معلمتي", "معلمنا", "معلمتنا",
  "مدرس", "المدرس",
  "ابله", "الابله", "ابلتي", "ابلتنا",
  "مس", "ميس", "مستر", "مسز", "بروف", "البروف", "بروفيسور", "البروفيسور", "البروفيسوره",
  "mr", "mrs", "ms", "miss", "mister", "dr", "doctor", "prof", "professor", "teacher", "coach",
]);

/** Removes honorifics (أستاذ/ة، د.، المعلم/ة، مس، Mr/Ms/Dr …) from normalised text. */
export function stripTitles(normalized: string): string {
  return normalized
    .split(" ")
    .filter((w) => w && !TITLES.has(w))
    .join(" ");
}

// "عبد الله" and "عبدالله" are the same name; so are "آل سعود" / "السعود".
const COMPOUND_LEAD = /(^| )(عبد|ابو|ابن|بن|بنت|ام|ال) (?=\S)/g;

export function buildSearchText(m: {
  title: TeacherTitle | null;
  toName: string;
  school: string | null;
}): string {
  const name = stripTitles(normalizeArabic(m.toName));
  const school = normalizeArabic(m.school ?? "");
  const base = `${name} ${school}`.trim();
  const compact = base.replace(COMPOUND_LEAD, "$1$2");
  return compact === base ? base : `${base} ${compact}`;
}

const MAX_QUERY_TOKENS = 6;

export function tokenizeQuery(q: string): string[] {
  const seen = new Set<string>();
  for (const t of stripTitles(normalizeArabic(q)).split(" ")) {
    if (t) seen.add(t);
    if (seen.size >= MAX_QUERY_TOKENS) break;
  }
  return [...seen];
}

/** AND search: every token must appear somewhere in the normalised search text. */
export function matchesQuery(searchText: string, tokens: string[]): boolean {
  return tokens.every((t) => searchText.includes(t));
}
