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
  giftLink: "تبي ترسل له هدية؟ 🎁",
  submit: "إرسال",
  submitting: "جاري الإرسال…",

  moderationError: "رسالتك فيها كلمات ما تناسب المكان 🙏 عدّلها شوي وأرسلها",
  rateLimited: "أرسلت رسائل كثير بوقت قصير، جرّب بعد شوي 💜",
  genericError: "صار خطأ بسيط، حاول مرة ثانية",

  successTitle: "وصلت رسالتك 💜",
  successLead: "رسالتك صارت على جدار الامتنان. شاركها مع معلمك عشان يشوفها!",
  writeAnother: "اكتب رسالة ثانية",

  wallTitle: "جدار الامتنان",
  wallCta: "يمكن أحد كتب لك… اسمك موجود؟ 👀",
  searchPlaceholder: "ابحث عن اسمك أو اسم مدرستك 🔍",
  sortNew: "الأحدث",
  sortTop: "الأكثر حب",
  loadMore: "عرض المزيد",
  emptySearch: "ما لقينا رسائل بهالاسم… يمكن تكون أول من يكتب له!",
  emptySearchCta: "اكتب له رسالة ✍️",
  emptyWall: "كن أول من يكتب رسالة شكر لمعلمه 💜",
  readMore: "اقرأ الرسالة",
  anonymousFrom: "أحد طلابك",
  like: "أعجبني",
  share: "مشاركة",
  report: "إبلاغ",

  stamp: "شكراً معلمي",
  shareTitle: (to: string) => `رسالة شكر إلى ${to} 💜`,
  shareText: (to: string) =>
    `أحد طلابك كتب لك رسالة شكر يا ${to} 💜 اقرأها هنا:`,

  footerNote:
    "كل الرسائل تمر على فلتر آلي قبل النشر. شفت شي مو مناسب؟ اضغط «إبلاغ» على الرسالة.",
  footerCampaign: "حملة يوم المعلم من ذا شفز",
} as const;
