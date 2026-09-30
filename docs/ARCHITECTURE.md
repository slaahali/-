# Teacher's Day Letters — architecture & build spec

A The Chefz campaign microsite for World Teachers' Day (5 Oct): visitors write
public thank-you letters to a teacher (school teacher or university doctor) who
shaped them, browse everyone else's letters, search for their own name, like and
share letters, and jump to The Chefz gifts page to send that teacher a gift.

Stack: **Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
three.js · Postgres (`postgres` driver) with a JSON-file fallback for dev ·
@resvg/resvg-js for share images · Vitest**.

> Next.js 16 differs from older versions. `params`/`searchParams` are Promises,
> `middleware` is now `proxy`, the `dynamic` segment config is gone — call
> `await connection()` (from `next/server`) before request-time data reads.
> Bundled docs: `node_modules/next/dist/docs/`. `PageProps<'/m/[id]'>`,
> `LayoutProps`, `RouteContext<'/api/x/[id]'>` are global type helpers.

---

## 1. Creative direction

### The reference ("Endless Letter")
A dark WebGL page where hundreds of **triangle-folded paper letters** float in
3D space with depth fog and dust particles. Hovering a letter shows its author's
name in handwriting next to it; clicking opens a **letter view**: an overlay with
a round ✕ close button at top-centre, an illustration card on one side (a 3D-tilted
card with a sketch/photo) and the letter text in a handwriting font on the other,
signed with the author's name and a rubber **stamp** ("KILLED IN ACTION") slanted
across it. Closing sends you back into the floating field.

### Our version
Same mechanics, but **light, warm and practical**, in The Chefz identity:

- Background: warm cream `--color-canvas #fbf7f2` with soft peach/plum glows.
  Letters are cream/white paper with faint ruled lines and plum "handwriting",
  an orange heart wax seal, soft shadows — **no dark theme**.
- Brand colours: plum `#691d4e` (primary text/structure), orange `#eb652c`
  (CTAs/accents), magenta-plum `#a73784`, gold `#f7a64f`, cream `#f8f3ec`.
  Tokens live in `src/app/globals.css` (`@theme`). Use them; don't invent colours.
- Phone type scale (`@theme` `--text-*`, used as `text-caption` … `text-h2`):
  caption 13 · small 14 · ui 15 · body 16 · lead 17 · letter 18 · title 22 · h3 28 ·
  h2 32 (px). Phone sizes go in base classes, wider screens keep theirs behind
  `sm:`; nothing visible under 13px. In-page links use one offset: `html`
  `scroll-padding-top` (header + 16px), no per-section `scroll-mt` on phones.
- Fonts (self-hosted): **IBM Plex Sans Arabic** for UI (`font-sans`), **Aref Ruqaa**
  for anything "handwritten" — letter bodies in the letter view, signatures,
  names on hover, the stamp (`font-hand` class / `var(--font-hand)`).
- The stamp becomes **«شكراً معلمي»** in the letter's accent colour (**«في ذكراك 🤍»** for in-memory letters).
- 3D icons (Higgsfield renders, satin-matte Chefz style) via `<Icon3D name=… />`
  from `src/components/ui/Icon3D.tsx`: `letter gift books pencil cap plane search heart`.
  They may be missing at runtime (Icon3D falls back to an emoji), so layouts must
  look fine either way — never rely on the icon for meaning.
- **The writer picks the card colour** (6 Chefz colours) → stored as `variant` (0..5).
  Always style a letter with `cardStyle(m)` from `src/lib/assets.ts` → `{ name, accent, bg, ink, gradient, icon }`:
  the WHOLE card background is `bg` (text in `ink`), `accent` for band/stamp/heart,
  `gradient` + `icon` for the illustration card and share images. In-memory letters
  always get `MEMORY_STYLE` (calm grey-lavender) whatever colour was picked.
- **«في ذكرى» (inMemory)** letters — for teachers who passed away: shown with
  respect. `toLine(m)` → «إلى روح أستاذة نورة»; tag `COPY.memoryTag` «في ذكرى 🕊️»;
  stamp `stampFor(m)`; the like button becomes 🤍 with label `COPY.memoryLike`
  «دعوة بالرحمة» (same API); no confetti/burst animations; share text `shareTextFor(m)`.
- Tone: simple, emotional, interactive; the letters themselves get the most space.

### Page flow (single page, RTL)
1. **Header** — The Chefz logo (start/right), links «اكتب رسالتك» «ابحث عن اسمك», gift pill.
   Phones (< 768px): a 56px bar with logo + «اكتب رسالتك» + gift icon + `SoundToggle`
   (the sound switch moves into the bar so it covers no buttons; from `md` it is
   fixed at the bottom-end corner).
2. **Hero** — full-bleed 3D field of floating folded letters (real letters from the
   wall). Centre: badge, title «كلنا كان لنا معلّم 💜», two lead lines, CTAs
   (write → `#write`, «اسمك موجود؟ 👀» → `#letters`), live counter, hint.
3. **Write** (`#write`) — letter-paper form: To (title chips أستاذ/أستاذة/الدكتور/الدكتورة
   + name), school/university (optional), message (big textarea + counter), sender
   name (optional), **card colour picker** (6 swatches, live-tints the paper),
   **«في ذكرى 🤍» toggle**, and an optional **surprise opt-in** block (checkbox +
   private phone/email, see §1b). Bottom row: gift link «تبي ترسل له هدية؟ 🎁» at the
   start side, primary «إرسال» at the end side. Moderation errors inline. On success
   the paper folds + flies away and a success panel offers share / story image /
   gift / write again — or, when the API says `status: "pending"`, a "published
   after review" panel (no share: the permalink 404s until approved).
4. **Search + Wall** (`#letters`) — «يمكن أحد كتب لك… اسمك موجود؟ 👀», big search
   bar «ابحث عن اسمك أو اسم مدرستك 🔍», sort (الأحدث / الأكثر حب), masonry of
   colourful letter cards (To + school + text + signature + ❤️ like + share), «عرض المزيد».
   **Search results are shareable**: the URL is `/?q=<query>#letters` (server-rendered
   with results, own OG image `/api/og/search?q=`), and a «شارك النتيجة» button
   shares `searchLink(q)`. **No results → the page becomes an invitation**:
   «ما أحد كتب لك للحين؟ ابدأ أنت واكتب لأحد علّمك 💜» with two CTAs: write to
   «<query>» (prefill) and write to someone else.
5. **Letter view** (modal, URL `/m/:id`) — the reference's opened-letter screen.
6. **Footer** — logo, campaign line, moderation note, hashtag.

### 1b. Trust & safety + campaign ops (from the brief)
- **Auto filter + humans.** `MODERATION_MODE` env: `auto` (publish what passes),
  `review_suspicious` (**default** — anything the filter isn't sure about goes to
  `pending`), `review_all` (every letter waits for approval, like The Unsent Project).
  Pending letters are invisible publicly until a moderator publishes them in /admin.
- **Rate limits.** Per device (voter cookie) `SUBMIT_LIMIT_PER_DAY` (default 3, set
  1 for one-a-day) + per IP 15/day + burst 5/10 min per IP.
- **«إبلاغ / طلب حذف».** Every letter has a report action with reasons:
  `inappropriate`, `removal_request` («أنا الشخص المذكور وأبي أحذفها»), `other`.
  A removal request **immediately** moves the letter to `pending` (hidden) with
  `removalRequested=true` for a human to confirm. Inappropriate reports auto-hide
  (→ pending) at `REPORT_HIDE_THRESHOLD` distinct reporters.
- **Surprise content.** Optional opt-in in the form: «إيه، تواصلوا معي لو انختارت
  رسالتي» + phone/email (`contact`, validated Saudi mobile or email). **Private**:
  never in any public response, OG image, or share card; visible in /admin only.
  Admin can ⭐ star letters (shortlist for the on-camera gift surprise) and export
  starred / opted-in letters with contacts as CSV.

### Non-negotiables
- **Mobile first.** Most traffic comes from social links. 16px side gutters, no
  horizontal scroll, tap targets ≥ 44px, inputs ≥ 16px font (iOS zoom).
- **RTL.** `<html dir="rtl" lang="ar">`. Use logical utilities (`ms-/me-/ps-/pe-/start-/end-`,
  `text-start`), never `left/right` for layout. Latin text (URLs) gets `dir="ltr"`.
- **Accessibility.** Real `<button>`/`<a>`, labels on every input, `aria-live`
  for errors/success, focus trap + Esc in the modal, visible focus rings,
  `prefers-reduced-motion` respected (scene nearly still, no fly animations).
- **Security.** Never `dangerouslySetInnerHTML` user text. Render user text as
  React text with `white-space: pre-line`. Public API responses only ever contain
  `PublicMessage`.
- **Canvas text.** `next/font/local` gives fonts hashed family names. To draw
  with them on a `<canvas>`, read the family list from the CSS variables:
  `getComputedStyle(document.documentElement).getPropertyValue("--font-ruqaa")`
  (and `--font-plex`), then `await document.fonts.load(\`700 48px ${family}\`)`
  before drawing. Set `ctx.direction = "rtl"` for Arabic.
- **Performance.** The three.js scene is lazy-loaded client-only
  (`next/dynamic` with `ssr:false`), capped DPR, fewer letters on mobile, paused
  when off-screen or tab hidden. No other heavy client deps.

---

## 2. Contracts (already written — do not change signatures without reason)

| File | What |
|---|---|
| `src/lib/types.ts` | `PublicMessage` (+`inMemory`), `MessageRecord` (+`status` published/pending/hidden, `removalRequested`, `reviewReason`, `starred`, `surpriseOptIn`, `contact`), `CreateMessageInput`, `CreateMessageBody`, `CreateMessageResponse` (`status`), `ReportBody`/`ReportReason`, `AdminFilter`, `ListQuery`, `ListResult`, `LikeResult`, `ApiError`, `Field`, `InputField`, `LIMITS`, `TEACHER_TITLES`, `VARIANT_COUNT`, **HTTP API table** |
| `src/lib/config.ts` | `SITE_URL`, `GIFT_URL`, `BRAND_URL`, `HASHTAG`, `permalink(id)`, `searchLink(q)`, **all copy** in `COPY` |
| `src/lib/assets.ts` | `ICONS` manifest (local + remote URL, from `icons.json`), `CARD_COLORS`, `MEMORY_STYLE`, `cardStyle(m)`, `colorAt(v)` |
| `scripts/fetch-assets.mjs` | `npm run assets`: downloads the 3D icons to `public/3d/*.webp` |
| `src/lib/events.ts` | `SceneLetter`, `NEW_LETTER_EVENT`, `emitNewLetter()` |
| `src/lib/format.ts` | `displayTo`, `toLine` (memory aware), `shareTextFor`, `stampFor`, `fromName`, `formatCount`, `timeAgo`, `excerpt`, `toSceneLetter` |
| `src/lib/api-client.ts` | browser fetch wrappers: `fetchMessages`, `fetchMessage`, `createMessage` (→ `status`), `likeMessage`, `reportMessage(id, reason, note?)` |
| `src/lib/track.ts` | `track(event, params)` → GTM dataLayer |
| `src/components/LettersProvider.tsx` | `LettersProvider` + `useLetters()` (open/close letter + URL sync, cache, likes, new-message pub/sub, prefill) + `useOpenLetter()` (the open letter + its prev/next; a separate context so opening one doesn't re-render the wall) |
| `src/components/ui/Icon3D.tsx` | 3D icon with local → CDN → emoji fallback |
| `src/app/globals.css` | tokens + component classes: `.container-page .btn .btn-primary .btn-plum .btn-ghost .icon-btn .field .field-label .field-optional .field-error .chip .paper .paper-plain .font-hand .eyebrow .stamp .visually-hidden` |

### Server-side contracts to be implemented

```ts
// src/lib/text/normalize.ts  (owner: moderation)
export function cleanInput(s: string, opts?: { multiline?: boolean }): string;
  // NFC, strip control + zero-width/bidi-override chars, trim, collapse runs of spaces,
  // multiline: keep \n but collapse 3+ newlines to 2; single-line: newlines -> space
export function normalizeArabic(s: string): string;
  // for matching: NFKC, lowercase, strip tashkeel + tatweel, unify أإآٱ->ا, ى->ي, ة->ه,
  // ؤ->و, ئ->ي, Persian ک/ی -> ك/ي, Arabic-Indic digits -> ASCII, punctuation -> space, collapse spaces
export function stripTitles(normalized: string): string;
  // removes honorifics anywhere as whole words: استاذ/استاذه/الاستاذ/الاستاذه/ا./أ./
  // دكتور/دكتوره/الدكتور/الدكتوره/د./د/المعلم/المعلمه/معلم/معلمه/مس/ميس/ms/mr/mrs/dr …
export function buildSearchText(m: { title: TeacherTitle | null; toName: string; school: string | null }): string;
  // stripTitles(normalizeArabic(toName)) + " " + normalizeArabic(school ?? "")
export function tokenizeQuery(q: string): string[];
  // stripTitles(normalizeArabic(q)) split on spaces, drop empties, dedupe, max 6 tokens
export function matchesQuery(searchText: string, tokens: string[]): boolean;
  // every token is a substring of searchText (AND)

// src/lib/moderation/index.ts  (owner: moderation)
export type ModerationReason = "profanity" | "contact_info" | "link" | "spam" | "ai_flagged";
export interface ModerationVerdict {
  ok: boolean;
  fields: Field[];              // which inputs triggered it (for highlighting)
  reason: ModerationReason | null;
  layer: "wordlist" | "ai" | "none";
  message: string;              // Arabic, user-facing, from COPY or specific per reason
  /** ok=true but not sure (soft word hit, AI unsure/unavailable…) → pending under review_suspicious */
  suspicious: boolean;
  suspicionReason?: string;
}
// Checks only the PUBLIC fields (toName, school, body, fromName) — never `contact`.
export async function moderateSubmission(input: CreateMessageInput): Promise<ModerationVerdict>;

// src/lib/data.ts  (owner: data) — for Server Components / route handlers
export async function getInitialWall(q?: string): Promise<ListResult>; // sort "new", limit 18, optional search
export async function getPublicMessage(id: string): Promise<PublicMessage | null>;
export async function getTotal(): Promise<number>;

// src/lib/store/index.ts  (owner: data)
export function getStore(): MessageStore; // Postgres when DATABASE_URL, else JSON file in .data/
```

---

## 3. Module ownership (one owner per file — only edit files you own)

**moderation** — `src/lib/text/**`, `src/lib/moderation/**` (+ `*.test.ts` there).

**data** — `src/lib/server-config.ts`, `src/lib/ids.ts`, `src/lib/validation.ts`,
`src/lib/request.ts`, `src/lib/ratelimit.ts`, `src/lib/admin-auth.ts`,
`src/lib/data.ts`, `src/lib/store/**`, `db/**`, `scripts/db-schema.mjs`,
`src/app/api/messages/**`, `src/app/api/admin/**` (+ tests).

**scene** — `src/components/scene/**`.

**share** — `src/lib/share/**`, `src/lib/og/**`, `src/components/share/**`,
`src/app/api/og/**`.

**ui-shell** — `src/app/page.tsx`, `src/app/m/**`, `src/app/not-found.tsx`,
`src/components/CampaignPage.tsx`, `src/components/layout/**`,
`src/components/hero/**`, `src/components/write/**`, `public/brand/**`.

**ui-wall** — `src/components/wall/**`, `src/components/letter/**`,
`src/components/ui/LikeButton.tsx`, `src/components/ui/ReportButton.tsx`.

**admin** — `src/app/admin/**`, `src/components/admin/**`.

Component contracts between owners:

```ts
// scene → default export of src/components/scene/LettersScene.tsx ("use client")
export interface LettersSceneProps {
  letters: SceneLetter[];          // real letters to float (≤ 40); scene pads with blank ones
  onOpen: (id: string) => void;    // click/tap on a real letter
  className?: string;
}
// also listens to window NEW_LETTER_EVENT and flies the new letter in.

// share → src/components/share/ShareMenu.tsx ("use client")
export function ShareMenu(props: {
  message: PublicMessage;
  /** "full": row of labelled buttons (success panel, letter view). "compact": one icon button that opens a popover/bottom sheet (cards). */
  mode?: "full" | "compact";
  className?: string;
}): JSX.Element;
// share → src/lib/share/storyCard.ts (browser only)
export async function renderStoryCard(m: PublicMessage): Promise<Blob>; // 1080x1920 PNG
export async function shareOrDownloadStoryCard(m: PublicMessage): Promise<"shared" | "downloaded" | "failed">;

// ui-wall → src/components/wall/WallSection.tsx
export function WallSection(props: { initial: ListResult; initialQuery?: string }): JSX.Element; // renders <section id="letters">
// ui-wall → src/components/letter/LetterModal.tsx
export function LetterModal(): JSX.Element | null; // reads useOpenLetter().openMessage
// ui-wall → src/components/ui/LikeButton.tsx
export function LikeButton(props: { message: PublicMessage; size?: "sm" | "md"; labelClassName?: string }): JSX.Element;
  // labelClassName: extra classes for the visible label (the letter bar passes "max-[420px]:sr-only")

// ui-shell → src/components/CampaignPage.tsx ("use client")
export function CampaignPage(props: {
  initial: ListResult;            // wall's first page (already filtered when initialQuery is set)
  initialQuery?: string;          // from /?q= (shareable search)
  heroLetters: PublicMessage[];   // newest unfiltered letters for the 3D scene
  initialOpen?: PublicMessage | null;
}): JSX.Element;
// composes: LettersProvider > Header, Hero, WriteSection, WallSection, Footer, LetterModal
```

---

## 4. Rules for every builder

- Only create/edit files you own. If a contract is missing something, work
  around it locally and mention it in your final report.
- **Do not** install/remove npm packages, and **do not** run `next dev`,
  `next build` or `npm run build` (integration happens afterwards). Installed:
  next 16, react 19, three, postgres, @resvg/resvg-js, vitest, tailwind v4.
- Check your work with `npx tsc --noEmit -p .` (ignore errors in files you don't
  own — other builders are working in parallel) and `npx vitest run <your paths>`.
- User-facing copy is Arabic (Saudi/Gulf friendly, warm). Put new strings next to
  where they're used or in `COPY` if reused.
- Keep comments sparse and useful; match the style of the existing files.
