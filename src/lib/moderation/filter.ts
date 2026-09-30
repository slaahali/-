// Word-list moderation: profanity (Arabic, English, Arabizi — including
// disguised spellings), contact details, links and spam. Pure and synchronous;
// ./index.ts combines it with the optional AI layer.

import { foldText, stripTitles } from "@/lib/text/normalize";
import {
  ADDRESSED,
  ADDRESSED_EN,
  ADDRESS_WORDS,
  ALWAYS,
  CLAUSE_WORDS,
  FILLER_WORDS,
  FIRST_PERSON_WORDS,
  LINEAGE_WORDS,
  LITERAL,
  NAME_COLLISIONS,
  NEGATION_WORDS,
  OPINION_WORDS,
  REPORTING_WORDS,
  SAFE_PHRASES,
  SOFT,
  SPEECH_SKIP,
  STORY_WORDS,
  SURNAMES,
  expandPattern,
} from "./wordlists";

export type ModerationReason = "profanity" | "contact_info" | "link" | "spam" | "ai_flagged";

/** What kind of field is being checked: names get title stripping, the body gets spam checks. */
export type TextKind = "body" | "name" | "school";

export interface CheckResult {
  ok: boolean;
  reason: ModerationReason | null;
  /** Hard hits: list entries, or labels like "phone" / "url" / "spam:repeat". */
  matches: string[];
  /** Soft hits: fine to publish, but a human should glance at it. */
  soft: string[];
}

// ---------------------------------------------------------------------------
// Folding: normalizeArabic minus punctuation removal, plus Latin look-alikes.
// ---------------------------------------------------------------------------

const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y",
  х: "x", ѕ: "s", і: "i", ј: "j", ԁ: "d", һ: "h", ԛ: "q", ԝ: "w", ү: "y", ь: "b",
  // Greek
  α: "a", β: "b", γ: "y", ε: "e", η: "n", ι: "i", κ: "k", μ: "u", ν: "v", ο: "o", ρ: "p",
  σ: "o", ς: "s", τ: "t", υ: "u", χ: "x", ω: "w", ζ: "z",
  // Latin look-alikes + small caps
  ı: "i", ł: "l", ø: "o", đ: "d", ð: "d", ƒ: "f", ß: "ss", ɑ: "a", ɛ: "e", ɩ: "i", ɡ: "g",
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i", ᴊ: "j", ᴋ: "k",
  ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ʀ: "r", ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y",
  ᴢ: "z",
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");
const DOT_LIKE = /[\u066B\u06D4\u3002\uFF61\u00B7\u2024\u2027]/g;
const APOSTROPHES = /[\u2018\u2019\u02BC`\u00B4]/g;

// Digits or a stray Latin letter glued between Arabic letters are filler: «ك1ل1ب», «شرxموطه».
const DIGITS_IN_ARABIC = /([\u0621-\u064A])(?:\d+|[a-z]{1,2})(?=[\u0621-\u064A])/g;

function foldForFilter(s: string): string {
  return foldText(s)
    .replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] ?? c)
    .replace(DOT_LIKE, ".")
    .replace(APOSTROPHES, "'")
    // Arabizi letters written digit + apostrophe: 7'=خ 3'=غ 9'=ض
    .replace(/7'(?=[a-z])/g, "5")
    .replace(/3'(?=[a-z])/g, "gh")
    .replace(/9'(?=[a-z])/g, "d");
}

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "l", "+": "t", "€": "e",
};

/** Collapses letter runs: كلللب → كلب, fuuuck → fuck. */
function key(s: string): string {
  return s.replace(/(.)\1+/gu, "$1");
}

function runs(s: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const ch of Array.from(s)) {
    const last = out[out.length - 1];
    if (last && last[0] === ch) last[1]++;
    else out.push([ch, 1]);
  }
  return out;
}

/**
 * Same letters as the entry, each at least as repeated: "assss" = "ass" but
 * "as" ≠ "ass". In Latin words a doubled consonant is real spelling, not
 * stretching ("annals" ≠ "anal"), so only vowels or runs of 3+ count as
 * stretched. Arabic never doubles letters in writing, so any run does.
 */
function sameWord(candidate: string, entryToken: string): boolean {
  if (key(candidate) !== key(entryToken)) return false;
  const a = runs(candidate);
  const b = runs(entryToken);
  if (a.length !== b.length) return false;
  return a.every(([ch, n], i) => {
    const want = b[i][1];
    if (n < want) return false;
    return n === want || n >= 3 || !/[b-df-hj-np-tv-z]/.test(ch);
  });
}

// ---------------------------------------------------------------------------
// Compiled lists
// ---------------------------------------------------------------------------

type Group = "always" | "addressed" | "soft";
type Mode = "full" | "tight" | "exact";

interface Entry {
  text: string;
  tokens: string[];
  latin: boolean;
  mode: Mode;
  group: Group;
  /** ADDRESSED word that is also an everyday noun (كلب، البقرة، pig). */
  literal: boolean;
  /** English ADDRESSED word: no Arabizi endings, so "Fateh" is not fat + eh. */
  english: boolean;
}

const ARABIC_LETTER = /[\u0621-\u064A\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FF]/;

function normalizeEntry(s: string): string {
  return foldForFilter(s).replace(/\s+/g, " ").trim();
}

interface Index {
  single: Map<string, Entry[]>;
  phrases: Map<string, Entry[]>;
  latinAlways: string[];
}

function buildIndex(): Index {
  const single = new Map<string, Entry[]>();
  const phrases = new Map<string, Entry[]>();
  const latinAlways: string[] = [];
  const expandAll = (list: readonly string[]) =>
    new Set(list.flatMap((p) => expandPattern(p.replace(/^=/, ""))).map(normalizeEntry));
  const literal = expandAll(LITERAL);
  const english = expandAll(ADDRESSED_EN);

  const add = (list: readonly string[], group: Group) => {
    for (const pattern of list) {
      const exact = pattern.startsWith("=");
      for (const variant of expandPattern(exact ? pattern.slice(1) : pattern)) {
        const text = normalizeEntry(variant);
        if (!text) continue;
        const tokens = text.split(" ");
        const latin = !ARABIC_LETTER.test(text);
        let mode: Mode = exact ? "exact" : "full";
        if (mode === "full" && tokens.length === 1 && tokens[0].length <= (latin ? 3 : 2)) mode = "tight";
        const entry: Entry = {
          text,
          tokens,
          latin,
          mode,
          group,
          literal: literal.has(text),
          english: group === "addressed" && english.has(text),
        };
        const bucket = tokens.length === 1 ? single : phrases;
        const k = key(tokens[0]);
        const arr = bucket.get(k);
        if (arr) arr.push(entry);
        else bucket.set(k, [entry]);
        if (latin && group === "always" && tokens.length === 1) latinAlways.push(text);
      }
    }
  };
  add(ALWAYS, "always");
  add(ADDRESSED, "addressed");
  add(SOFT, "soft");
  return { single, phrases, latinAlways };
}

let index: Index | null = null;
function getIndex(): Index {
  return (index ??= buildIndex());
}

const toSet = (words: readonly string[]) => new Set(words.map(normalizeEntry));
const ADDRESS = toSet(ADDRESS_WORDS);
const FILLER = toSet(FILLER_WORDS);
const LINEAGE = toSet(LINEAGE_WORDS);
const EXEMPT = toSet([...FIRST_PERSON_WORDS, ...NEGATION_WORDS]);
const STORY = toSet(STORY_WORDS);
const REPORTING = toSet(REPORTING_WORDS);
const OPINION = toSet(OPINION_WORDS);
const CLAUSE = toSet(CLAUSE_WORDS);
const SPEECH_FILLER = toSet(SPEECH_SKIP);
/** Address words that aim the insult no matter what comes before them. */
const VOCATIVE_WORDS = toSet(["يا", "ياا", "ya", "yaa"]);
/** Insults can also be aimed from after: «غبي انت». Not «يا» — «سورة البقرة يا أستاذ». */
const ADDRESS_AFTER = toSet(["انت", "انتي", "انتم", "انتو"]);
const SURNAME_SET = toSet(SURNAMES);
const NAME_COLLISION_SET = toSet(NAME_COLLISIONS);
/** «الأستاذ الحمار», «المعلمة الغبية», "teacher pig" — the insult is aimed at the named teacher. */
const TITLE_BEFORE = toSet([
  "استاذ", "استاذه", "الاستاذ", "الاستاذه", "استاذي", "استاذتي", "استاذنا", "استاذتنا",
  "معلم", "معلمه", "المعلم", "المعلمه", "معلمي", "معلمتي", "معلمنا", "معلمتنا",
  "مدرس", "مدرسه", "المدرس", "المدرسه", "دكتور", "دكتوره", "الدكتور", "الدكتوره", "دكتوري",
  "دكتورتي", "ابله", "الابله", "مس", "ميس", "مستر",
  "teacher", "mr", "mrs", "ms", "miss", "mister", "dr", "doctor", "prof", "professor",
]);
const LATIN_ARTICLES = new Set(["el", "al", "il", "l"]);
/** "you fool me", "you trash everyone" — a verb, not an insult. */
const OBJECT_PRONOUNS = new Set(["me", "us", "him", "her", "them", "it", "everyone", "everybody"]);
/** SAFE_PHRASES as token lists, keyed by the key() of their first word. */
const SAFE = new Map<string, string[][]>();
for (const p of SAFE_PHRASES) {
  const words = normalizeEntry(p).split(" ");
  const k = key(words[0]);
  SAFE.set(k, [...(SAFE.get(k) ?? []), words]);
}

// ---------------------------------------------------------------------------
// Tokens + clitics
// ---------------------------------------------------------------------------

interface Tok {
  /** Arabic word, or Latin letters+digits as typed (Arabizi keeps its digits). */
  s: string;
  ar: boolean;
  num: boolean;
  /** Latin only: leet-decoded letters (sh1t → shit, @ss → ass). */
  leet: string;
  /** Latin only: masked spelling like f*ck, as a regex source. */
  wild: string | null;
  /** Built by joining spelled-out letters (ك ل ب) — itself a sign of dodging the filter. */
  spelled?: boolean;
}

const TOKEN_RE = /[\u0621-\u064A\u066E-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FF]+|[a-z0-9@$!*|+\u20AC]+/g;

function tokenize(folded: string): Tok[] {
  const toks: Tok[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(folded))) {
    const raw = m[0];
    if (ARABIC_LETTER.test(raw[0])) {
      toks.push({ s: raw, ar: true, num: false, leet: raw, wild: null });
      continue;
    }
    const t = raw.replace(/^[!|+*]+|[!|+]+$/g, "");
    if (!t) continue;
    if (/^\+?\d+$/.test(t)) {
      toks.push({ s: t.replace("+", ""), ar: false, num: true, leet: "", wild: null });
      continue;
    }
    const base = t.replace(/[^a-z0-9]/g, "");
    if (!base) continue;
    const decoded = t.replace(/[0-9@$!|+€]/g, (c) => LEET[c] ?? "").replace(/[^a-z*]/g, "");
    const letters = decoded.replace(/\*/g, "");
    const wild =
      decoded.includes("*") && letters.length >= 2 ? `^${decoded.replace(/\*/g, "[a-z]")}$` : null;
    toks.push({ s: base, ar: false, num: false, leet: letters, wild });
  }
  return toks;
}

/** Joins runs of single letters: «ك ل ب», "f u c k", «ك.ل.ب» → one token. */
function joinSingles(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  let joined = false;
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    const single = (x: Tok) => !x.num && x.s.length === 1;
    if (single(t)) {
      let j = i;
      while (j < toks.length && single(toks[j]) && toks[j].ar === t.ar) j++;
      if (j - i >= 2) {
        const run = toks.slice(i, j);
        const s = run.map((x) => x.s).join("");
        const leet = t.ar ? s : run.map((x) => x.leet).join("");
        out.push({ s, ar: t.ar, num: false, leet, wild: null, spelled: true });
        joined = true;
        i = j;
        continue;
      }
    }
    out.push(t);
    i++;
  }
  return joined ? out : null;
}

const AR_PREFIXES = [
  "", "و", "ف", "ب", "ل", "ك", "ال", "لل", "يا", "يال", "وال", "فال", "بال", "كال", "ولل", "فلل",
  "وب", "ول", "وك", "فب", "فل", "فك", "وبال", "وكال", "فبال", "ويا", "هال", "وهال",
];
// Suffixes starting with ت follow a ة that turned into ت (قحبتك → قحبه + ك).
const AR_SUFFIXES = [
  "", "ه", "ها", "هم", "هن", "هما", "ك", "كم", "كن", "كما", "ي", "ني", "نا", "ين", "ون", "ات", "ان",
  "يه", "تي", "تك", "ته", "تها", "تهم", "تكم", "تنا",
];
const AR_TIGHT_PREFIXES = new Set(["", "ال", "يا", "يال"]);
const AR_TIGHT_SUFFIXES = new Set(["", "ك", "كم", "ها", "ه", "هم", "ي"]);
const AR_EXACT_PREFIXES = new Set(["", "ال", "يا", "يال", "و"]);
const AR_ADDRESSED_SUFFIXES = new Set(["", "ه", "ين", "ون", "ات", "ان"]);

const EN_SUFFIXES = ["", "s", "es", "ed", "ing", "in", "ings"];
const AZ_PREFIXES = ["", "ya", "el", "al", "il", "w", "wel", "wal"];
const AZ_SUFFIXES = ["", "ak", "ek", "ik", "ha", "k", "i", "kom", "a", "e", "ah", "eh"];
const LAT_TIGHT_SUFFIXES = new Set(["", "s", "es", "i", "ak", "ek", "k"]);
const LAT_TIGHT_PREFIXES = new Set(["", "ya", "el", "al"]);
const LAT_ADDRESSED_SUFFIXES = new Set(["", "s", "a", "e", "ah", "eh"]);
const LAT_ADDRESSED_PREFIXES = new Set(["", "ya", "el", "al", "il"]);
const LAT_FULL_SUFFIXES = new Set([...EN_SUFFIXES, ...AZ_SUFFIXES.filter((s) => !/^[ae]h?$/.test(s))]);
const VOCATIVE = new Set(["يا", "يال", "ويا", "ya"]);

interface Candidate {
  stem: string;
  prefix: string;
  suffix: string;
}

function arabicCandidates(t: string): Candidate[] {
  const out: Candidate[] = [];
  for (const prefix of AR_PREFIXES) {
    if (!t.startsWith(prefix)) continue;
    const rest = t.slice(prefix.length);
    if (rest.length < 2) continue;
    for (const suffix of AR_SUFFIXES) {
      if (!rest.endsWith(suffix) || rest.length - suffix.length < 2) continue;
      let stem = rest.slice(0, rest.length - suffix.length);
      if (suffix.startsWith("ت")) stem += "ه";
      out.push({ stem, prefix, suffix });
    }
  }
  return out;
}

function latinCandidates(tok: Tok): Candidate[] {
  const out: Candidate[] = [];
  const forms = tok.leet && tok.leet !== tok.s ? [tok.leet, tok.s] : [tok.s];
  for (const form of forms) {
    for (const suffix of EN_SUFFIXES) {
      if (form.endsWith(suffix) && form.length - suffix.length >= 2) {
        out.push({ stem: form.slice(0, form.length - suffix.length), prefix: "", suffix });
      }
    }
    for (const prefix of AZ_PREFIXES) {
      if (!form.startsWith(prefix)) continue;
      const rest = form.slice(prefix.length);
      for (const suffix of AZ_SUFFIXES) {
        if (!prefix && !suffix) continue;
        if (rest.endsWith(suffix) && rest.length - suffix.length >= 2) {
          out.push({ stem: rest.slice(0, rest.length - suffix.length), prefix, suffix });
        }
      }
    }
  }
  return out;
}

function allowed(e: Entry, c: Candidate): boolean {
  if (e.latin) {
    if (e.group === "addressed") {
      if (!LAT_ADDRESSED_PREFIXES.has(c.prefix)) return false;
      return e.english ? c.suffix === "" || c.suffix === "s" : LAT_ADDRESSED_SUFFIXES.has(c.suffix);
    }
    if (e.mode === "exact") return !c.suffix && (!c.prefix || c.prefix === "ya");
    if (e.mode === "tight") return LAT_TIGHT_PREFIXES.has(c.prefix) && LAT_TIGHT_SUFFIXES.has(c.suffix);
    return LAT_FULL_SUFFIXES.has(c.suffix);
  }
  if (e.mode === "exact") return !c.suffix && AR_EXACT_PREFIXES.has(c.prefix);
  if (e.group === "addressed") return AR_ADDRESSED_SUFFIXES.has(c.suffix);
  if (e.mode === "tight") return AR_TIGHT_PREFIXES.has(c.prefix) && AR_TIGHT_SUFFIXES.has(c.suffix);
  return true;
}

interface Hit {
  entry: Entry;
  start: number;
  end: number;
  prefix: string;
  /** Letters of the token covered by prefix + stem (the rest is a suffix). */
  cover: number;
}

function singleHits(tok: Tok, i: number, groups?: Set<Group>): Hit[] {
  if (tok.num) return [];
  const { single } = getIndex();
  const hits: Hit[] = [];
  const cands = tok.ar ? arabicCandidates(tok.s) : latinCandidates(tok);
  for (const c of cands) {
    for (const e of single.get(key(c.stem)) ?? []) {
      if (e.latin === tok.ar) continue;
      if (groups && !groups.has(e.group)) continue;
      if (!sameWord(c.stem, e.tokens[0]) || !allowed(e, c)) continue;
      const cover = c.prefix.length + c.stem.length - (c.suffix.startsWith("ت") ? 1 : 0);
      hits.push({ entry: e, start: i, end: i + 1, prefix: c.prefix, cover });
    }
  }
  return hits;
}

function tokenIs(tok: Tok, word: string): boolean {
  return sameWord(tok.s, word) || (!tok.ar && !!tok.leet && sameWord(tok.leet, word));
}

function phraseHits(toks: Tok[], i: number): Hit[] {
  const tok = toks[i];
  if (tok.num) return [];
  const { phrases } = getIndex();
  const hits: Hit[] = [];
  const firsts: Candidate[] = [{ stem: tok.s, prefix: "", suffix: "" }];
  if (!tok.ar && tok.leet && tok.leet !== tok.s) firsts.push({ stem: tok.leet, prefix: "", suffix: "" });
  for (const p of tok.ar ? ["و", "ف", "يا"] : ["w", "ya"]) {
    if (tok.s.startsWith(p) && tok.s.length - p.length >= 2) firsts.push({ stem: tok.s.slice(p.length), prefix: p, suffix: "" });
  }
  for (const c of firsts) {
    for (const e of phrases.get(key(c.stem)) ?? []) {
      if (e.latin === tok.ar || !sameWord(c.stem, e.tokens[0])) continue;
      const end = i + e.tokens.length;
      if (end > toks.length) continue;
      let ok = true;
      for (let k = 1; k < e.tokens.length && ok; k++) ok = tokenIs(toks[i + k], e.tokens[k]);
      if (ok) hits.push({ entry: e, start: i, end, prefix: c.prefix, cover: tok.s.length });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function word(tok: Tok | undefined): string {
  return tok ? tok.s : "";
}

/** «وانت» → «انت»; also checks the bare token. */
function inSet(set: Set<string>, tok: Tok | undefined): boolean {
  if (!tok || tok.num) return false;
  const w = word(tok);
  if (set.has(w)) return true;
  return tok.ar && (w.startsWith("و") || w.startsWith("ف")) && set.has(w.slice(1));
}

/** Reported speech just before the address word: «قالوا انك…», «ما عمرك قلت لي انت…». */
function isReported(toks: Tok[], addressAt: number): boolean {
  let j = addressAt - 1;
  for (let skipped = 0; j >= 0 && skipped < 2 && inSet(SPEECH_FILLER, toks[j]); skipped++) j--;
  if (j < 0) return false;
  return inSet(REPORTING, toks[j]) || (inSet(OPINION, toks[j]) && inSet(STORY, toks[j - 1]));
}

/**
 * "hard" when the insult is aimed at someone (يا حمار، انت غبي، والله انك تيس),
 * "soft" when that address is reported speech (كانوا يقولون انك ظالم).
 */
function isAddressed(toks: Tok[], hit: Hit): "hard" | "soft" | null {
  if (VOCATIVE.has(hit.prefix)) return "hard";
  if (hit.entry.latin && inSet(OBJECT_PRONOUNS, toks[hit.end])) return null;
  let j = hit.start - 1;
  for (let skipped = 0; j >= 0 && skipped < 2 && inSet(FILLER, toks[j]); skipped++) j--;
  if (j >= 0 && inSet(ADDRESS, toks[j])) {
    return inSet(VOCATIVE_WORDS, toks[j]) || !isReported(toks, j) ? "hard" : "soft";
  }
  // «غبي انت» — a bare «انت» right after; not «…غبي وانت علمتني» or «مو اغبياء انتو».
  const next = toks[hit.end];
  if (!hit.entry.literal && next && !next.num && ADDRESS_AFTER.has(word(next)) && !inSet(EXEMPT, toks[hit.start - 1])) {
    return "hard";
  }
  return null;
}

/** Title word as written after a preposition: «للأستاذ» → «الاستاذ», «بالمعلم» → «المعلم». */
function titleForm(tok: Tok | undefined): string {
  if (!tok || !tok.ar) return word(tok);
  const w = word(tok).replace(/^[وف](?=ال|لل|ب|ل)/, "");
  if (w.startsWith("لل")) return "ال" + w.slice(2);
  if (/^[لب]/.test(w) && w.length - 1 >= 4) return w.slice(1);
  return w;
}

/**
 * A teacher title right before the insult (fillers allowed in between). An
 * indefinite title + «الـ» + everyday noun reads like a surname («أستاذ
 * الحمار»), so that case only gets a human look.
 */
function afterTitle(toks: Tok[], hit: Hit): "hard" | "soft" | null {
  let j = hit.start - 1;
  for (let skipped = 0; j >= 0 && skipped < 2 && inSet(FILLER, toks[j]); skipped++) j--;
  const prev = toks[j];
  if (!prev) return null;
  const title = titleForm(prev);
  if (!inSet(TITLE_BEFORE, prev) && !TITLE_BEFORE.has(title)) return null;
  if (CLAUSE.has(hit.entry.text) && !hit.prefix.endsWith("ال")) return "soft";
  const surnameLike = hit.entry.literal && hit.prefix.endsWith("ال") && prev.ar && !title.startsWith("ال");
  return surnameLike ? "soft" : "hard";
}

/** «ابن الكلب», «يا بنت الحمار», "ibn el kalb" — but not «كنت ولد جاهل». */
function isLineage(toks: Tok[], hit: Hit): boolean {
  let j = hit.start - 1;
  if (j >= 0 && (LATIN_ARTICLES.has(word(toks[j])) || word(toks[j]) === "ال")) j--;
  const prev = toks[j];
  if (!inSet(LINEAGE, prev)) return false;
  if (inSet(STORY, toks[j - 1]) || inSet(EXEMPT, toks[j - 1])) return false;
  // «بن» is also part of every other name (خالد بن سعد) — require the article.
  if (word(prev) === "بن") return hit.prefix.endsWith("ال");
  return true;
}

/** «هالحمار ما يعرف يشرح» — an everyday noun pointed at someone. */
function isPointedAt(hit: Hit): boolean {
  return hit.prefix === "هال" || hit.prefix === "وهال";
}

function isExempt(toks: Tok[], start: number): boolean {
  return inSet(EXEMPT, toks[start - 1]) || inSet(EXEMPT, toks[start - 2]);
}

function isStandalone(toks: Tok[], hit: Hit, kind: TextKind): boolean {
  return toks.every((t, idx) => {
    if (idx >= hit.start && idx < hit.end) return true;
    if (t.num || t.s.length < 2 || inSet(ADDRESS, t) || inSet(FILLER, t)) return true;
    return kind === "name" && stripTitles(t.s) === "";
  });
}

// ---------------------------------------------------------------------------
// Word check
// ---------------------------------------------------------------------------

const ALWAYS_ONLY = new Set<Group>(["always"]);

/**
 * Safe words only forgive clear stretching (runs of 3+): «بانيكك» is بـ + انيكك,
 * not a stretched «بانيك».
 */
function safeTokenIs(tok: Tok, w: string): boolean {
  if (!tok.ar) return tokenIs(tok, w);
  if (key(tok.s) !== key(w)) return false;
  const a = runs(tok.s);
  const b = runs(w);
  return a.length === b.length && a.every(([, n], i) => n === b[i][1] || n >= 3);
}

/** Token indexes covered by a SAFE_PHRASES occurrence. */
function safeSpans(toks: Tok[]): Set<number> {
  const covered = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const phrases = SAFE.get(key(t.s)) ?? (!t.ar && t.leet ? SAFE.get(key(t.leet)) : undefined) ?? [];
    for (const phrase of phrases) {
      if (i + phrase.length > toks.length) continue;
      if (phrase.every((w, k) => safeTokenIs(toks[i + k], w))) {
        for (let k = 0; k < phrase.length; k++) covered.add(i + k);
      }
    }
  }
  return covered;
}

/** What an ADDRESSED hit means where it stands: blocked, a human look, or nothing. */
function judgeAddressed(toks: Tok[], hit: Hit, kind: TextKind): "hard" | "soft" | null {
  const e = hit.entry;
  const addressed = isAddressed(toks, hit);
  // A family name («الأستاذ الخضيري», «إبراهيم السكران»): only a look when someone is called it.
  if (SURNAME_SET.has(e.text) && /^(?:[وفبك]?ال|[وف]?لل)$/.test(hit.prefix)) return addressed ? "soft" : null;
  const titled = afterTitle(toks, hit);
  if (toks[hit.start].spelled || titled === "hard" || isLineage(toks, hit) || addressed === "hard") return "hard";
  if (isStandalone(toks, hit, kind)) return "hard";
  if (addressed === "soft" || titled === "soft" || kind === "name") return "soft";
  if (e.literal) return isPointedAt(hit) ? "soft" : null;
  return isExempt(toks, hit.start) ? null : "soft";
}

const lone = (t: Tok) => t.s.length === 1 && t.s !== "و";
/** Short real words: «انت كل اب…», «يا مس طول بالك» are sentences, not a split كلاب / مسطول. */
const SHORT_WORDS = new Set([
  "من", "في", "ما", "لا", "مو", "ان", "او", "لي", "لك", "له", "بس", "اي", "يا", "هو", "هي", "كل", "عن", "مع",
  "ذا", "ذي", "لو", "كم", "قد", "لم", "لن", "ام", "اب", "اخ", "يد", "ها", "شي", "بل", "ثم", "زي", "كي", "فن",
  "دم", "فم", "حب", "جد", "خط", "سن", "عم", "حي", "مر", "رب", "بن", "بو", "مس",
]);
/**
 * ADDRESSED words are only joined on a clear dodge: a lone letter, a two-letter
 * fragment that isn't a word («حم ار»), or a short tail after a non-word («حيو ان»).
 */
function dodgeRun(run: Tok[]): boolean {
  const frag = (t: Tok) => (lone(t) && !"ادم".includes(t.s)) || (t.s.length === 2 && !SHORT_WORDS.has(t.s));
  const last = run[run.length - 1];
  const head = run[0].s.replace(/^[وفبل]/, "");
  return run.some(frag) || (run.length === 2 && head.length >= 3 && last.s.length <= 2);
}
/** Real two-letter English words that join into a listed word: "an al", "go ok". */
const LATIN_PAIR_WORDS = new Set(["anal", "gook"]);

/** Could these 2–3 neighbouring tokens be one word split to dodge the list? */
function splitRun(run: Tok[]): boolean {
  if (run.some((t) => t.num || t.ar !== run[0].ar)) return false;
  const len = run.map((t) => t.s.length);
  if (run.length === 2) {
    const [a, b] = len;
    if (lone(run[0]) || lone(run[1]) || a + b >= 5) return true;
    return a <= 2 && b <= 2; // Latin 2+2 is checked against the exact word below
  }
  // Three chunks: «يا شر مو طه», «مدرسة الشر مو طه», "f uc k".
  if (!len.some((n) => n <= 2)) return false;
  if (!run[0].ar) return len.every((n) => n <= 2) && run.some(lone);
  const first = run[0].s;
  return len[1] <= 3 && len[2] <= 3 && (len[0] <= 3 || (len[0] <= 5 && /^(?:ال|يا|وال|بال)/.test(first)));
}

function wordCheck(folded: string, kind: TextKind): { hard: string[]; soft: string[] } {
  const hard = new Set<string>();
  const soft = new Set<string>();
  const base = tokenize(folded.replace(DIGITS_IN_ARABIC, "$1"));
  const streams = [base];
  const joined = joinSingles(base);
  if (joined) streams.push(joined);

  for (const toks of streams) {
    const safe = safeSpans(toks);
    for (let i = 0; i < toks.length; i++) {
      if (safe.has(i)) continue;
      for (const hit of [...singleHits(toks[i], i), ...phraseHits(toks, i)]) {
        const e = hit.entry;
        if (e.group === "always") {
          // «مستر ايرك» (Eric): a name after a title or in a name field gets a look, not a block.
          if (NAME_COLLISION_SET.has(e.text) && (kind === "name" || afterTitle(toks, hit))) soft.add(e.text);
          else hard.add(e.text);
        } else if (e.group === "addressed") {
          const verdict = judgeAddressed(toks, hit, kind);
          if (verdict === "hard") hard.add(e.text);
          else if (verdict === "soft") soft.add(e.text);
        } else if (!isExempt(toks, hit.start)) {
          soft.add(e.text);
        }
      }
    }

    // Words split to dodge the list: «شرمو طه», «يا شر مو طه», «يا حما ر», "fu ck", "f uc k".
    // Joined ADDRESSED words only count when aimed at someone.
    for (let i = 0; i + 1 < toks.length; i++) {
      for (const n of [2, 3]) {
        const run = toks.slice(i, i + n);
        if (run.length < n || !splitRun(run) || run.some((_, k) => safe.has(i + k))) continue;
        const s = run.map((t) => t.s).join("");
        const tok: Tok = { s, ar: run[0].ar, num: false, leet: run.map((t) => t.leet).join(""), wild: null };
        const latinShort = !tok.ar && n === 2 && !run.some(lone) && run[0].s.length + run[1].s.length < 5;
        const head = s.length - run[n - 1].s.length;
        for (const h of singleHits(tok, i, tok.ar ? undefined : ALWAYS_ONLY)) {
          const e = h.entry;
          // The word must really span the chunks: not «يا» + حمار, and not «ايرك» + «كان» read as a
          // stretched ك + suffix — the last chunk has to add a letter of its own.
          if (h.prefix.length >= run[0].s.length || key(s.slice(0, h.cover)) === key(s.slice(0, head))) continue;
          if (e.group === "always") {
            if (latinShort && (e.text !== s || LATIN_PAIR_WORDS.has(s))) continue;
            hard.add(e.text);
          } else if (e.group === "addressed" && dodgeRun(run) && judgeAddressed(toks, { ...h, end: i + n }, kind) === "hard") {
            hard.add(e.text);
          }
        }
      }
    }

    // Masked spellings: f*ck, sh*t, b**ch.
    for (const t of toks) {
      if (!t.wild) continue;
      const re = new RegExp(t.wild);
      for (const w of getIndex().latinAlways) {
        if (["", "s", "es", "ed", "ing", "in", "er", "ers"].some((sfx) => re.test(w + sfx))) hard.add(w);
      }
    }

    for (const label of curseSignals(toks)) soft.add(label);
  }
  return { hard: [...hard], soft: [...soft] };
}

// ---------------------------------------------------------------------------
// Curses and threats beyond the fixed phrases (a human look)
// ---------------------------------------------------------------------------

/** «الله يشلك», «ربي ينتقم منك» — God asked to harm someone. */
const PRAYER_LEAD = new Set(["الله", "ربي", "يارب", "اللهم"]);
/** «عساك تنجلط», «انشالله تنشل» — a wish, the verb carries the person. */
const WISH_LEAD = new Set(["عسي", "عساك", "عساه", "عساها", "عساكم", "عساهم", "انشالله", "انشاءالله"]);
const HARM_ROOT =
  /^(?:موت|جلط|شل|خسف|حرق|هلك|دمر|عمي|قبر|كسر|ذبح|فضح|مرض|بلي|سخط|نتقم|عذب|فجر|خنق|قلع|قصف|طيح|دعس|دهس|سحق|ياخذ|ياخد)/;
const OBJECT_SUFFIX = /(?:ك|كم|كي|ه|ها|هم)$/;
const HARM_TARGET = new Set([
  "فيك", "بك", "منك", "عليك", "فيه", "به", "منه", "عليه", "فيها", "بها", "منها", "عليها", "فيكم", "منكم",
  "روحك", "راسك", "حظك", "عمرك", "قلبك", "وجهك", "عيونك", "ايدك", "رجولك",
]);
/** «انشالله تكسر الدنيا» is slang for doing great. */
const SLANG_OBJECT = new Set(["الدنيا", "الدنيه", "الارض", "الساحه", "الاختبار", "الاختبارات", "الملعب", "المسرح"]);
/** «بكسرك», «بدعسك», «اخنقك» — I'll hurt you. */
const THREAT = /^(?:ب|ا|ح|ه)(?:كسر|ضرب|ذبح|دهس|دعس|طعن|فجر|حرق|خنق|قطع|دفن|سحق|فقع|سلخ|طق)(?:ك|كم|كي)$/;

function harmVerb(w: string): boolean {
  const forms = [w];
  if (/^[يتن]/.test(w)) forms.push(w.slice(1));
  if (/^[يت][نت]/.test(w)) forms.push(w.slice(2));
  return forms.some((f) => HARM_ROOT.test(f));
}

function curseSignals(toks: Tok[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t.ar) continue;
    const w = word(t).replace(/^و(?=الله|ربي|عسي|عسا)/, "");
    if (THREAT.test(w)) out.push("threat?");
    let prayer = PRAYER_LEAD.has(w);
    if (!prayer && !WISH_LEAD.has(w)) continue;
    // «عسى الله …»: the verb comes after the second lead word, and God is the subject again.
    let j = i + 1;
    if (toks[j] && PRAYER_LEAD.has(word(toks[j]))) {
      prayer = true;
      j++;
    }
    const verb = toks[j];
    if (!verb || !verb.ar || !harmVerb(word(verb))) continue;
    // «عساك تقبرني» (may you bury me) is an endearment: the harm is aimed at the writer.
    if (/(?:ني|نا)$/.test(word(verb))) continue;
    const aimed = OBJECT_SUFFIX.test(word(verb)) || inSet(HARM_TARGET, toks[j + 1]);
    if (prayer ? aimed : !SLANG_OBJECT.has(word(toks[j + 1]))) out.push("curse?");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Contact details, links, spam
// ---------------------------------------------------------------------------

// Spaces, dashes, dots, commas (، ,) or emoji may separate digit groups: «055🌸123🌸4567».
// Not × = ÷ — «٧×٨=٥٦، ٩×٩=٨١» is a times table.
const PHONE_RUN = /\+?\d(?:[\s\-.()/_\u2013\u2014\u060C,;:|*#~\p{Extended_Pictographic}\u200D\uFE0F]{0,3}\d){6,}/gu;
const YEAR = /^(?:1[34]\d\d|19\d\d|20\d\d)$/;

function isPhoneNumber(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  const groups = raw.split(/\D+/).filter(Boolean);
  if (/^(?:00966|966|0)?5\d{8}$/.test(digits)) return true; // Saudi mobile
  if (/^0\d{9}$/.test(digits)) return true; // Saudi landline / any local 10-digit
  if (/^(?:800|9200)\d{5,7}$/.test(digits)) return true; // toll-free / unified numbers
  if (raw.trim().startsWith("+") && digits.length >= 8) return true;
  // A list or a date range («100، 100، 99», «1/9/2023 – 30/6/2024») only counts as an international number.
  if (/[,\u060C;:/]/.test(raw)) return /^00\d{9,13}$/.test(digits);
  // Long numbers are phone numbers unless they're a list of years (2016 - 2019 - 2022).
  if (digits.length >= 10 && digits.length <= 15) return !(groups.length > 1 && groups.every((g) => YEAR.test(g)));
  return false;
}

const EMAIL =
  /[a-z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[a-z0-9-]+(?:\.[a-z0-9-]+)*\s?(?:\.|\(dot\)|\[dot\])\s?[a-z]{2,}/;
const EMAIL_WORDS = /(?:^|[^a-z0-9])[a-z0-9._-]{2,}\s+at\s+[a-z0-9-]{2,}\s+dot\s+[a-z]{2,}(?![a-z])/;
const MAIL_PROVIDER =
  /(?:@|[a-z0-9._-]{3,}\s+at)\s?(?:gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|proton)(?![a-z])/;
// «noura.ksa22 جيميل»
const MAIL_PROVIDER_AR = /[a-z0-9._-]{3,}\s*(?:@|at)?\s*(?:جيميل|جي ميل|هوتميل|هوت ميل|اوتلوك|ياهو|ايكلاود)/;
const HANDLE = /(?:^|[^a-z0-9_.@])@[a-z0-9_][a-z0-9_.]{1,29}/;
// "@ nourahh" — but "meet @ school" is just "at".
const SPACED_HANDLE = /(?:^|[^a-z0-9_.@])@\s+([a-z][a-z0-9_.]{2,29})/;
const PLATFORM =
  "(?:snap(?:chat)?|insta(?:gram)?|twitter|tiktok|tik tok|telegram|whatsapp|facebook|youtube|threads|e-?mail|" +
  "سناب شات|سنابشات|سنابي|سناب|انستقرام|انستغرام|انستجرام|انستا|انستي|تويتر|تيك توك|تيكتوك|" +
  "تلقرام|تليجرام|تيليجرام|واتساب|واتس|فيسبوك|فيس|حسابي|يوزري|يوزر|يوتيوب|قناتي|ايميلي|ايميل|بريدي)";
// "سناب: noura" / "insta noura_22" — a platform name followed by a handle.
const PLATFORM_HANDLE = new RegExp(
  `(?:^|[^a-z])${PLATFORM}\\s*(?:[:\\-\\u2013]\\s*@?[a-z0-9_.]{3,30}|@?(?=[a-z0-9_.]*[0-9_.])[a-z][a-z0-9_.]{2,29})`,
);

// ".me" is also "Thank you.Me and…" — only a domain when not followed by more English.
const TLDS =
  "com|net|org|sa|me(?!\\s+[a-z])|io|co|ly|gg|tv|app|info|xyz|link|site|online|store|shop|club|" +
  "biz|edu|gov|ae|kw|qa|bh|om|eg|ru|cn|tk|ws|cc|pw|ml|cf|gq|dev|vip";
const URL_SCHEME = /(?:https?|hxxps?|ftp)\s*:\s*\/\//;
const WWW = /(?:^|[^a-z0-9])www\s?\./;
const SHORTENER =
  /(?:^|[^a-z0-9])(?:t\.me|wa\.me|bit\.ly|goo\.gl|tinyurl\.com|linktr\.ee|cutt\.ly|rb\.gy|is\.gd|youtu\.be|fb\.me)(?![a-z0-9])/;
// "bit ly/abc12"
const SPACED_SHORTENER =
  /(?:^|[^a-z0-9])(?:bit\s+ly|t\s+me|wa\s+me|cutt\s+ly|linktr\s+ee|tinyurl\s+com|youtu\s+be)\s*\/\s*[a-z0-9]/;
const BARE_DOMAIN = new RegExp(`(?:^|[^a-z0-9@._-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?![a-z0-9-])`);
const SPACED_DOMAIN = /(?:^|[^a-z0-9])[a-z0-9-]{2,}\s*(?:\(dot\)|\[dot\]|\sdot\s|دوت|نقطه)\s*(?:com|net|org|sa)(?![a-z0-9])/;
const ARABIC_DOMAIN = /(?:دوت|نقطه)\s?(?:كوم|نت|اورج)/;

/** "t . me", "example[.]com", "mysite. com" → plain dots, for the link and email rules. */
function undisguiseDots(s: string): string {
  return s
    .replace(/\s*[[(]\s*(?:\.|dot)\s*[\])]\s*/g, ".")
    .replace(/([a-z0-9])\s+\.\s*(?=[a-z0-9])/g, "$1.")
    .replace(/([a-z0-9])\.\s+(?=(?:com|net|org)(?![a-z]))/g, "$1.");
}

// Digits written as words: «صفر خمسة خمسة واحد…».
const DIGIT_WORDS: Record<string, string> = {};
for (const [d, words] of [
  ["0", "صفر زيرو zero"],
  ["1", "واحد one"],
  ["2", "اثنين اثنان ثنين اتنين two"],
  ["3", "ثلاثه ثلاث تلاته تلات three"],
  ["4", "اربعه اربع four"],
  ["5", "خمسه خمس five"],
  ["6", "سته ست six"],
  ["7", "سبعه سبع seven"],
  ["8", "ثمانيه ثمان ثمنيه تمانيه eight"],
  ["9", "تسعه تسع nine"],
]) {
  for (const w of words.split(" ")) DIGIT_WORDS[w] = d;
}

function digitOf(t: Tok): string | null {
  if (t.num) return t.s;
  const w = t.s;
  if (w in DIGIT_WORDS) return DIGIT_WORDS[w];
  if (t.ar && w.startsWith("و") && w.slice(1) in DIGIT_WORDS) return DIGIT_WORDS[w.slice(1)];
  return null;
}

/** A phone number spelled (partly) in words → "phone"; a suspicious run of digit words → "digits?". */
function spelledNumber(toks: Tok[], kind: TextKind): { hard: boolean; soft: boolean } {
  let soft = false;
  for (let i = 0; i < toks.length; ) {
    let j = i;
    let words = 0;
    const groups: string[] = [];
    for (let d: string | null; j < toks.length && (d = digitOf(toks[j])) !== null; j++) {
      groups.push(d);
      if (!toks[j].num) words++;
    }
    if (words > 0) {
      const digits = groups.join("");
      if (isPhoneNumber(groups.join(" ")) || /^(?:00966|966|0)?5\d{8}$/.test(digits)) return { hard: true, soft };
      if ((words >= 4 && /^(?:05|5|00|966)/.test(digits)) || (kind !== "body" && words >= 3)) soft = true;
    }
    i = j > i ? j : i + 1;
  }
  return { hard: false, soft };
}

function phoneOrEmail(s: string, plain: string, spelledPhone: boolean): string | null {
  PHONE_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_RUN.exec(s))) if (isPhoneNumber(m[0])) return "phone";
  if (spelledPhone) return "phone";
  if (EMAIL.test(plain) || EMAIL_WORDS.test(plain) || MAIL_PROVIDER.test(plain) || MAIL_PROVIDER_AR.test(plain)) {
    return "email";
  }
  return null;
}

/** Words after "@ " or a platform name that are ordinary English, not a username. */
const NOT_A_HANDLE = new Set(
  (
    "chat story stories app book tok live reels reel post posts group streak streaks account page profile " +
    "video videos photo photos pic pics channel status filter filters message messages followers " +
    "the and was were with when where what about from for you your our his her their too also every all " +
    "but then this that are has had have not just still even ever day days time class school home work " +
    "night lunch recess break the"
  ).split(" "),
);

function handleMatch(s: string): string | null {
  if (HANDLE.test(s) || PLATFORM_HANDLE.test(s)) return "handle";
  const spaced = SPACED_HANDLE.exec(s);
  return spaced && !NOT_A_HANDLE.has(spaced[1]) ? "handle" : null;
}

const PLATFORM_WORDS = new Set([
  "سناب", "سنابي", "سنابشات", "انستقرام", "انستغرام", "انستجرام", "انستا", "انستي", "انستاي", "تويتر",
  "تيك", "تيكتوك", "تلقرام", "تليجرام", "تيليجرام", "تلجرام", "تيليقرام", "واتساب", "واتس", "فيسبوك",
  "فيس", "حسابي", "يوزري", "يوزر", "يوتيوب", "قناتي", "ايميلي", "ايميل", "بريدي", "ثريدز", "تابعوني",
  "تابعونا", "تتابعون", "تتابعوني", "ضيفوني", "اضيفوني",
  "snap", "snapchat", "insta", "instagram", "ig", "twitter", "tiktok", "tik", "telegram", "whatsapp",
  "facebook", "fb", "youtube", "yt", "threads", "email",
]);

function isPlatformWord(t: Tok): boolean {
  if (t.num) return false;
  if (PLATFORM_WORDS.has(t.s)) return true;
  return t.ar && PLATFORM_WORDS.has(t.s.replace(/^(?:[وفبل]|[وفب]?ال|عال)/, ""));
}

/** «سنابي nourah», "insta nouraksa": a platform name, then a Latin word that may be a username. */
function platformHandle(toks: Tok[]): boolean {
  for (let i = 0; i < toks.length; i++) {
    if (!isPlatformWord(toks[i])) continue;
    for (let j = i + 1, arabic = 0; j < toks.length && j <= i + 3; j++) {
      const t = toks[j];
      if (t.num || isPlatformWord(t)) continue;
      if (t.ar) {
        if (++arabic > 2) break;
        continue;
      }
      if (t.s.length >= 3 && !NOT_A_HANDLE.has(t.s)) return true;
      break;
    }
  }
  return false;
}

function linkMatch(s: string): string | null {
  if (URL_SCHEME.test(s) || WWW.test(s) || SHORTENER.test(s) || SPACED_SHORTENER.test(s)) return "url";
  if (BARE_DOMAIN.test(s) || SPACED_DOMAIN.test(s) || ARABIC_DOMAIN.test(s)) return "domain";
  return null;
}

// Stretched Arabic words (شكرااااا، هههههه) and emoji rows are how people
// write here, so they get more room before counting as spam.
const REPEAT_LIMIT = 12;
const REPEAT_LIMIT_LENIENT = 20;

function spamMatch(folded: string, toks: Tok[], kind: TextKind): string | null {
  let prev = "";
  let run = 0;
  for (const ch of Array.from(folded)) {
    if (/\s/.test(ch)) {
      prev = "";
      run = 0;
      continue;
    }
    run = ch === prev ? run + 1 : 1;
    prev = ch;
    const cp = ch.codePointAt(0) ?? 0;
    const lenient = ARABIC_LETTER.test(ch) || cp >= 0x1f000 || (cp >= 0x2190 && cp <= 0x2bff);
    if (run >= (lenient ? REPEAT_LIMIT_LENIENT : REPEAT_LIMIT)) return "spam:repeat";
  }
  if (kind !== "body") return null;

  if (!/[a-z]/.test(folded) && !ARABIC_LETTER.test(folded)) return "spam:no_letters";

  const words = toks.filter((t) => !t.num).map((t) => key(t.s));
  const counts = new Map<string, number>();
  let streak = 1;
  for (let i = 0; i < words.length; i++) {
    counts.set(words[i], (counts.get(words[i]) ?? 0) + 1);
    streak = i > 0 && words[i] === words[i - 1] ? streak + 1 : 1;
    if (streak >= 8) return "spam:repeated_word";
  }
  for (const n of counts.values()) {
    if (n >= 8 && n / words.length >= 0.35) return "spam:repeated_word";
  }
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Checks one piece of user text against the word lists, contact/link rules and
 * spam heuristics. `kind` tunes the rules per field (names vs. letter body).
 */
export function checkText(text: string, opts: { kind?: TextKind } = {}): CheckResult {
  const kind = opts.kind ?? "body";
  if (!text || !text.trim()) return { ok: true, reason: null, matches: [], soft: [] };
  const folded = foldForFilter(text);

  const words = wordCheck(folded, kind);
  const toks = tokenize(folded);
  const spelled = spelledNumber(toks, kind);
  const soft = words.soft;
  if (spelled.soft) soft.push("digits?");
  if (platformHandle(toks)) soft.push("handle?");
  if (words.hard.length) return { ok: false, reason: "profanity", matches: words.hard, soft };

  // Emails contain a domain and profile links contain a handle, so the order matters.
  const plain = undisguiseDots(folded);
  const contact = phoneOrEmail(folded, plain, spelled.hard);
  if (contact) return { ok: false, reason: "contact_info", matches: [contact], soft };

  const link = linkMatch(plain);
  if (link) return { ok: false, reason: "link", matches: [link], soft };

  const handle = handleMatch(folded);
  if (handle) return { ok: false, reason: "contact_info", matches: [handle], soft };

  const spam = spamMatch(folded, toks, kind);
  if (spam) return { ok: false, reason: "spam", matches: [spam], soft };

  return { ok: true, reason: null, matches: [], soft };
}

/** Share of letters that are Arabic (0..1), or null when there are too few letters to tell. */
export function arabicShare(text: string): number | null {
  const folded = foldForFilter(text ?? "");
  let arabic = 0;
  let other = 0;
  for (const ch of Array.from(folded)) {
    if (ARABIC_LETTER.test(ch)) arabic++;
    else if (/\p{L}/u.test(ch)) other++;
  }
  const total = arabic + other;
  return total < 10 ? null : arabic / total;
}
