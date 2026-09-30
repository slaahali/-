// Public, client-safe configuration + campaign copy.
// Anything secret belongs in src/lib/server-config.ts instead.

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export const SITE_URL = trimSlash(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
);

const UTM =
  "utm_source=teachers_day_letters&utm_medium=website&utm_campaign=teachers_day_2026";

function withUtm(url: string) {
  return url + (url.includes("?") ? "&" : "?") + UTM;
}

/** The Chefz gifts page. TODO(brand): confirm the final URL / app deep link. */
export const GIFT_URL = withUtm(
  process.env.NEXT_PUBLIC_GIFT_URL || "https://thechefz.co/",
);

/** Main brand site, used by the logo link in the footer. */
export const BRAND_URL = process.env.NEXT_PUBLIC_BRAND_URL || "https://thechefz.co/";

export const HASHTAG = process.env.NEXT_PUBLIC_HASHTAG || "#شكرا_معلمي";

export const permalink = (id: string) => `${SITE_URL}/m/${id}`;
export const searchLink = (q: string) => `${SITE_URL}/?q=${encodeURIComponent(q.trim())}#letters`;

// ---------------------------------------------------------------------------
// Copy. Final wording is owned by the content team; keep it all here so they
// can edit a single file.
// ---------------------------------------------------------------------------
export const COPY = {
  brand: "ذا شفز",
  badge: "يوم المعلم ✨ ٥ أكتوبر",
  heroTitle: "كلنا كان لنا معلّم",
  heroTitleEmoji: "💜",
  heroLead: [
    "خلال رحلتك الدراسية أكيد ذاكرتك تحتفظ بمعلمين مروا عليك وأثروا فيك ✨..",
    "ودك تسرق اللحظة اللي تشوفهم فيها ثانية وتشكرهم من أعماقك؟!",
  ],
  heroCtaWrite: "اكتب رسالتك ✍️",
  heroCtaSearch: "اسمك موجود؟ 👀",
  sceneHint: "الرسائل الطايرة كلها من ناس حقيقيين — اضغط على وحدة واقرأها",

  writeTitle: "ذا شفز سهّلها عليك 😍",
  writeLead:
    "الآن تقدر تعبّر لمعلمك (تذكّره بموقف حصل بينكم ✨ أو عبارة كان يرددها ومازالت عالقة براسك لليوم 💜) اكتب رسالتك له هنا.",
  writeGiftLead: "ولو عندك رقمه تقدر ترسل له هدية 🎁💐 (مايحتاج اللوكيشن 😉)",

  labelTo: "إلى:",
  labelTitle: "اللقب",
  placeholderTo: "اكتب اسم المعلم",
  labelSchool: "اسم المدرسة / الجامعة",
  placeholderSchool: "مثال: ثانوية الملك فهد، جامعة الملك سعود…",
  optional: "اختياري",
  labelBody: "رسالتك",
  bodyPlaceholders: [
    "تذكر يوم قلت لي…",
    "للحين أتذكر عبارتك: …",
    "شكراً لأنك آمنت فيني يوم ما أحد آمن…",
    "بفضلك صرت أحب…",
  ],
  labelFrom: "اسم المرسل (الطالب)",
  placeholderFrom: "اسمك — أو خلّه سر 🤫",

  labelColor: "اختر لون الكارد",
  labelMemory: "في ذكرى 🤍",
  memoryHint: "إذا معلمك متوفى — تنعرض رسالتك بشكل هادئ ومحترم",

  surpriseTitle: "نبي نفاجئ معلمك! 🎁🎥",
  surpriseLead:
    "بنختار مجموعة من أجمل الرسائل ونفاجئ المعلمين بهدية من ذا شفز. تبي نتواصل معك لو انختارت رسالتك؟",
  surpriseOptIn: "إيه، تواصلوا معي لو انختارت رسالتي",
  labelContact: "رقم جوالك أو إيميلك",
  placeholderContact: "05xxxxxxxx أو name@email.com",
  contactPrivacy:
    "ما ينشر أبداً — يشوفه فريق ذا شفز بس، ونستخدمه للتواصل معك بخصوص المفاجأة فقط.",

  giftLink: "تبي ترسل له هدية؟ 🎁",
  submit: "إرسال",
  submitting: "جاري الإرسال…",

  moderationError: "رسالتك فيها كلمات ما تناسب المكان 🙏 عدّلها شوي وأرسلها",
  rateLimited: "وصلت للحد اليومي من الرسائل 💜 تقدر ترسل رسائل ثانية بكرة",
  genericError: "صار خطأ بسيط، حاول مرة ثانية",

  successTitle: "وصلت رسالتك 💜",
  successLead: "رسالتك صارت على جدار الامتنان. شاركها مع معلمك عشان يشوفها!",
  pendingTitle: "وصلت رسالتك 💜",
  pendingLead:
    "بتنشر بعد مراجعة سريعة من فريقنا (نراجع بعض الرسائل يدوياً عشان يبقى الجدار آمن للكل).",
  writeAnother: "اكتب رسالة ثانية",

  wallTitle: "جدار الامتنان",
  wallCta: "يمكن أحد كتب لك… اسمك موجود؟ 👀",
  searchPlaceholder: "ابحث عن اسمك أو اسم مدرستك",
  sortNew: "الأحدث",
  sortTop: "الأكثر حب",
  loadMore: "عرض المزيد",
  searchResults: (n: string, q: string) => `${n} رسالة لـ «${q}»`,
  shareSearch: "شارك النتيجة",
  shareSearchText: (q: string, n: number) =>
    n > 0 ? `شوف رسائل الشكر اللي انكتبت لـ «${q}» 💜` : `يمكن أحد كتب لك… ابحث عن اسمك 👀`,
  // Search found nothing → the page becomes an invitation.
  emptySearchTitle: "ما أحد كتب لك للحين؟",
  emptySearch: "ابدأ أنت واكتب لأحد علّمك 💜",
  emptySearchCtaTo: (q: string) => `اكتب رسالة لـ «${q}» ✍️`,
  emptySearchCta: "اكتب لأحد علّمك ✍️",
  emptyWall: "كن أول من يكتب رسالة شكر لمعلمه 💜",
  readMore: "اقرأ الرسالة",
  anonymousFrom: "أحد طلابك",
  like: "أعجبني",
  memoryLike: "دعوة بالرحمة",
  memoryTag: "في ذكرى 🕊️",
  share: "مشاركة",

  report: "إبلاغ / طلب حذف",
  reportReasons: {
    inappropriate: "محتوى غير لائق",
    removal_request: "أنا الشخص المذكور وأبي أحذفها",
    other: "سبب آخر",
  },
  reportDone: "شكراً، بنراجعها 🙏",
  removalDone: "أخفينا الرسالة وبنراجع طلبك 🙏",

  stamp: "شكراً معلمي",
  memoryStamp: "في ذكراك 🤍",
  shareTitle: (to: string) => `رسالة شكر إلى ${to} 💜`,
  shareText: (to: string) =>
    `أحد طلابك كتب لك رسالة شكر يا ${to} 💜 اقرأها هنا:`,
  memoryShareText: (to: string) => `رسالة وفاء إلى روح ${to} 🤍`,

  footerNote:
    "كل الرسائل تمر على فلتر آلي قبل النشر. شفت شي مو مناسب؟ اضغط «إبلاغ» على الرسالة.",
  footerCampaign: "حملة يوم المعلم من ذا شفز",
} as const;
