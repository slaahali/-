import { describe, expect, it } from "vitest";
import { normalizeArabic } from "@/lib/text/normalize";
import { arabicShare, checkText, type ModerationReason } from "./filter";
import { ADDRESSED, ALWAYS, SOFT, expandPattern } from "./wordlists";

// ---------------------------------------------------------------------------
// Clean letters: real-sounding Saudi / Gulf / MSA thank-you messages. Several
// contain words that look like list entries on purpose (كسرة، زبدة، زبون،
// البقرة، كلبي، نيكول، خولة، Dickens, Sussex, cocktail, therapist…).
// ---------------------------------------------------------------------------

const CLEAN_BODIES = [
  "أستاذي العزيز، للحين أتذكر يوم قلت لي قدّام الفصل: «الرياضيات مو صعبة، أنت بس ما صادقتها». شكراً لأنك ما استسلمت علي 💜",
  "دكتورة هيفاء، كنتِ أول وحدة تقول لي إن بحثي يستاهل يُنشر. سهرتي معنا قبل المناقشة. شكراً من القلب ✨",
  "أستاذ سعد… ما لحقت أقولها لك وأنت موجود. الله يرحمك ويجعل كل حرف علمتنا إياه في ميزان حسناتك 🤍",
  "أبلة منيرة 😂 تذكرين يوم أرنب الفصل هرب وقعدنا الحصة كلها ندوّر عليه تحت الطاولات؟ أحلى حصة علوم بحياتي",
  "Ms. Sarah, you taught me English… بس الحقيقة علمتيني أتكلم بدون خوف. «Mistakes mean you are trying». Thank you 💛",
  "دكتور محمد، محاضرتك الساعة ٨ الصبح كانت الوحيدة اللي ما أغيب عنها 😅 شكراً يا دكتور.",
  "كنت تعطينا كسرة خبز مع الفطور وتقول: العلم ما يدخل بطن فاضية. الله يسعدك",
  "زبدة الكلام: أنت أفضل معلم مر علي بحياتي 👌",
  "علمتنا إن الزبون دايم على حق لما سوينا السوق الخيري، والزبائن كانوا أهالينا 😂",
  "كسبت احترامنا كلنا يا أستاذ خالد، وكسبت قلوبنا قبل كل شي",
  "كنت أحس إني غبي بالرياضيات لين درستني، شكراً على صبرك 💜",
  "قلبي انكسر يوم تخرجت وتركت فصلك، شكراً على كل شي",
  "كان عندي كلبي الصغير وكنت أحكي لك عنه كل يوم وأنت تسمعني بصبر 🐶",
  "حفظتني سورة البقرة كاملة في الابتدائي، الله يجزاك خير يا شيخ",
  "أستاذة زبيدة، ما أنسى كسوة العيد اللي جبتيها لبنات الفصل 🎁",
  "شكراً مس نيكول على كل كلمة تشجيع قلتيها لي 🌸",
  "عبدالله وعبدالرحمن يسلمون عليك يا أستاذ، كلنا صرنا مهندسين بفضلك",
  "تعلمت منك إن كل شي له عكس، وإن الفشل بداية النجاح",
  "خولة تقول لك شكراً يا أحلى معلمة 💐",
  "درستني من 2016 إلى 2019 وكانت أحلى سنوات عمري",
  "في الصف 3 ب كنت تقرأ لنا قصة كل خميس، وللحين أحب القصص",
  "تخرجت عام ١٤٤٠هـ وللحين أتذكر نصايحك يا أستاذ",
  "Thank you Mr. Hancock for the chemistry class, you were also the best assistant principal 🧪",
  "Dr. Abdulaziz، شكراً على كل ساعات المكتب اللي طولت ساعة زيادة بسببي 😅",
  "Our English teacher made us read Dickens, and we imagined Sussex and Essex from the books. I loved every class.",
  "في حصة الفنية رسمنا grapes و cocktail فواكه وعلقناها بالممر 🍇",
  "The therapist told me to thank the people who changed me. That's you, Ms. Noura!",
  "أسلوبك بالشرح خرافي يا أستاذ ماجد 🔥",
  "كنت تقول لنا: اللي ما يحل الواجب يمسح اللوح 😂",
  "في الرحلة شفنا الجمال والخرفان في المزرعة، أجمل رحلة مدرسية",
  "يوم العيد جبت لنا خروف العيد نشوفه بساحة المدرسة 🐑",
  "علمتنا عن الحيوانات وكيف نرحم الحيوان، شكراً",
  "شكراً لأنك ما كنت ظالم أبداً، كنت تعدل بيننا كلنا",
  "والله إنك كفو يا أستاذ فهد 💪",
  "Thank you for believing in me when I thought I was stupid.",
  "كل عام وأنت بخير يا معلمتي الغالية 💜🌷",
  "ما أنسى يوم قلت لي: الخط الحلو يبدأ من الصبر ✍\uFE0F",
  "استاذي العزيز انت قدوتي ومثلي الاعلى",
  "شكرا شكرا شكرا من كل قلبي 💜",
  "أستاذة نوف، لما قلت لك إني بنسحب من الطب قلتي: خذي نفس. الحين أنا بسنة الامتياز 🩺",
  "كنت أجي المدرسة بدون فطور وكنت تشتري لي من المقصف بصمت، الله يسعدك دنيا وآخرة",
  "شكراااااااااا يا أحلى أستاذ 😭💜",
  "الله يرحمك يا أستاذي 😭😭😭😭😭😭😭😭😭😭😭😭😭😭 ما نسيناك",
  "هههههههه تذكر يوم طاحت السبورة علينا؟ 😂",
  "الله يحفظك ويحفظ عيالك ويجزاك عنا خير الجزاء",
  "جزاك الله خير يا دكتور، بفضل الله ثم بفضلك تخرجت بامتياز",
  "كنت تناديني يا بطل، وصرت بطل فعلاً 🏅",
  "أحلى تكنيك في حل المسائل تعلمته منك",
  "حتى البكس حق المدرسة كنت تسوقه بنفسك عشان توصلنا للمسابقات 🚙",
  "الأستاذ عادل كان يعطينا مكسرات يوم الاختبار عشان نركز 🥜",
  "كنت كسول بس انت ما يئست مني أبداً",
  "أستاذة هيا، ريان كل يوم يرجع البيت ويقول: «أبلة هيا قالت…» صرتي قدوته 😂",
  "رحمك الله يا أستاذ ناصر، فقدناك لكن علمك باقي فينا 🕊\uFE0F",
  "In loving memory of Mr. Ahmed — الله يرحمه، كان أب قبل ما يكون معلم",
  "إلى معلمة القرآن: كل آية حفظتها بصوتك للحين أسمعها 🤍",
  "أحبك في الله يا أستاذي وأدعي لك في كل صلاة",
  "شكراً للأستاذ سامي على دروس التقوية المجانية اللي كان يعطيها بعد الدوام",
  "صف ثالث متوسط ٢٠١٥، شكراً لأنك علمتني أحب القراءة 📚",
  "You made physics fun. Honestly the best teacher at Riyadh International School 👏",
  "الله يعطيك العافية يا أستاذ، ترى كل الدفعة تدعي لك",
  "علمتني إن الطموح ما له حد، والحين أدرس ماجستير في كندا 🇨🇦",
  "كنت أخاف من الإلقاء، وأنت خليتني ألقي كلمة الصباح قدام المدرسة كلها 🎤",
  "يا أستاذ عبدالكريم، يا حبي لك 😂💜 أحلى حصص رياضة",
  "والله ما نسيت كلامك يوم قلت: لا تخلي أحد يقول لك ما تقدر",
  "Dear Coach Khalid, thanks for pushing us every morning. Class of 2018 misses you!",
  "والله يا أستاذ إنك أبو الكرم، إيش كنا نسوي من غيرك",
  "حفظتنا جدول الضرب بأغنية، وللحين أغنيها لعيالي 🎶",
  "كنت أكره الكيمياء وأنت خليتني أحبها ⚗\uFE0F",
  "يا شيخ الله يرفع قدرك، كنت تعلمنا التجويد بحب وصبر",
  "أستاذ إبراهيم، حصة العربي عندك كانت شعر وقصص ونكت 😄 حبّبتني في المتنبي.",
  "الأستاذة وعد كانت تجيب لنا زبادي وتمر من البقالة قبل الحصة 😋",
  "من سكسونيا إلى الرياض، علمتنا جغرافيا العالم كأننا نسافر معك 🌍",
  "Thanks for teaching me that the class clown can also be the class president 😄",
  "للحين عندي الشهادة اللي كتبتي عليها: فخورة فيك 🥹 شكراً يا أستاذة لطيفة",
  // A long letter close to the 600-char limit.
  "دكتورتي الغالية، قبل عشر سنوات دخلت قاعتك وأنا طالبة خايفة من كل شي: من التخصص، من الاختبارات، ومن فكرة إني ما أكون كفو.\nفي أول محاضرة كتبتِ على السبورة: «ما فيه سؤال صغير، فيه سؤال ما انسأل». من يومها صرت أسأل، وأسأل كثير 😅 وكنتِ تجاوبين بنفس الابتسامة كل مرة.\nلما تعثرت في السنة الثالثة ما عاملتيني كرقم، جلستي معي بعد المحاضرة ورتبنا خطة مذاكرة سوا. اليوم أنا أستاذة في نفس الجامعة، وكل ما دخلت قاعة أتذكرك وأحاول أكون لطالباتي مثل ما كنتِ لي.\nشكراً لأنك علمتيني إن التعليم رحمة قبل ما يكون منهج 💜",
];

const CLEAN_NAMES = [
  "عبدالله الشهري",
  "هيفاء القحطاني",
  "مس سارة",
  "Mr. Hancock",
  "نيكول",
  "خولة الزهراني",
  "زبيدة",
  "سفيان الثوري",
  "محمد الهندي",
  "أ. نورة",
  "د. خالد العمري",
  "عبدالرحمن بن سعيد",
  "فهد المطيري",
  "كساب العتيبي",
  "الأستاذة منيرة",
  "محمد الكلبي",
  "تيسير",
  "Dickens",
  "أبو ريان",
  "أم عبدالعزيز",
];

const CLEAN_SCHOOLS = [
  "ثانوية الملك فهد",
  "Riyadh International School",
  "جامعة الملك سعود",
  "الابتدائية 120 بجدة",
  "مدارس المملكة",
  "المتوسطة الرابعة بحائل",
  "روضة الأطفال الثامنة",
  "King Saud University",
  "Essex County High School",
  "جامعة الإمام عبدالرحمن بن فيصل",
  "مدرسة ١٤٤ الابتدائية",
  "كلية الطب - جامعة الملك عبدالعزيز",
];

// Regressions found in review: names and words that collide with list stems.
const CLEAN_REGRESSIONS = [
  "شكراً أستاذة نيكي على كل شي",
  "يا نيكي يا أحلى مس",
  "درستنا عن التوابل spices والطبخ",
  "أستاذ سعد الحمار الله يعطيك العافية",
  "الاستاذ هذا كان بطل",
  "دكتور فهد الكلباني شكراً",
];

describe("checkText — review regressions pass", () => {
  it.each(CLEAN_REGRESSIONS)("passes: %s", (body) => {
    expect(checkText(body, { kind: "body" })).toMatchObject({ ok: true, reason: null });
  });
});

describe("checkText — clean letters pass", () => {
  it("has a big enough clean corpus", () => {
    expect(CLEAN_BODIES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CLEAN_BODIES)("passes: %s", (body) => {
    const r = checkText(body, { kind: "body" });
    expect(r).toMatchObject({ ok: true, reason: null, matches: [] });
    expect(r.soft).toEqual([]);
  });

  it.each(CLEAN_NAMES)("name passes: %s", (name) => {
    expect(checkText(name, { kind: "name" })).toMatchObject({ ok: true, soft: [] });
  });

  it.each(CLEAN_SCHOOLS)("school passes: %s", (school) => {
    expect(checkText(school, { kind: "school" })).toMatchObject({ ok: true, soft: [] });
  });
});

// ---------------------------------------------------------------------------
// Abuse + evasion. Each row: [text, expected reason, kind?]
// ---------------------------------------------------------------------------

type Row = [string, ModerationReason, ("body" | "name" | "school")?];

const BLOCKED: Row[] = [
  // Arabic insults, directly addressed
  ["يا حمار ما تفهم شي", "profanity"],
  ["انت غبي وما تعرف تشرح", "profanity"],
  ["انتي بقرة وما عندك سالفة", "profanity"],
  ["يا كلب", "profanity"],
  ["يا حيوان والله", "profanity"],
  ["يا تيس انت", "profanity"],
  ["اسكت يا ثور", "profanity"],
  ["يا خنزير", "profanity"],
  ["انت حقير", "profanity"],
  ["يا زبالة يا وسخ", "profanity"],
  ["انت واحد تافه", "profanity"],
  ["يالحمار", "profanity"],
  ["يا قليل الادب", "profanity"],
  // aimed at the teacher through the title
  ["أستاذ حمار", "profanity"],
  ["الأستاذ الحيوان ما يفهم", "profanity"],
  ["المدرس الوسخ", "profanity"],
  ["المعلمة الغبية", "profanity"],
  ["المعلم هذا زق", "profanity"],
  ["teacher pig", "profanity"],
  ["he is a spic", "profanity"],
  // lineage / family curses
  ["يا ابن الكلب", "profanity"],
  ["ولد الحمار هذا", "profanity"],
  ["كس امك يا استاذ", "profanity"],
  ["كسمك", "profanity"],
  ["الله يلعنك", "profanity"],
  ["يلعن ابوك", "profanity"],
  ["ابن حرام", "profanity"],
  ["دين امك", "profanity"],
  // sexual / slurs / threats / drugs / porn spam
  ["شرموطة", "profanity"],
  ["قحبة", "profanity"],
  ["قحبتك", "profanity"],
  ["منيوك", "profanity"],
  ["يا ديوث", "profanity"],
  ["طيزك", "profanity"],
  ["زبي", "profanity"],
  ["انيكك", "profanity"],
  ["كنت معلم متحرش وعاهر", "profanity"],
  ["يا زنجي", "profanity"],
  ["رافضي", "profanity"],
  ["بقتلك بكرة عند الباب", "profanity"],
  ["عساك تموت", "profanity"],
  ["الله ياخذك", "profanity"],
  ["شبو للبيع", "profanity"],
  ["افلام سكس مجانية", "profanity"],
  // Arabic evasion
  ["ك.ل.ب", "profanity"],
  ["ك ل ب يا استاذ", "profanity"],
  ["يا كـــلـــب", "profanity"],
  ["يا كَلْبْ", "profanity"],
  ["يا كلللللب", "profanity"],
  ["يا ك\u200Cل\u200Cب", "profanity"],
  ["يا حـمـار", "profanity"],
  ["ش ر م و ط ة", "profanity"],
  ["شرمو طه", "profanity"],
  ["قـحـبـة", "profanity"],
  ["يا \uFEDB\uFEE0\uFE90", "profanity"], // presentation forms
  ["يا ڪلب", "profanity"],
  ["گحبة", "profanity"],
  ["ك💩ل💩ب", "profanity"],
  // Arabizi
  ["ya 7mar", "profanity"],
  ["ya kalb", "profanity"],
  ["kos omak", "profanity"],
  ["kosomak", "profanity"],
  ["sharmoota", "profanity"],
  ["ibn el kalb", "profanity"],
  ["yel3an abook", "profanity"],
  ["5ara 3lek", "profanity"],
  ["ga7ba", "profanity"],
  ["ya 7'ara", "profanity"],
  ["manyak", "profanity"],
  ["ya ghabi", "profanity"],
  // English + evasion
  ["fuck you", "profanity"],
  ["you're an idiot", "profanity"],
  ["you are a total loser", "profanity"],
  ["shit teacher", "profanity"],
  ["fuuuuuck", "profanity"],
  ["f.u.c.k", "profanity"],
  ["f u c k", "profanity"],
  ["f-u-c-k this", "profanity"],
  ["sh1t", "profanity"],
  ["b1tch", "profanity"],
  ["@sshole", "profanity"],
  ["a$$hole", "profanity"],
  ["f*ck this class", "profanity"],
  ["b**ch", "profanity"],
  ["ƒυck", "profanity"], // Latin ƒ + Greek υ
  ["fuсk", "profanity"], // Cyrillic с
  ["\u{1D41F}\u{1D42E}\u{1D41C}\u{1D424}", "profanity"], // math bold
  ["ＦＵＣＫ", "profanity"], // full-width
  ["you stupid bitch", "profanity"],
  ["motherfucker", "profanity"],
  ["kill yourself", "profanity"],
  ["kys", "profanity"],
  ["nigga", "profanity"],
  ["free porn here", "profanity"],
  // contact details
  ["كلمني على 0551234567", "contact_info"],
  ["رقمي ٠٥٥١٢٣٤٥٦٧ تواصل معي", "contact_info"],
  ["+966 55 123 4567", "contact_info"],
  ["00966551234567", "contact_info"],
  ["جوالي 551234567", "contact_info"],
  ["05-5123-4567", "contact_info"],
  ["٠٥٥ ١٢٣ ٤٥٦٧", "contact_info"],
  ["۰۵۵۱۲۳۴۵۶۷", "contact_info"],
  ["0 5 5 1 2 3 4 5 6 7", "contact_info"],
  ["05.51.23.45.67", "contact_info"],
  ["noura@gmail.com", "contact_info"],
  ["noura at gmail dot com", "contact_info"],
  ["ايميلي noura(at)hotmail.com", "contact_info"],
  ["تابعوني @noura_22", "contact_info"],
  ["سناب: noura_22", "contact_info"],
  ["insta noura.art", "contact_info"],
  // links
  ["https://example.com", "link"],
  ["شوفوا www.example.com", "link"],
  ["تابعوني x.com/noura", "link"],
  ["t.me/noura", "link"],
  ["bit.ly/abc123", "link"],
  ["snapchat.com/add/noura", "link"],
  ["instagram.com/noura", "link"],
  ["زوروا متجرنا zoom.sa", "link"],
  ["shop.io لأحلى العروض", "link"],
  ["example dot com", "link"],
  ["موقعنا نوره دوت كوم", "link"],
  // spam
  ["!!!!!!!!!!!!!!!!!!!!", "spam"],
  ["💜".repeat(25), "spam"],
  ["1234 5678 9", "spam"],
  ["شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا", "spam"],
  ["aaaaaaaaaaaaaaaaaaa", "spam"],
  ["هه".repeat(15), "spam"],
  ["\u0640".repeat(30), "spam"], // only tatweel
  ["ك ".repeat(12), "spam"],
  ["💜🌷💜🌷 🎉🎉 ✨✨", "spam"],
  // names / schools
  ["حمار", "profanity", "name"],
  ["الاستاذ الغبي", "profanity", "name"],
  ["@noura", "contact_info", "name"],
  ["0551234567", "contact_info", "name"],
  ["www.school.com", "link", "school"],
  ["كسمك", "profanity", "school"],
];

describe("checkText — abuse, evasion, contact, links and spam are blocked", () => {
  it("has a big enough blocked corpus", () => {
    expect(BLOCKED.length).toBeGreaterThanOrEqual(60);
  });

  it.each(BLOCKED)("blocks: %s → %s", (text, reason, kind) => {
    const r = checkText(text, { kind: kind ?? "body" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

describe("checkText — soft signals", () => {
  const SOFT_OK: Array<[string, ("body" | "name")?]> = [
    ["كنت أسوأ طالب في الفصل وأنت ما تركتني"],
    ["كرهت المدرسة كلها إلا حصتك"],
    ["كان ظالم معنا بالدرجات"],
    ["you were the worst teacher ever"],
    ["الأستاذ خالد غبي بس نحبه"],
    ["حسبي الله عليك يا أستاذ كثرت علينا الواجبات 😂"],
    ["الحوثي والسياسة ما لها دخل بالحصة"],
    ["نورة البقرة", "name"],
    ["خالد الغبي", "name"],
  ];

  it.each(SOFT_OK)("lets through but flags: %s", (text, kind) => {
    const r = checkText(text, { kind: kind ?? "body" });
    expect(r.ok).toBe(true);
    expect(r.soft.length).toBeGreaterThan(0);
  });

  it("does not flag first-person or negated uses", () => {
    expect(checkText("أنا كنت فاشل بالرياضيات وأنت غيرتني").soft).toEqual([]);
    expect(checkText("I hated math until your class").soft).toEqual([]);
    expect(checkText("ما كنت فاشل أبداً معك").soft).toEqual([]);
  });

  it("does not flag everyday nouns that are only insults when addressed", () => {
    expect(checkText("كلبي الصغير وخروف العيد وسورة البقرة").soft).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Round-2 red-team findings. Per finding: what must be blocked, what must only
// go to review (ok + soft), and what must stay clean (ok, no flag).
// ---------------------------------------------------------------------------

type Kind = "body" | "name" | "school";
type Case = string | [string, Kind];
const unpack = (c: Case): [string, Kind] => (typeof c === "string" ? [c, "body"] : c);
const label = (c: Case) => (typeof c === "string" ? c : `${c[0]} (${c[1]})`);

function expectBlocked(c: Case, reason: ModerationReason = "profanity") {
  const [text, kind] = unpack(c);
  const r = checkText(text, { kind });
  expect(r.ok, label(c)).toBe(false);
  expect(r.reason, label(c)).toBe(reason);
}
function expectReview(c: Case) {
  const [text, kind] = unpack(c);
  const r = checkText(text, { kind });
  expect(r.ok, label(c)).toBe(true);
  expect(r.soft.length, label(c)).toBeGreaterThan(0);
}
function expectClean(c: Case) {
  const [text, kind] = unpack(c);
  expect(checkText(text, { kind }), label(c)).toMatchObject({ ok: true, matches: [], soft: [] });
}

describe("findings — Gulf/Levantine/Egyptian sexual and profane spellings", () => {
  it.each([
    "ايرك بعيونك يا استاذ", "اير بهالمدرسة", "كص امك يا استاذ", "طيظك كبيرة يا استاذ", "شرموته",
    "يا ابن الشرموته", "يا قحب٥", "يا قحبo", "يا ذبي", "انكحك يا استاذه", "ينكح الطالبات", "منيوق",
    "يا ديوس", "يا عرصه", "يا مكوة",
  ])("blocks: %s", (t) => expectBlocked(t));

  it("keeps everyday words that share the stems", () => {
    expectClean("سماعاتي اير بودز ضاعت وانت لقيتها 😂");
    expectClean("كل ما شفت مكوة أتذكر يوم كويتي مريولي قبل الحفل 😂");
  });

  it("only flags «ايرك» (Eric) after a title or in a name field", () => {
    expectReview("إلى مستر ايرك، شكراً على دروس الإنجليزي");
    expectReview("مستر إيرك كان يعلمنا الإنجليزي بالأغاني");
    expectReview(["ايرك", "name"]);
  });
});

describe("findings — the name Fateh/Fatah is not the insult fat", () => {
  it.each<Case>([
    ["Fateh", "name"], ["Mr. Fateh", "name"], ["Fatah", "name"], "شكراً Mr. Fateh على كل حصة فيزياء",
    "شكراً أستاذ Fateh، أنت قدوتي", "Thank you Mr. Fateh for every physics class",
  ])("passes: %s", (c) => expectClean(c));

  it.each<Case>(["you fat pig", "you are so fat", ["Ms. Kalba", "name"], "ya kalba"])("blocks: %s", (c) => expectBlocked(c));
});

describe("findings — defamation and accusations against a teacher", () => {
  it.each<Case>([
    "الاستاذ خالد مرتشي ويبيع الدرجات", "سرق فلوس الرحلة", "كان يسرق من ميزانية المدرسة",
    "كان يضرب الطلاب بالعصا", "كان يعاكس البنات في الفصل", "كان يلمس الطالبات", "مسجون الحين بقضية اخلاقية",
    "كان يغش في الاختبارات ويسرب الاسئلة", "الاستاذ فهد حشاش", "كانت تاخذ رشوة عشان الدرجات", "مزور شهادته",
    "فصلوه بسبب فضيحة", "يتعاطى", "ابتزني", "هددني", "كان يرسل للطالبات رسايل خاصة بالليل",
    ["خالد مرتشي", "name"],
  ])("sends to review: %s", (c) => expectReview(c));

  it.each<Case>([
    "الاستاذ المرتشي", "يا حرامي", "انت مختلس", "كان يتحرش بالطالبات", "تحرش فيني", "استغلني جنسيا",
    ["مرتشي", "name"],
  ])("blocks explicit accusations: %s", (c) => expectBlocked(c));

  it.each([
    "كان يضرب لنا أمثلة من الحياة", "سرقت قلوبنا يا أستاذة 💜", "كنت تسرق من وقتك عشان تشرح لنا",
    "علمتنا إن الرشوة حرام والغش حرام",
  ])("keeps praise that shares the verbs: %s", (t) => expectClean(t));
});

describe("findings — addressed insults outside the list and more address forms", () => {
  it.each([
    "خسيس", "وضيع", "دشير", "نكره", "مطفوق", "عبيط", "اهطل", "طرطور", "عكروت", "حقود", "جبان", "سخيف",
    "خايب", "بايخ", "شين", "طبل", "معقد",
  ])("blocks «يا %s»", (w) => expectBlocked(`يا ${w} ما استفدنا منك شي`));

  it.each<Case>([
    "والله انك حمار يا استاذ", "إنك تيس ما تفهم", "انت بصراحة حمار", "انت اصلاً حمار", "كلكم حمير",
    "شكلك قرد يا استاذ", "وجهك وجه حمار", ["الاستاذ هالحمار", "name"], "شكرا للأستاذ الحمار",
    "شكرا للمعلم الكلب", "شكراً بالأستاذ الحمار", "inta kalb", "enta 7mar",
  ])("blocks: %s", (c) => expectBlocked(c));

  it("sends pointed or reported insults to review", () => {
    expectReview("هالحمار ما يعرف يشرح");
    expectReview("الكل كان يقول انك ظالم بس انا اعرف انك عادل");
  });

  it.each([
    "والله انك كفو وما قصرت معنا", "عرفت انك تحب القهوة فجبت لك وحدة 😂", "شكلك كنت تعبان ذاك اليوم بس شرحت لنا",
    "وجهك وجه خير علينا", "كلكم في القلب", "انت بصراحة أفضل معلم مر علي", "علمتنا الفرق بين المعرفة والنكرة",
    "لما عرفنا انك مريض دعينا لك", "يا مس طول بالك علينا 😂", "انت كذا بين طلابك دايم", "enta 7abibi ya ustaz",
  ])("passes: %s", (t) => expectClean(t));
});

describe("findings — self-deprecating stories are not insults", () => {
  it.each([
    "كنت طالب بليد وانت ما يأست مني أبداً…", "كنت ولد جاهل ما يعرف يقرأ وانت علمتني الحروف",
    "كنت بنت بليدة في الإنجليزي والحين أدرّسه", "ما عمرك قلت لي انت غبي، دايم كنت تقول انت تقدر",
    "كان أخوي مريض نفسي وانت وقفت معي", "كنت غبي وانت صبرت علي",
  ])("at most flags: %s", (t) => expect(checkText(t).ok).toBe(true));

  it.each([
    "كان الكل يقول عني غبي وانت الوحيد اللي آمنت فيني", "يوم قلت للفصل: انتو مو أغبياء، انتو بس تعبانين",
    "يا ولد انا كنت حمار بالرياضيات",
  ])("passes: %s", (t) => expectClean(t));

  it.each(["يا ولد الحمار", "انت غبي", "غبي انت", "ولد الحمار هذا"])("still blocks: %s", (t) => expectBlocked(t));
});

describe("findings — the family names الخضيري / السكران", () => {
  it.each<Case>([
    ["الأستاذ الخضيري", "name"], ["الأستاذ السكران", "name"], "الأستاذ السكران أعظم معلم لغة عربية مر علي",
    ["خالد الخضيري", "name"], ["إبراهيم السكران", "name"], "شكراً للأستاذ الخضيري على كل شي",
  ])("passes: %s", (c) => expectClean(c));

  it.each<Case>(["يا خضيري", "انت سكران", ["خضيري", "name"]])("blocks the insult: %s", (c) => expectBlocked(c));
});

describe("findings — words split in three chunks, split addressed insults", () => {
  it.each<Case>([
    "يا شر مو طه", "يا شر🌹مو🌹طه", ["مدرسة الشر مو طه", "school"], ["مدرسة الشر مو طه", "name"],
    "شرxموطه يا استاذه", "يا حما ر", "يا حم ار", "يا غب ي", "يا كل ب", "يا حيو ان", "f uc k you", ["fu ck", "name"],
  ])("blocks: %s", (c) => expectBlocked(c));

  it.each(["an al", "انت كل شي حلو في المدرسة", "يا كل الحب يا أستاذتي", "شفنا حما ر في المزرعة"])("passes: %s", (t) =>
    expect(checkText(t).ok).toBe(true),
  );
});

describe("findings — disguised phone numbers, handles and links", () => {
  it.each<Case>([
    "كلموني صفر خمسة خمسة واحد اثنين ثلاثة اربعة خمسة ستة سبعة", "خمسة خمسة ١٢٣٤٥٦٧", "رقمي 055🌸123🌸4567",
    "رقمي 055،123،4567", "ايميلي noura.ksa22 جيميل", "لاتنسون تتابعون @ nourahh",
  ])("blocks contact details: %s", (c) => expectBlocked(c, "contact_info"));

  it.each(["t . me/nouraxx", "mysite . com", "example[.]com", "bit ly/abc12"])("blocks links: %s", (t) =>
    expectBlocked(t, "link"),
  );

  it.each<Case>([
    "سنابي nourah", "snap nourah", "انستا nouraksa", "تيك توك nourahh", "يوتيوب قناتي nourahh",
    ["سنابي nourah", "name"], ["صفر خمسة خمسة واحد", "name"],
  ])("sends possible handles / numbers to review: %s", (c) => expectReview(c));

  it.each([
    "أذكر جدول الضرب: ٧×٨=٥٦، ٩×٩=٨١، ٦×٧=٤٢", "كنا نعد معك واحد اثنين ثلاثة اربعة خمسة ونضحك 😂",
    "تذكر سناب الفصل؟ كنا نصور كل شي 😂", "I saw your insta post about us", "we met @ school every morning",
    "علمتني كيف أكتب ايميل رسمي بالإنجليزي",
  ])("passes: %s", (t) => expectClean(t));
});

describe("findings — death wishes, curses and threats", () => {
  it.each([
    "عساك تنجلط يا استاذ", "الله يشلك", "الله يخسف فيك", "عسى الله ياخذ روحك", "ربي ياخذك ويريحنا منك",
    "الله ياخدك يا استاذ", "انقبر يا استاذ", "عساك للنار", "بكسر راسك برا المدرسة", "بدهسك بالسيارة",
  ])("blocks: %s", (t) => expectBlocked(t));

  it.each(["الله يفضحك", "عساك تنشل", "ربي ينتقم منك", "بضربك بكرة"])("sends to review: %s", (t) => expectReview(t));

  it.each([
    "الله ياخذ بيدك ويوفقك", "عسى الله ياخذ بيدك دايم", "الله لا يكسر لك خاطر", "الله لا يضرك ولا يفجعنا فيك",
    "عساك ما تمرض أبداً", "انشالله تكسر الدنيا في الماجستير 😂", "الله يشرح صدرك ويفتح عليك",
  ])("keeps blessings: %s", (t) => expectClean(t));
});

describe("findings — addressed failure/contempt words are insults", () => {
  it.each([
    "يا فاشل ما استفدنا منك شي طول السنة", "يا ظالم ما عدلت بيننا", "يا مقرف", "انت اغبى معلم شفته", "يا بيسري",
    "المعلم الظالم",
  ])("blocks: %s", (t) => expectBlocked(t));

  it("unaddressed they still only get a look", () => {
    expectReview("كان ظالم معنا بالدرجات");
    expectClean("ما كنت فاشل أبداً معك");
  });
});

describe("findings — «بانيك» (panic) is slang, not «انيك»", () => {
  it("passes", () => expectClean("جاني بانيك قبل الاختبار النهائي وانتي هديتيني بكلمة، الله يجزاك خير"));
  it.each(["بانيكك", "بانيكها"])("still blocks %s", (t) => expectBlocked(t));
});

describe("review round 2 — contempt words after a title, opinions, number lists", () => {
  it.each([
    "يا أستاذ، أسوأ شي بالسنة إنها خلصت", "شكرا استاذي، اتعس يوم لما تقاعدت", "يا استاذ اغبى طالب عندك صار دكتور",
    "شكرا يا أستاذ، نكره نودعك",
  ])("a new clause after a title is only a look: %s", (t) => expectReview(t));

  it.each(["الاستاذ الفاشل", "المعلم الظالم", "الاستاذ النكره", "انت نكره", "يا فاشل"])(
    "the epithet or address still blocks: %s",
    (t) => expectBlocked(t),
  );

  it.each(["اقول انك حمار", "اقول لك انت حمار", "اظن انك غبي", "اعتقد انك حقير", "اسمع انت حمار", "احس انك ظالم معي"])(
    "an opinion said now is a direct insult: %s",
    (t) => expectBlocked(t),
  );

  it("an opinion told in the past is a story", () => {
    expectReview("كنت اظن انك ظالم بس طلعت احن معلم");
    expectClean("كنا نقول انك قاسي بس طلعت ابونا");
  });

  it.each(["درجاتي 100, 100, 100, 99", "صفوف 1,2,3,4,5,6,7,8,9,10", "من 1/9/2023 – 30/6/2024 كنت في فصلك"])(
    "number lists and date ranges are not phones: %s",
    (t) => expectClean(t),
  );

  it.each(["رقمي 055،123،4567", "00966،55،1234567", "0020،100،123،4567"])("list-shaped phones still block: %s", (t) =>
    expectBlocked(t, "contact_info"),
  );

  it.each(["عساك تقبرني يا استاذ", "الواير انقطع", "واير الشاحن خربان"])("passes: %s", (t) => expectClean(t));
});

describe("checkText — speed", () => {
  it("checks a 600-character letter in well under 5 ms", () => {
    const letter = CLEAN_BODIES[CLEAN_BODIES.length - 1].padEnd(600, " شكراً يا أستاذ");
    for (let i = 0; i < 20; i++) checkText(letter);
    const runs = 100;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) checkText(letter);
    expect((performance.now() - t0) / runs).toBeLessThan(5);
  });
});

describe("checkText — details", () => {
  it("never treats years or short numbers as phone numbers", () => {
    for (const t of ["من 2010 - 2014 - 2018 كنت معك", "تخرجت ١٤٤٠ - ١٤٤٤", "الصف 3/2", "درجة 99.5 من 100"]) {
      expect(checkText(t)).toMatchObject({ ok: true });
    }
  });

  it("does not see domains in abbreviations with dots", () => {
    for (const t of ["Ms.Sarah taught us well", "Dr.Abdulaziz is the best", "U.S.A trip", "Ph.D in physics", "K.S.A"]) {
      expect(checkText(t).ok).toBe(true);
    }
  });

  it("returns ok for empty text", () => {
    expect(checkText("")).toEqual({ ok: true, reason: null, matches: [], soft: [] });
  });

  it("reports profanity before contact info", () => {
    expect(checkText("يا حمار كلمني 0551234567").reason).toBe("profanity");
  });

  it("measures how much of a text is Arabic", () => {
    expect(arabicShare("شكراً يا أستاذة نورة على كل شي")).toBe(1);
    expect(arabicShare("Thank you so much for everything you did")).toBe(0);
    expect(arabicShare("💜💜")).toBeNull();
  });
});

describe("wordlists", () => {
  const all = [...ALWAYS, ...ADDRESSED, ...SOFT].flatMap((p) => expandPattern(p.replace(/^=/, "")));

  it("stores entries already normalised", () => {
    for (const w of all) expect(normalizeArabic(w)).toBe(w);
  });

  it("expands brace patterns", () => {
    expect(expandPattern("كس{ك,ها,}")).toEqual(["كسك", "كسها", "كس"]);
    expect(expandPattern("{a,b}x{1,2}")).toEqual(["ax1", "ax2", "bx1", "bx2"]);
  });
});
