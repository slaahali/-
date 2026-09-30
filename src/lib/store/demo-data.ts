// Demo letters for local development (seeded into the file store when it's empty).
// They go through the same limits as real submissions (see demo-data.test.ts).
// Contacts are obviously fake (+9665000000xx / example.com).

import type { CreateMessageInput } from "../types";

export interface DemoLetter extends CreateMessageInput {
  likes: number;
  /** How long ago it was "written", relative to seeding time. */
  hoursAgo: number;
  /** Defaults to published. */
  status?: "published" | "pending";
}

export const DEMO_PENDING_REASON = "suspicious: demo";

type Letter = Omit<DemoLetter, "inMemory" | "surpriseOptIn" | "contact"> &
  Partial<Pick<DemoLetter, "inMemory" | "surpriseOptIn" | "contact">>;

const LETTERS: Letter[] = [
  {
    title: "ustadh",
    toName: "عبدالله الشهري",
    school: "ثانوية الملك فهد",
    fromName: "فيصل",
    variant: 0,
    likes: 184,
    hoursAgo: 3.2,
    surpriseOptIn: true,
    contact: "+966500000001",
    body: "أستاذي العزيز، للحين أتذكر يوم قلت لي قدّام الفصل: «الرياضيات مو صعبة، أنت بس ما صادقتها». من يومها صادقتها، واليوم أنا مهندس بسببك.\nشكراً لأنك ما استسلمت علي 💜",
  },
  {
    title: "dr_f",
    toName: "هيفاء القحطاني",
    school: "جامعة الملك سعود",
    fromName: "ريم",
    variant: 2,
    likes: 97,
    hoursAgo: 7.5,
    body: "دكتورة هيفاء، كنتِ أول وحدة تقول لي إن بحثي يستاهل يُنشر. سهرتي معنا قبل المناقشة وردّيتي على رسايلنا حتى بالإجازة. اليوم أنا معيدة وأحاول أكون مثلك مع طالباتي. شكراً من القلب ✨",
  },
  {
    title: "ustadh",
    toName: "سعد الدوسري",
    school: "متوسطة الأمير سلطان",
    fromName: null,
    variant: 5,
    inMemory: true,
    likes: 240,
    hoursAgo: 101,
    body: "أستاذ سعد… ما لحقت أقولها لك وأنت موجود.\nكنت تشتري لنا فطور من جيبك إذا شفت أحد ما جاب، وتقول: «العلم ما يدخل بطن فاضية». توفيت قبل سنتين، وللحين كل ما مريت على المدرسة أدعي لك.\nالله يرحمك ويجعل كل حرف علمتنا إياه في ميزان حسناتك. شكراً معلمي، ولو متأخرة 🤍",
  },
  {
    title: "ustadha",
    toName: "منيرة الحربي",
    school: "الابتدائية ١٢٠ بجدة",
    fromName: "جود",
    variant: 1,
    likes: 132,
    hoursAgo: 26,
    body: "أبلة منيرة 😂 تذكرين يوم أرنب الفصل هرب وقعدنا الحصة كلها ندوّر عليه تحت الطاولات، وأنتِ تقولين «هذا درس علوم عملي»؟ أحلى حصة علوم بحياتي. شكراً لأنك خليتي المدرسة مكان نحبه 💜",
  },
  {
    title: null,
    toName: "مس سارة",
    school: "Riyadh International School",
    fromName: "لمى",
    variant: 4,
    likes: 58,
    hoursAgo: 49,
    surpriseOptIn: true,
    contact: "lama.demo@example.com",
    body: "Ms. Sarah, you taught me English… بس الحقيقة علمتيني أتكلم بدون خوف. كنت أستحي أقرأ قدام الفصل، وكل مرة تقولين: «Mistakes mean you are trying». اليوم أقدّم عروض في شغلي بكل ثقة. Thank you 💛",
  },
  {
    title: "dr_m",
    toName: "محمد الغامدي",
    school: "جامعة الملك عبدالعزيز",
    fromName: "عبدالرحمن",
    variant: 3,
    likes: 41,
    hoursAgo: 12,
    body: "دكتور محمد، محاضرتك الساعة ٨ الصبح كانت الوحيدة اللي ما أغيب عنها 😅 مو بس لأنك تحضّر، لأنك كنت تشرح كأنك تحكي قصة. شكراً يا دكتور.",
  },
  {
    title: "ustadha",
    toName: "أمل",
    school: null,
    fromName: null,
    variant: 2,
    likes: 12,
    hoursAgo: 1.1,
    body: "شكراً لأنك آمنتِ فيني يوم ما أحد آمن 💜",
  },
  {
    title: "ustadh",
    toName: "خالد المطيري",
    school: "مدارس المملكة",
    fromName: "نايف",
    variant: 1,
    likes: 76,
    hoursAgo: 55,
    body: "أستاذ خالد، كنت مدرب كورة ومعلم رياضيات بنفس الوقت، وتقول: «اللي يحل المسألة يلعب أول» 😂 صرنا أشطر فصل بالرياضيات عشان الكورة. شكراً على كل شي.",
  },
  {
    title: "dr_f",
    toName: "لطيفة السبيعي",
    school: "جامعة الأميرة نورة بنت عبدالرحمن",
    fromName: "شهد",
    variant: 0,
    likes: 163,
    hoursAgo: 78,
    surpriseOptIn: true,
    contact: "+966500000002",
    body: "دكتورتي الغالية، قبل عشر سنوات دخلت قاعتك وأنا طالبة خايفة من كل شي: من التخصص، من الاختبارات، ومن فكرة إني ما أكون كفو.\nفي أول محاضرة كتبتِ على السبورة: «ما فيه سؤال صغير، فيه سؤال ما انسأل». من يومها صرت أسأل، وأسأل كثير 😅 وكنتِ تجاوبين بنفس الابتسامة كل مرة.\nلما تعثرت في السنة الثالثة ما عاملتيني كرقم، جلستي معي بعد المحاضرة ورتبنا خطة مذاكرة سوا. اليوم أنا أستاذة في نفس الجامعة، وكل ما دخلت قاعة أتذكرك وأحاول أكون لطالباتي مثل ما كنتِ لي.\nشكراً لأنك علمتيني إن التعليم رحمة قبل ما يكون منهج 💜",
  },
  {
    title: "ustadh",
    toName: "إبراهيم الزهراني",
    school: "ثانوية الملك فهد",
    fromName: null,
    variant: 3,
    likes: 29,
    hoursAgo: 20,
    body: "أستاذ إبراهيم، حصة العربي عندك كانت شعر وقصص ونكت 😄 حبّبتني في المتنبي وأنا اللي كنت أنام بالحصة. شكراً.",
  },
  {
    title: "ustadha",
    toName: "فاطمة الشمري",
    school: "المتوسطة الرابعة بحائل",
    fromName: "غلا",
    variant: 5,
    likes: 64,
    hoursAgo: 90,
    body: "أستاذة فاطمة، يوم توفى أبوي كنتِ أول وحدة تتصل على أمي تطمّن علي، وخليتيني أقعد معك بالفسحة أسبوع كامل بدون ما تسأليني شي. ما نسيتها لك أبد 🤍",
  },
  {
    title: "dr_m",
    toName: "عبدالعزيز العمري",
    school: "جامعة الملك فهد للبترول والمعادن",
    fromName: "عمر",
    variant: 4,
    likes: 88,
    hoursAgo: 38,
    body: "Dr. Abdulaziz، شكراً على كل ساعات المكتب اللي طولت ساعة زيادة بسببي 😅 وعلى جملتك: «المهندس الشاطر يعرف وش اللي ما يعرفه». تخرجت واشتغلت، ولسّا أرددها.",
  },
  {
    title: "ustadha",
    toName: "هيا الدوسري",
    school: "روضة الأطفال الثامنة",
    fromName: "أم ريان",
    variant: 1,
    likes: 51,
    hoursAgo: 16,
    body: "أستاذة هيا، ريان كل يوم يرجع البيت ويقول: «أبلة هيا قالت…» صرتي قدوته قبل أبوه 😂 شكراً على صبرك وحبك لأطفالنا.",
  },
  {
    title: "ustadh",
    toName: "ناصر",
    school: null,
    fromName: null,
    variant: 0,
    likes: 3,
    hoursAgo: 0.4,
    body: "يا أستاذ ناصر، علمتني إن الخط الحلو يبدأ من الصبر. للحين أكتب بالقلم اللي أهديتني إياه ✍️",
  },
  {
    title: "dr_f",
    toName: "نوف الرشيد",
    school: "جامعة الإمام عبدالرحمن بن فيصل",
    fromName: "سارة",
    variant: 2,
    likes: 110,
    hoursAgo: 64,
    body: "دكتورة نوف، لما قلت لك إني بنسحب من الطب لأني ما أتحمل الضغط، ما قلتي لي «تحمّلي». قلتي: «خذي نفس، وخلينا نشوف وش اللي يضغطك».\nالحين أنا بسنة الامتياز 🩺 شكراً لأنك شفتيني قبل ما تشوفين درجاتي.",
  },
  {
    title: "ustadh",
    toName: "فهد العنزي",
    school: "Al Nakheel International School",
    fromName: "Yousef",
    variant: 3,
    likes: 34,
    hoursAgo: 44,
    body: "Mr. Fahad, كنت تدرّسنا الفيزياء بالعربي والإنجليزي وتخلط بينهم بطريقة تضحّك 😂 بس فهمنا! شكراً لأنك خليت الفيزياء شي نستمتع فيه.",
  },
  {
    title: "ustadha",
    toName: "عبير الحمدان",
    school: "الثانوية الثالثة عشرة بالرياض",
    fromName: "دانة",
    variant: 4,
    likes: 37,
    hoursAgo: 30,
    body: "أستاذة عبير، كنتِ تكتبين لكل وحدة فينا ملاحظة صغيرة على ورقة الاختبار حتى لو الدرجة كاملة. الورقة اللي كتبتِ فيها «فخورة فيك» للحين محتفظة فيها بدرج مكتبي 💌",
  },
  {
    title: "ustadh",
    toName: "يوسف الحارثي",
    school: "ابتدائية الفارابي",
    fromName: null,
    variant: 5,
    likes: 19,
    hoursAgo: 5,
    body: "أستاذ يوسف، أنت اللي علمتني أقرأ. حرفياً. شكراً 💜",
  },
  {
    title: null,
    toName: "كل معلماتي",
    school: "مدارس المملكة",
    fromName: "خريجة دفعة ٢٠٢٠",
    variant: 1,
    likes: 72,
    hoursAgo: 122,
    body: "إلى كل معلمة وقفت في الطابور الصباحي في البرد، وصحّحت أوراقنا حتى آخر الليل، وتحمّلت ضجيجنا وضحكنا وأعذارنا: أنتنّ بطلات حقيقيات 💪 شكراً لكنّ من قلب كل طالبة مرّت عليكنّ.",
  },
  {
    title: "dr_m",
    toName: "سلطان القرني",
    school: "جامعة الملك خالد",
    fromName: "عبدالله",
    variant: 0,
    likes: 45,
    hoursAgo: 70,
    body: "دكتور سلطان، في مشروع التخرج قلت لنا: «ما أبي مشروع مثالي، أبي مشروع حقيقي». بنينا تطبيق يخدم مزارعين عسير، واليوم صار شركة ناشئة 🌱 شكراً لأنك وثقت فينا.",
  },
  {
    title: "ustadha",
    toName: "مها الغامدي",
    school: "المتوسطة الحادية عشرة بالدمام",
    fromName: null,
    variant: 2,
    likes: 8,
    hoursAgo: 9,
    body: "أستاذة مها، ما كنت أحب الرسم لين قلتي إن الخربشة فن 🎨 شكراً!",
  },
  {
    title: "ustadh",
    toName: "علي العسيري",
    school: "ثانوية أبها الأولى",
    fromName: "تركي",
    variant: 3,
    likes: 150,
    hoursAgo: 112,
    body: "أستاذ علي، تذكر يوم نسيت اسمي وسمّيتني «ولد الكرسي الأخير» طول الترم؟ 😂 للحين الشباب ينادوني فيها. بس الأهم إنك كنت تجي عند الكرسي الأخير كل حصة وتتأكد إني فاهم. شكراً يا أستاذ.",
  },
  {
    title: "dr_f",
    toName: "أريج المالكي",
    school: "جامعة طيبة",
    fromName: "بيان",
    variant: 4,
    likes: 23,
    hoursAgo: 84,
    body: "دكتورة أريج، شكراً على كل «ممتاز، بس تقدرين أحسن» 😅 كانت تقهرني وقتها، والحين فهمتها 💜",
  },
  {
    title: "ustadh",
    toName: "حمد",
    school: "مدرسة تحفيظ القرآن الكريم ببريدة",
    fromName: null,
    variant: 5,
    inMemory: true,
    likes: 0,
    hoursAgo: 136,
    body: "أستاذي الفاضل حمد، رحمك الله رحمةً واسعة. ختمتُ القرآن على يديك وأنا ابن اثنتي عشرة سنة، وما زالت دعواتك لي بعد كل حلقة تتردد في أذني. جزاك الله عني خير الجزاء، وجعل كل حرفٍ علّمتنا إياه نوراً لك 🤍",
  },

  // Waiting in the /admin review queue.
  {
    title: "ustadh",
    toName: "ماجد",
    school: "ثانوية الملك عبدالعزيز",
    fromName: "بندر",
    variant: 1,
    likes: 0,
    hoursAgo: 2,
    status: "pending",
    body: "أستاذ ماجد، كنت أشاغب بحصتك كثير وأنت تصبر علي 😅 السموحة منك، وشكراً لأنك ما طلّعتني من الفصل ولا مرة!",
  },
  {
    title: "ustadha",
    toName: "نورة العتيبي",
    school: "Kingdom Schools",
    fromName: null,
    variant: 4,
    likes: 0,
    hoursAgo: 6,
    status: "pending",
    body: "أستاذة نورة، أنتِ السبب إني دخلت الأدب الإنجليزي 📚 شكراً على كل رواية نصحتينا فيها، وعلى صبرك على نطقي 😅",
  },
];

export const DEMO_LETTERS: DemoLetter[] = LETTERS.map((l) => ({
  ...l,
  inMemory: l.inMemory ?? false,
  surpriseOptIn: l.surpriseOptIn ?? false,
  contact: l.surpriseOptIn ? (l.contact ?? null) : null,
}));

export type DemoMessage = CreateMessageInput & {
  likes: number;
  createdAt: string;
  status: "published" | "pending";
  reviewReason: string | null;
};

/** Demo letters with absolute timestamps (the last 6 days relative to `now`). */
export function buildDemoMessages(now: number = Date.now()): DemoMessage[] {
  return DEMO_LETTERS.map(({ hoursAgo, status = "published", ...letter }) => ({
    ...letter,
    status,
    reviewReason: status === "pending" ? DEMO_PENDING_REASON : null,
    createdAt: new Date(now - Math.round(hoursAgo * 3_600_000)).toISOString(),
  }));
}
