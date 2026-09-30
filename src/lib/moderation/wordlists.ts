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
  "زب", "زبر{ي,ك}", "=اير", "اير{ي,ك,ه,ها,كم}", "طيز", "طياز", "طيظ", "بزاز{ها,ك}",
  "كص", "كص ام{ك,كم,ه,ها}", "كص اخت{ك,كم,ه,ها}",
  // sex acts
  "نيك", "{ا,ي,ت,ن}نيك{ك,كم,ه,ها,هم,}", "منيوك", "منيوكه", "منايك", "منيك", "متناك", "متناكه",
  "نياك", "نياكه", "انتاك", "ينتاك", "تنتاك", "نيج", "{ا,ي,ب}نيج{ك,ه,ها}", "منيوج", "منيوجه",
  "مناويج", "انتاكت", "منيوق", "منيوقه", "انكح{ك,ها,كم}",
  // «ينكح» alone is also religious text about marriage, so only these objects
  "ينكح {الطالبات,الطلاب,البنات}",
  "اغتصب{ك,ها,كم}", "باغتصب{ك,ها}",
  // prostitution / sexual slurs
  "شرموط", "شرموطه", "شراميط", "شرمطه", "شرموت", "شرموته", "شراميت", "قحبه", "=قحب", "قحاب",
  "كحبه", "كحاب",
  "عاهر", "عاهره", "عواهر", "عهر", "داعر", "داعره", "دعاره", "مومس", "مومسات",
  "ممحون", "ممحونه", "فاجر", "فاجره", "فواجر", "زاني", "زانيه", "زواني",
  "لوطي", "لواط", "مخنث", "خنيث", "=خول", "سحاقيه", "سحاقيات", "=سحاق",
  "ديوث", "ديايث", "ديوس", "دياييس", "معرص", "معرصه", "معارص", "=عرص", "عرصه", "=كواد", "=نغل",
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
  "يلعن", "يلعن{ك,كم,ه,ها,هم}", "لعنك", "لعنكم", "لعنه", "لعنت", "لعن الله",
  "يلعن ربك", "يلعن دينك", "يلعن الله", "يلعن النبي", "يلعن الرسول", "يلعن الاسلام",
  "{الله,ربي} ياخ{ذ,د}{ك,كم,ه,ها}", "ياخ{ذ,د} روح{ك,كم}", "{الله,ربي} يحرق{ك,كم}",
  "{الله,ربي} يشل{ك,كم,ه,ها}", "{الله,ربي} يخسف {فيك,بك,فيه,به,فيها,بها}",
  "عساك تموت", "عساه يموت", "عساها تموت", "عساك تنجلط", "عساه ينجلط", "عساها تنجلط",
  "عسا{ك,ه,ها,كم} {للنار,بالنار,لجهنم,بجهنم}", "عسا{ك,ه,ها,كم} في {النار,جهنم}",
  "انقبر", "انقبري", "انقبروا",
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
  "{ب,ا}كسر راس{ك,كم}", "{ب,ا}قطع راس{ك,كم}", "{ب,ا}دهس{ك,كم}",
];

/** Explicit sexual-abuse accusations: never published on a thank-you wall. */
const ALWAYS_AR_ACCUSATIONS = [
  "{يتحرش,تحرش,تتحرش} {بي,فيني,بنا,فينا,بالطالبات,بالطلاب,بالبنات,بالعيال,بالاولاد}",
  "اغتصب{ني,نا}", "استغل{ني,نا} جنسيا",
];

const ALWAYS_AR_DRUGS = ["=شبو", "ابو هلالين", "بانجو"];

const ALWAYS_EN = [
  "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fuckface", "fuckhead",
  "fuckwit", "fucktard", "fuckoff", "motherfucker", "motherfuckers", "motherfucking", "mofo",
  "fuk", "fuking", "fukin", "fuker", "fck", "fcking", "fckin", "fcker", "fcuk", "fuq", "fking",
  "fkn", "fkin", "phuck", "fvck", "fvcking", "stfu", "gtfo",
  "shit", "shits", "shitty", "shithead", "shithole", "shitface", "bullshit", "dipshit",
  "horseshit", "shite",
  "bitch", "bitches", "bitchy", "biatch", "biotch", "beyotch",
  "cunt", "dick", "dickhead", "dickheads", "dickhole", "cock", "cocksucker", "cocksuckers",
  "pussy", "pussies", "=ass", "asshole", "assholes", "arse", "arsehole", "jackass",
  "dumbass", "asswipe", "asshat",
  "bastard", "whore", "slut", "sluts", "slutty", "twat", "wank", "wanker", "wanking", "prick",
  "piss", "pissed", "pissing", "piss off", "bollocks", "douche", "douchebag", "screw you",
  // slurs
  "retard", "retarded", "retards", "faggot", "faggots", "fag", "fags", "dyke", "tranny",
  "nigger", "niggers", "nigga", "niggas", "niggaz", "negro", "chink", "=spic", "kike", "paki",
  "raghead", "towelhead", "sandnigger", "camel jockey", "wetback", "gook", "coon", "=spics",
  // sexual / porn / escort spam
  "porn", "porno", "pornhub", "xvideos", "xnxx", "xhamster", "onlyfans", "nudes", "sexy",
  "sexting", "horny", "boobs", "boobies", "tits", "titties", "dildo", "blowjob", "handjob",
  "cumshot", "jizz", "orgasm", "milf", "anal", "rape", "raped", "rapes", "raping",
  "rapist", "rapists", "pedo", "pedos", "pedophile", "pedophiles", "paedophile", "molester",
  "call girl", "call girls", "viagra", "cialis",
  // threats
  "kys", "kill yourself", "kill urself", "kill ur self", "go die", "kill you", "kill u",
  "shoot you", "bomb the school", "shoot up the school",
  "suck my", "you suck", "u suck", "go to hell",
];

// Latin-script Arabic. Digits stand for letters (3=ع 7=ح 5=خ 2=ء 6=ط 9=ص 8=ق).
const ALWAYS_ARABIZI = [
  "k{o,u}s", "k{o,u}ss", "kess", "k{o,u}s{o,u,}m{a,}k", "k{o,u}ss{o,u,}m{a,}k", "ksomk", "ksmk",
  "k{o,u}s{o,e,u}{kh,5}t{a,e}k",
  "z{e,i,o}b", "z{e,i,o}bb", "z{e,i,o}b{i,ak,ek}", "ayr{i,ak}", "{t,6}{e,i}z", "{t,6}{e,i}z{ak,ek,i}",
  "nek", "nek{ak,ek,ha}", "{a,e}nek{ak,ek,ha}", "{a,e}nik{ak,ek}", "many{a,o}k", "many{o,ou}k{a,e}",
  "m{e,i,}tnak", "m{e,i,}tnak{a,e}", "nayek",
  "sharm{o,ou,u}{t,6}{a,ah,e,}", "charm{o,ou}t{a,e}", "sharam{e,i}t",
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
  "فيل", "بعير", "مطي", "زمال", "=فرخ", "=لوح", "جزمه", "=نعال", "=زفت", "=تبن", "=زق",
  "ساقط", "ساقطه", "معاق", "معاقه", "ابليس", "زباله", "زبال", "وسخ", "وسخه", "وصخ", "وصخه", "قذر",
  "قذره", "عفن", "معفن", "معفنه", "خايس", "خايسه", "كريه", "كريهه", "بشع", "بشعه", "قبيح", "قبيحه",
  "تافه", "تافهه", "واطي", "واطيه", "قزم",
  // everyday words that are Gulf insults when aimed at someone (مكوة = clothes iron, نكرة = grammar term)
  "مكوه", "نكره", "=طبل", "لطخه", "=عره", "=شين", "خايب", "خايبه", "بايخ", "بايخه", "معقد", "معقده",
];

const INSULT_AR = [
  "خنزير", "خنزيره", "خنازير", "غبي", "غبيه", "اغبيا", "اغبياء", "حقير", "حقيره", "حقرا",
  "اهبل", "هبله", "مهبول", "مهبوله", "بهيم", "بهيمه", "بهايم", "سافل", "سافله", "سفله", "منحط",
  "منحطه", "نذل", "نذله", "انذال", "وقح", "وقحه", "حثاله", "خبل", "خبله", "مخبول", "مخبوله",
  "دلخ", "دلخه", "بليد", "بليده", "متخلف", "متخلفه", "كذاب", "كذابه", "حرامي", "حراميه", "نصاب",
  "نصابه", "منافق", "منافقه", "خاين", "خاينه", "كافر", "كافره", "ملحد", "ملحده", "زنديق", "مرتد",
  "يهودي", "يهوديه", "نصراني", "مجوسي", "داعشي", "ارهابي", "ارهابيه", "لقيط", "لقيطه", "مسطول",
  "مسطوله", "سكران", "سكرانه", "محشش", "همجي", "ملعون", "ملعونه", "جاهل", "جاهله", "خضيري",
  "صايع", "صايعه", "مريض نفسي", "ابن الشارع", "ولد شوارع", "بنت شوارع", "وجه الفقر", "وجه النحس",
  "قليل ادب", "قليل الادب", "قليله ادب", "قليله الادب", "عديم ادب", "عديم الادب", "عديمه الادب",
  "عديم الاخلاق", "قليل حيا", "قليل الحيا",
  "خسيس", "خسيسه", "وضيع", "وضيعه", "دشير", "دشيره", "مطفوق", "مطفوقه", "عبيط", "عبيطه", "اهطل",
  "هطلا", "طرطور", "عكروت", "حقود", "حقوده", "جبان", "جبانه", "سخيف", "سخيفه", "=ذبي",
  // failure / contempt words: a review flag in a story, an insult when aimed at the teacher
  "فاشل", "فاشله", "ظالم", "ظالمه", "مقرف", "مقرفه", "اغبي", "احقر", "اسخف", "اسوا", "اسوء", "اتعس",
  "بيسري", "بيسريه",
  // accusations as labels: «الأستاذ المرتشي», «يا حرامي» (unaddressed → review)
  "مرتشي", "مرتشيه", "مختلس", "مختلسه", "مزور", "مزوره", "حشاش", "حشاشه", "سكير", "سكيره",
  "متحرش", "متحرشه",
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
  "اكرهك", "اكرهه", "اكرهها", "اكرهكم", "نكرهك", "نكرهه", "ظلمتني",
  "ظلمني", "افشل", "قرفتنا", "قرفتني", "قهرتني", "قهرتنا", "دمرتني", "دمرتنا", "دمرت حياتي",
  "عقدتني", "عقدتنا",
  // grievances / curses that are sometimes jokes
  "حسبي الله عليك", "حسبي الله عليه", "حسبي الله عليها", "حسبي الله عليكم", "حسبي الله فيك",
  "حسبي الله فيه", "حسبي الله فيها",
  "لا يوفق{ك,كم,ه,ها}", "لايوفق{ك,كم,ه,ها}", "لا يسامح{ك,كم,ه,ها}", "لايسامح{ك,كم,ه,ها}",
  "لا يرحم{ك,كم,ه,ها}", "لايرحم{ك,كم,ه,ها}", "لا يسعد{ك,ه,ها}", "لايسعد{ك,ه,ها}",
  "لا يبارك فيك", "لايبارك فيك", "لا سامحك", "لا سامحه", "ما سامحتك", "لن اسامحك",
  "ما راح اسامحك", "مو مسامحك", "مب مسامحك", "الله يقلعك", "عساك بالعمي", "الله يعميك",
  "طز", "تبا", "انقلع", "انقلعي", "انطم", "انطمي", "اخرس", "اخرسي", "=زق", "=تف", "تفو",
  // abuse / harassment claims (possible defamation)
  "تنمر", "تنمرت", "يتنمر", "تتنمر", "متنمر", "متنمره", "تحرش", "تحرشت", "يتحرش",
  "ضربني", "ضربتني", "ضربتنا", "يضربنا", "تضربنا", "يضربني", "تضربني", "اغتصاب", "اغتصب",
  "{يضرب,تضرب,ضرب} {الطلاب,الطالبات,العيال,البنات,الاولاد}",
  "يعاكس", "تعاكس", "يغازل", "يتلمس", "{يلمس,لمس} {الطالبات,البنات,الطلاب}", "رسايل خاصه",
  "ابتزني", "ابتزنا", "يبتز", "ابتزاز", "هددني", "استغلني", "استغلنا", "جنسيا", "ينكح",
  "انتحر", "انتحرت", "انتحار", "اقتل نفسي", "بقتل نفسي",
  // corruption / crime claims — bare سرق/يضرب/يلمس also appear in praise, so objects only
  "يرتشي", "رشوه", "رشاوي", "اختلاس", "يختلس", "اختلس", "سارق", "سارقه",
  "{سرق,يسرق,تسرق,سرقت} {فلوس,الفلوس,الميزانيه}", "{سرق,يسرق,تسرق,سرقت} من ميزانيه",
  "غشاش", "غشاشه", "يغشش", "يغششنا", "يغش {في,بالاختبارات,بالامتحانات}", "يسرب",
  "{يبيع,تبيع} {الدرجات,الاسيله}", "فضيحه", "فضايح", "مسجون", "مسجونه", "سجنوه", "سجنوها",
  "انسجن", "قضيه اخلاقيه", "فصلوه", "فصلوها", "طردوه", "طردوها", "يتعاطي", "تتعاطي", "متعاطي",
  // sexual-adjacent words with innocent meanings too
  "زبر", "=عير", "بزاز", "مهبل", "شاذ", "شواذ", "=بويه", "لبوه", "هايج", "هايجه", "شهوه", "شهواني",
  "جنسي", "عاري", "عاريه", "نهود", "قواد",
  // political / sectarian
  "الشيعه", "شيعي", "شيعيه", "صفوي", "صفويين", "وهابي", "وهابيه", "نصيري", "نصيريه",
  "اخونجي", "اخوانجي", "خوارج", "تكفيري", "ملاحده", "كفار", "يهود", "صهيوني", "صهاينه",
  "اسراييل", "اسراييلي", "حزب الله", "حزب اللات", "حوثي", "الحوثي", "حوثيين", "داعش",
  "خامنيي", "خامني", "نتنياهو", "ترامب", "مظاهره", "مظاهرات", "اعتصام", "انقلاب",
  "مجوس", "صليبي", "صليبيين", "نصاري",
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

/** Innocent phrases that contain a listed word; hits inside them are ignored. */
export const SAFE_PHRASES = [
  "يلعن الشيطان", "يلعن ابليس", "يلعن ابليسك", "يلعن شيطانك", "لعنه الله علي الشيطان",
  "لعنه الله علي ابليس", "moby dick", "philip k dick", "cum laude",
  // the name Nicky / Nikki (نيك + ي); «بانيك» = panic (youth slang)
  "نيكي", "بانيك",
  // «واير» = wire (Gulf)
  "واير",
  // a lesson, not a claim
  "الرشوه حرام", "والرشوه حرام", "الغش حرام", "والغش حرام",
  // "air": AirPods, Airbus, airlines
  "اير بودز", "اير بود", "اير باص", "اير لاين", "اير لاينز", "اير فرانس", "اير عربيا",
];

/** ALWAYS words that are also foreign given names (ايرك = Eric): after a title or in a name field they only get a review. */
export const NAME_COLLISIONS = ["ايرك"];

/** ADDRESSED words that are also Saudi family names: «الأستاذ الخضيري», «إبراهيم السكران». */
export const SURNAMES = ["خضيري", "سكران"];

// ---------------------------------------------------------------------------
// Context words (normalised).
// ---------------------------------------------------------------------------

/** Words that aim the next insult at someone. */
export const ADDRESS_WORDS = [
  "يا", "ياا", "انت", "انتي", "انتم", "انتو", "انتا", "انته", "انتى",
  // «والله انك حمار», «كلكم حمير», «شكلك قرد», «وجهك (وجه) حمار»
  "انك", "انكم", "انكي", "كلكم", "شكلك", "شكلكم", "وجهك",
  "you", "u", "ya", "yaa", "ur", "your", "youre", "ure", "yu",
  "enta", "inta", "enti", "inti", "entu", "intu",
];

/** May sit between an address word and the insult: «انت واحد حمار», "you are a total idiot". */
export const FILLER_WORDS = [
  "واحد", "وحده", "مره", "جد", "جدا", "حيل", "مجرد", "كبير", "كبيره", "اكبر",
  "هذا", "هذي", "هذه", "ذا", "ذي", "بصراحه", "صراحه", "اصلا", "والله", "فعلا", "حقا", "بجد", "صدق", "وجه",
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
  "حسيت", "احس", "حسيتني", "عني",
  "i", "im", "me", "myself", "felt", "feel",
];

/** «ما كنت ظالم», "never hated" — negated soft words are not flagged. */
/** «كنت ولد جاهل…» — a story about the writer, not «ولد الحمار». */
export const STORY_WORDS = ["كنت", "كان", "كانت", "كنا"];

/**
 * Reported speech / opinion before «انت/انك»: «كانوا يقولون انك ظالم», «قلت لي انت
 * غبي». Still worth a human look, but not a direct insult. SPEECH_SKIP may sit in between.
 */
export const REPORTING_WORDS = [
  "قال", "قالوا", "قالو", "قالت", "قلت", "قلتي", "قلتو", "قلتلي", "قالي", "قالتلي", "يقول", "يقولون",
  "يقولو", "يقولوا", "تقول", "تقولين", "تقولون", "يقال", "ظنيت", "ظننت",
  "يظن", "يظنون", "تظن", "حسيت", "يحس", "تحس", "حسبت", "يحسب", "يحسبون",
  "توقعت", "عرفت", "يعرف", "سمعت", "سمعنا", "تخيلت",
  "اعتقدت", "يعتقد", "يعتقدون", "فكرت", "شفت", "يشوف", "يشوفون", "يعتبر", "يعتبرون",
  "يزعم", "يزعمون", "ينادي", "ينادينا", "يناديني", "تنادي", "تناديني", "تنادينا", "يسميني",
];
/**
 * The writer's own opinion, said now: «اقول انك حمار» is a direct insult. Only a
 * story when told in the past: «كنت اظن انك ظالم بس طلعت…».
 */
export const OPINION_WORDS = [
  "اقول", "نقول", "اظن", "نظن", "احس", "نحس", "احسب", "اتوقع", "اعرف", "نعرف", "اعتقد", "نعتقد", "افكر",
];

/**
 * Contempt words that, right after a title without «ال», usually start a new
 * clause rather than name the teacher: «يا أستاذ، أسوأ شي إنها خلصت», «يا أستاذ
 * نكره نودعك» (نكره = we hate). Aimed with «يا/انت» they still block.
 */
export const CLAUSE_WORDS = [
  "اسوا", "اسوء", "اتعس", "اغبي", "احقر", "اسخف", "فاشل", "فاشله", "ظالم", "ظالمه", "مقرف", "مقرفه",
  "نكره",
];
export const SPEECH_SKIP = [
  "لي", "لنا", "له", "لها", "لك", "لكم", "عني", "عنا", "عنك", "عنه", "عنها", "علي", "علينا", "ان", "انه",
  "دايم", "دايما", "كلهم", "الكل",
];

export const NEGATION_WORDS = [
  "ما", "لا", "لم", "لن", "مو", "مب", "مش", "ولا", "ابد", "ابدا", "ماكنت", "ماكان", "مافي",
  "not", "never", "no", "dont", "didnt", "wasnt", "werent", "isnt", "arent", "nothing",
];

export const ALWAYS: readonly string[] = [
  ...ALWAYS_AR_SEXUAL,
  ...ALWAYS_AR_CURSES,
  ...ALWAYS_AR_SLURS,
  ...ALWAYS_AR_THREATS,
  ...ALWAYS_AR_ACCUSATIONS,
  ...ALWAYS_AR_DRUGS,
  ...ALWAYS_EN,
  ...ALWAYS_ARABIZI,
];

/** ADDRESSED words that are also ordinary nouns (no soft flag when unaddressed). */
export const LITERAL: readonly string[] = [...LITERAL_AR, ...LITERAL_EN, ...LITERAL_ARABIZI];

/** English ADDRESSED words: they take English endings (s), not Arabizi ones — "Fateh" ≠ fat + eh. */
export const ADDRESSED_EN: readonly string[] = [...LITERAL_EN, ...INSULT_EN];

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
