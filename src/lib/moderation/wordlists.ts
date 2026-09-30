// Block lists for the moderation filter. Stored already normalised the way
// normalizeArabic() leaves text (no hamza on alef, ة→ه, ى→ي, lowercase, no
// diacritics). Raw offensive terms live ONLY here and in the tests.
//
// Entry syntax (compiled by ./filter.ts):
//   "word"       — matched as a whole token; Arabic entries also match with
//                  clitics (و ف ب ل ك ال يا … / ه ها ك كم ي ين ون ات نا …).
//                  Entries of ≤2 letters only take pronoun suffixes (كسك، زبه).
//   "=word"      — exact token only (optionally after يا/ال/و); no suffixes.
//                  For stems that collide with names/words (خول ≠ خولة).
//   "a b"        — phrase: consecutive tokens.
//   "x{a,b,}"    — brace alternatives, expanded at load: xa, xb, x.
// Repeated letters are handled by the matcher (كلللب, fuuuck), so list each
// word once in its shortest spelling.

// ---------------------------------------------------------------------------
// ALWAYS — blocked anywhere (profanity, sexual terms, slurs, curses, threats,
// porn/escort spam). Never acceptable on a thank-you wall.
// ---------------------------------------------------------------------------

const ALWAYS_AR_SEXUAL = [
  // genitals
  "كس", "كسم", "كسمك", "كسمكم", "كسمه", "كسمها", "كسامك", "كسامكم", "كسختك", "كسخته", "كسختها",
  "كس امك", "كس ام{ك,كم,ه,ها}", "كس اخت{ك,كم,ه,ها}", "كس خالتك", "كس عمتك",
  "زب", "زبر{ي,ك}", "ايري", "ايرها", "طيز", "طياز", "بزاز",
  // sex acts
  "نيك", "{ا,ي,ت,ن}نيك{ك,كم,ه,ها,هم,}", "منيوك", "منيوكه", "منايك", "منيك", "متناك", "متناكه",
  "نياك", "نياكه", "انتاك", "ينتاك", "تنتاك", "نيج", "{ا,ي,ب}نيج{ك,ه,ها}", "منيوج", "منيوجه",
  "مناويج", "انتاكت",
  "اغتصب{ك,ها,كم}", "باغتصب{ك,ها}",
  // prostitution / sexual slurs
  "شرموط", "شرموطه", "شراميط", "شرمطه", "قحبه", "قحاب", "كحبه", "كحاب",
  "عاهر", "عاهره", "عواهر", "عهر", "داعر", "داعره", "دعاره", "مومس", "مومسات",
  "ممحون", "ممحونه", "فاجر", "فاجره", "فواجر", "زاني", "زانيه", "زواني",
  "لوطي", "لواط", "مخنث", "خنيث", "=خول", "سحاقيه", "سحاقيات", "=سحاق",
  "ديوث", "ديايث", "معرص", "معرصه", "معارص", "=عرص", "=كواد", "=نغل",
  // porn / escort spam
  "سكس", "سكسي", "=بورن", "بورنو", "اباحي", "اباحيه", "اباحيات", "بيدوفيل",
  "صور عاري{ه,ات}", "مقاطع اباحيه", "بنات ليل", "بنات الليل", "بنات للمتعه", "لقاء جنسي",
  "مساج منزلي", "مساج خاص",
];

const ALWAYS_AR_CURSES = [
  // family / lineage insults (see also the lineage rule in filter.ts: ابن + الـ + حيوان)
  "ابن حرام", "ولد حرام", "بنت حرام", "ابن الحرام", "ولد الحرام", "بنت الحرام",
  "عيال حرام", "عيال الحرام", "اولاد حرام", "اولاد الحرام", "ابن زنا", "ولد زنا", "بنت زنا",
  "ابن الزنا", "ولد الزنا", "دين امك", "دين ابوك", "دين اختك", "دين ربك",
  // cursing / damning (incl. religious insults)
  "يلعن", "يلعن{ك,كم,ه,ها,هم}", "لعنك", "لعنكم", "لعنه", "لعنت", "لعنه الله", "لعن الله",
  "يلعن ربك", "يلعن دينك", "يلعن الله", "يلعن النبي", "يلعن الرسول", "يلعن الاسلام",
  "الله ياخذ{ك,كم,ه,ها}", "الله يحرق{ك,كم}", "عساك تموت", "عساه يموت", "عساها تموت",
  "ان شاء الله تموت", "انشالله تموت", "انشاءالله تموت", "روح موت", "روحي موتي",
  "تفو عليك", "تفو عليه", "تفو عليها", "تف عليك", "تف عليه",
  "احا", "خرا", "خراء", "خري", "=خره",
];

const ALWAYS_AR_SLURS = [
  "زنجي", "زنجيه", "زنوج", "رافضي", "روافض", "=الرافضه", "ناصبي", "نواصب",
  "كلاب النار", "طرش بحر", "طرش البحر", "بقايا حجاج", "بقايا الحجاج",
];

const ALWAYS_AR_THREATS = [
  "اقتلك", "اقتلكم", "بقتلك", "بقتلكم", "ابقتلك", "ساقتلك", "هقتلك", "حقتلك", "هموتك",
  "اذبحك", "اذبحكم", "بذبحك", "بذبحكم", "ابذبحك", "ادبحك", "هدبحك",
  "بفجرك", "افجرك", "بفجر المدرسه", "افجر المدرسه", "بحرق المدرسه", "بطعنك", "اطعنك",
  "اقتل نفسك", "اقتلي نفسك", "انتحر احسن لك",
];

const ALWAYS_AR_DRUGS = ["شبو", "ابو هلالين", "بانجو"];

const ALWAYS_EN = [
  "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fuckface", "fuckhead",
  "fuckwit", "fucktard", "fuckoff", "motherfucker", "motherfuckers", "motherfucking", "mofo",
  "fuk", "fuking", "fukin", "fuker", "fck", "fcking", "fckin", "fcker", "fcuk", "fuq", "fking",
  "fkn", "fkin", "phuck", "stfu", "gtfo",
  "shit", "shits", "shitty", "shithead", "shithole", "shitface", "bullshit", "dipshit",
  "horseshit", "shite",
  "bitch", "bitches", "bitchy", "biatch", "biotch", "beyotch",
  "cunt", "dick", "dickhead", "dickheads", "dickhole", "cock", "cocksucker", "cocksuckers",
  "pussy", "pussies", "=ass", "asses", "asshole", "assholes", "arse", "arsehole", "jackass",
  "dumbass", "asswipe", "asshat", "kiss my ass",
  "bastard", "whore", "slut", "sluts", "slutty", "twat", "wank", "wanker", "wanking", "prick",
  "piss", "pissed", "pissing", "piss off", "bollocks", "douche", "douchebag", "screw you",
  // slurs
  "retard", "retarded", "retards", "faggot", "faggots", "fag", "fags", "dyke", "tranny",
  "nigger", "niggers", "nigga", "niggas", "niggaz", "negro", "chink", "spic", "kike", "paki",
  "raghead", "towelhead", "sandnigger", "camel jockey", "wetback", "gook", "coon",
  // sexual / porn / escort spam
  "porn", "porno", "pornhub", "xvideos", "xnxx", "xhamster", "onlyfans", "nudes", "sexy",
  "sexting", "horny", "boobs", "boobies", "tits", "titties", "dildo", "blowjob", "handjob",
  "cumshot", "jizz", "orgasm", "milf", "anal", "rape", "raped", "rapes", "raping",
  "rapist", "rapists", "pedo", "pedos", "pedophile", "pedophiles", "paedophile", "molester",
  "call girl", "call girls", "viagra", "cialis",
  // threats
  "kys", "kill yourself", "kill urself", "kill ur self", "go die", "kill you", "kill u",
  "shoot you", "bomb the school", "shoot up the school",
  "suck my",
];

// Latin-script Arabic. Digits stand for letters (3=ع 7=ح 5=خ 2=ء 6=ط 9=ص 8=ق).
const ALWAYS_ARABIZI = [
  "k{o,u}s", "k{o,u}s{o,u,}m{a,}k", "ksomk", "ksmk", "k{o,u}s{o,e,u}{kh,5}t{a,e}k",
  "z{e,i,o}b", "z{e,i,o}b{i,ak,ek}", "ayr{i,ak}", "{t,6}{e,i}z", "{t,6}{e,i}z{ak,ek,i}",
  "nek", "nek{ak,ek,ha}", "{a,e}nek{ak,ek,ha}", "{a,e}nik{ak,ek}", "many{a,o}k", "many{o,ou}k{a,e}",
  "m{e,i,}tnak", "m{e,i,}tnak{a,e}", "nayek",
  "sharm{o,ou,u}{t,6}{a,ah,e}", "charm{o,ou}t{a,e}", "sharam{e,i}t",
  "{g,q,8,k}a{h,7}b{a,ah,e}",
  "{kh,5}ar{a,ah}", "a7a",
  "day{o,ou,u}{th,s}", "3ars", "3rs", "m3ars", "me3ars", "m3ras", "me3ras",
  "lo{u,o,}{t,6}i", "{kh,5}{a,}wal", "3ahir{a,ah,e}", "3ahra",
  "y{e,i,}l3{a,}n", "y{e,i,}l3{a,}n{ak,ek,k,o,ha,kom}", "yla3n",
];

// ---------------------------------------------------------------------------
// ADDRESSED — insults that are only abusive when aimed at someone:
// «يا حمار», «انت غبي», "you idiot", "ya 7mar", or a field that is just the word.
// Unaddressed use is a SOFT signal (human look), except LITERAL words below
// that are everyday nouns (كلبي الصغير، سورة البقرة، خروف العيد).
// ---------------------------------------------------------------------------

/** Animals / objects: fine in a sentence, insulting when addressed. */
const LITERAL_AR = [
  "حمار", "حماره", "حمير", "كلب", "كلبه", "كلاب", "حيوان", "حيوانه", "تيس", "تيوس", "ثور", "ثيران",
  "بقره", "بقر", "خروف", "خرفان", "جحش", "جحوش", "قرد", "قرده", "قرود", "بغل", "بغال", "=دب", "=دبه",
  "فيل", "بعير", "مطي", "زمال", "=فرخ", "=لوح", "جزمه", "=نعال", "=زفت", "=تبن",
  "هندي", "هنديه", "بنغالي", "سمين", "سمينه", "ساقط", "ساقطه", "معاق", "معاقه", "ابليس",
];

const INSULT_AR = [
  "خنزير", "خنزيره", "خنازير", "غبي", "غبيه", "اغبيا", "اغبياء", "حقير", "حقيره", "حقرا",
  "زباله", "زبال", "وسخ", "وسخه", "وصخ", "وصخه", "تافه", "تافهه", "قذر", "قذره", "اهبل", "هبله",
  "مهبول", "مهبوله", "بهيم", "بهيمه", "بهايم", "سافل", "سافله", "سفله", "منحط", "منحطه",
  "واطي", "واطيه", "نذل", "نذله", "انذال", "وقح", "وقحه", "حثاله", "خايس", "خايسه", "معفن",
  "معفنه", "عفن", "كريه", "كريهه", "بشع", "بشعه", "قبيح", "قبيحه", "خبل", "خبله", "مخبول",
  "مخبوله", "دلخ", "دلخه", "بليد", "بليده", "متخلف", "متخلفه", "معاق", "معاقه", "كذاب", "كذابه",
  "حرامي", "حراميه", "نصاب", "نصابه", "منافق", "منافقه", "خاين", "خاينه", "كافر", "كافره",
  "ملحد", "ملحده", "زنديق", "مرتد", "يهودي", "يهوديه", "نصراني", "مجوسي", "داعشي", "ارهابي",
  "ارهابيه", "لقيط", "لقيطه", "مسطول", "مسطوله", "سكران", "سكرانه", "محشش", "قزم", "همجي",
  "ملعون", "ملعونه", "جاهل", "جاهله", "خضيري", "صايع", "صايعه", "مريض نفسي", "ابن الشارع", "قليل ادب", "قليل الادب", "قليله ادب",
  "قليله الادب", "عديم الادب", "عديم ادب", "عديمه الادب", "عديم الاخلاق", "قليل حيا",
  "قليل الحيا", "ولد شوارع", "بنت شوارع",
];

const LITERAL_EN = ["pig", "donkey", "cow", "fool", "clown", "trash", "garbage", "fat", "ugly", "fatso"];

const INSULT_EN = [
  "idiot", "stupid", "moron", "dumb", "loser", "jerk", "creep", "perv", "pervert", "scum",
  "worthless", "useless", "pathetic", "freak", "bimbo", "imbecile", "cretin", "liar", "thief",
  "terrorist", "coward", "dumbo",
];

const LITERAL_ARABIZI = [
  "{7,h}{i,e,}mar", "{7,h}{a,}mir", "k{a,e}lb", "klab", "{7,h}ay{a,}wan", "{7,h}ywan",
  "tays", "tais", "ba{8,q,g}ar{a,ah}", "ba2{8,q,g}ar{a,ah}", "{kh,5}aroof", "gird",
];

const INSULT_ARABIZI = [
  "{gh,8}{a,}bi", "{gh,8}abi{a,ah,ye}", "{7,h}a{q,8,g}{ee,i}r", "zbal{a,e,ah}", "zibal{a,e}",
  "w{a,e,i}s{kh,5}", "{kh,5}{a,i}nz{ee,i}r", "taf{e,i}h", "ahbal", "mal3on", "wa6i",
];

// ---------------------------------------------------------------------------
// SOFT — fine in most letters but worth a human look next to a real teacher's
// name: hate / failure words, grievances, abuse or harassment claims, curses
// that are sometimes jokes, political / sectarian terms, drug names, ads.
// ---------------------------------------------------------------------------

const SOFT_AR = [
  // hate / worst / failure
  "كرهت", "كرهتك", "كرهته", "كرهتها", "كرهتني", "كرهتنا", "كرهني", "كرهك", "كرهكم",
  "اكرهك", "اكرهه", "اكرهها", "اكرهكم", "نكرهك", "نكرهه", "ظالم", "ظالمه", "ظالمين", "ظلمتني",
  "ظلمني", "فاشل", "فاشله", "فاشلين", "افشل", "اسوا", "اسوء", "اتعس", "اسخف", "اغبي", "احقر",
  "مقرف", "مقرفه", "قرفتنا", "قرفتني", "قهرتني", "قهرتنا", "دمرتني", "دمرتنا", "دمرت حياتي",
  "عقدتني", "عقدتنا",
  // grievances / curses that are sometimes jokes
  "حسبي الله عليك", "حسبي الله عليه", "حسبي الله عليها", "حسبي الله عليكم", "حسبي الله فيك",
  "حسبي الله فيه", "حسبي الله فيها",
  "لا يوفق{ك,كم,ه,ها}", "لايوفق{ك,كم,ه,ها}", "لا يسامح{ك,كم,ه,ها}", "لايسامح{ك,كم,ه,ها}",
  "لا يرحم{ك,كم,ه,ها}", "لايرحم{ك,كم,ه,ها}", "لا يسعد{ك,ه,ها}", "لايسعد{ك,ه,ها}",
  "لا يبارك فيك", "لايبارك فيك", "لا سامحك", "لا سامحه", "ما سامحتك", "لن اسامحك",
  "ما راح اسامحك", "مو مسامحك", "مب مسامحك",
  "طز", "تبا", "انقلع", "انقلعي", "انطم", "انطمي", "اخرس", "اخرسي", "=زق", "=تف", "تفو",
  // abuse / harassment claims (possible defamation)
  "تنمر", "تنمرت", "يتنمر", "تتنمر", "متنمر", "متنمره", "تحرش", "تحرشت", "يتحرش", "متحرش",
  "ضربني", "ضربتني", "ضربتنا", "يضربنا", "تضربنا", "يضربني", "تضربني", "اغتصاب", "اغتصب",
  "انتحر", "انتحرت", "انتحار", "اقتل نفسي", "بقتل نفسي",
  // sexual-adjacent words with innocent meanings too
  "زبر", "=عير", "مهبل", "شاذ", "شواذ", "=بويه", "لبوه", "هايج", "هايجه", "شهوه", "شهواني",
  "جنسي", "عاري", "عاريه", "نهود", "قواد",
  // political / sectarian
  "الشيعه", "شيعي", "شيعيه", "صفوي", "صفويين", "وهابي", "وهابيه", "نصيري", "نصيريه",
  "اخونجي", "اخوانجي", "خوارج", "تكفيري", "ملاحده", "كفار", "يهود", "صهيوني", "صهاينه",
  "اسرائيل", "اسرائيلي", "حزب الله", "حزب اللات", "حوثي", "الحوثي", "حوثيين", "داعش",
  "خامنيي", "خامني", "نتنياهو", "ترامب", "مظاهره", "مظاهرات", "اعتصام", "انقلاب",
  "مجوس", "صليبي", "صليبيين", "نصاري", "بيسري",
  // drugs / alcohol (non-slang names)
  "حشيش", "حشيشه", "مخدرات", "مخدر", "كوكايين", "هيروين", "ماريجوانا", "ماريوانا",
  "كبتاجون", "كبتاغون", "ترامادول", "افيون", "مدمن", "ادمان", "خمر", "خمور", "مسكرات",
  "نبيذ", "فودكا", "ويسكي",
  // ads
  "كود خصم", "كوبون خصم", "للاعلان", "تابعوني", "زوروا حسابي", "متجري",
];

const SOFT_EN = [
  "hate", "hated", "hates", "worst", "awful", "terrible", "horrible", "sucks", "sucked",
  "damn", "hell", "crap", "crappy", "wtf", "omfg", "shut up", "sex", "naked", "nude", "escort",
  "abuse", "abused", "harass", "harassed", "harassment", "bully", "bullied", "bullying",
  "racist", "suicide", "drugs", "weed", "cocaine", "heroin", "meth", "marijuana", "beer",
  "vodka", "whiskey", "drunk", "israel", "zionist", "isis", "hezbollah", "casino",
];

const SOFT_ARABIZI = ["tfo", "tfu", "6oz", "toz"];

// ---------------------------------------------------------------------------
// Context words (normalised).
// ---------------------------------------------------------------------------

/** Words that aim the next insult at someone. */
export const ADDRESS_WORDS = [
  "يا", "ياا", "انت", "انتي", "انتم", "انتو", "انتا", "انته", "انتى",
  "you", "u", "ya", "yaa", "ur", "your", "youre", "ure", "yu",
];

/** May sit between an address word and the insult: «انت واحد حمار», "you are a total idiot". */
export const FILLER_WORDS = [
  "واحد", "وحده", "مره", "جد", "جدا", "حيل", "مجرد", "كبير", "كبيره", "اكبر",
  "a", "an", "are", "r", "re", "such", "so", "very", "real", "really", "total", "complete",
  "big", "little", "stupid", "fat", "old", "bloody",
];

/** «ابن/ولد/بنت + الـ + insult» is a family curse even for literal words (يا ابن الكلب). */
export const LINEAGE_WORDS = [
  "ابن", "بن", "ولد", "بنت", "عيال", "اولاد", "بنات", "يابن", "ياولد", "يابنت", "يبن",
  "ibn", "ebn", "bin", "ben", "walad", "wald", "bint", "abn",
];

/** Self-talk: «حسيت اني غبي» / "I felt stupid" is a story, not an insult. */
export const FIRST_PERSON_WORDS = [
  "انا", "اني", "انني", "لاني", "لانني", "باني", "وانا", "واني", "نفسي", "كاني", "كانني",
  "حسيت", "احس", "حسيتني",
  "i", "im", "me", "myself", "felt", "feel",
];

/** «ما كنت ظالم», "never hated" — negated soft words are not flagged. */
export const NEGATION_WORDS = [
  "ما", "لا", "لم", "لن", "مو", "مب", "مش", "ولا", "ابد", "ابدا", "ماكنت", "ماكان", "مافي",
  "not", "never", "no", "dont", "didnt", "wasnt", "werent", "isnt", "arent", "nothing",
];

export const ALWAYS: readonly string[] = [
  ...ALWAYS_AR_SEXUAL,
  ...ALWAYS_AR_CURSES,
  ...ALWAYS_AR_SLURS,
  ...ALWAYS_AR_THREATS,
  ...ALWAYS_AR_DRUGS,
  ...ALWAYS_EN,
  ...ALWAYS_ARABIZI,
];

/** ADDRESSED words that are also ordinary nouns (no soft flag when unaddressed). */
export const LITERAL: readonly string[] = [...LITERAL_AR, ...LITERAL_EN, ...LITERAL_ARABIZI];

export const ADDRESSED: readonly string[] = [
  ...LITERAL,
  ...INSULT_AR,
  ...INSULT_EN,
  ...INSULT_ARABIZI,
];

export const SOFT: readonly string[] = [...SOFT_AR, ...SOFT_EN, ...SOFT_ARABIZI];

/** Expands brace alternatives: "كس{ك,ها}" → ["كسك", "كسها"]. */
export function expandPattern(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open < 0) return [pattern];
  const close = pattern.indexOf("}", open);
  if (close < 0) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  return pattern
    .slice(open + 1, close)
    .split(",")
    .flatMap((alt) => expandPattern(head + alt + tail));
}
