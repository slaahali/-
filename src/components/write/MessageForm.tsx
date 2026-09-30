"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useLetters } from "@/components/LettersProvider";
import { GiftLink } from "@/components/layout/GiftLink";
import { Icon3D } from "@/components/ui/Icon3D";
import { createMessage } from "@/lib/api-client";
import { CARD_COLORS, cardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { track } from "@/lib/track";
import {
  LIMITS,
  TEACHER_TITLE_KEYS,
  TEACHER_TITLES,
  VARIANT_COUNT,
  type Field,
  type InputField,
  type PublicMessage,
  type TeacherTitle,
} from "@/lib/types";
import styles from "./fold.module.css";
import {
  buildRequestBody,
  charCount,
  clampChars,
  DRAFT_KEY,
  firstInvalid,
  parseDraft,
  serializeDraft,
  validateForm,
  wantsSurprise,
  type Draft,
  type FieldErrors,
  type FormFields,
} from "./form-logic";
import { SuccessPanel } from "./SuccessPanel";

/** idle → submitting → sending (fold-and-fly) → done (success panel). */
type Phase = "idle" | "submitting" | "sending" | "done";
type Banner = { tone: "warn" | "info"; message: string };
type Sent = { message: PublicMessage; status: "published" | "pending" };

const COLOR_KEY = "tcz_color_v1";
const BODY_MAX = LIMITS.body.max;
const BODY_WARN_AT = BODY_MAX - 60;
const PLACEHOLDER_MS = 3500;
const DRAFT_SAVE_MS = 500;
const MEMORY_COLOR_NOTE = "رسائل «في ذكرى» تنعرض بلون هادئ موحّد 🤍";
const MODERATION_FIELD_NOTE = "عدّل هذا الجزء شوي 🙏";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function readDraft(): Draft | null {
  try {
    return parseDraft(window.localStorage.getItem(DRAFT_KEY));
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    const raw = serializeDraft(draft);
    if (raw) window.localStorage.setItem(DRAFT_KEY, raw);
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode / storage full — drafts are a nicety */
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** A random card colour, kept for the whole visit so the paper doesn't change on reload. */
function sessionColor(): number {
  try {
    const stored = window.sessionStorage.getItem(COLOR_KEY);
    const v = stored === null ? NaN : Number(stored);
    if (Number.isInteger(v) && v >= 0 && v < VARIANT_COUNT) return v;
  } catch {
    /* ignore */
  }
  const v = Math.floor(Math.random() * VARIANT_COUNT);
  try {
    window.sessionStorage.setItem(COLOR_KEY, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

function omit(errors: FieldErrors, f: InputField): FieldErrors {
  if (!(f in errors)) return errors;
  const next = { ...errors };
  delete next[f];
  return next;
}

/**
 * Roving focus for a horizontal radio group in RTL (ArrowLeft = next).
 * Moves focus and returns the new index, or null when the key isn't ours.
 */
function roveRadio(e: KeyboardEvent<HTMLElement>): number | null {
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'),
  );
  if (radios.length === 0) return null;
  const current = radios.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (e.key) {
    case "ArrowLeft":
    case "ArrowDown":
      next = (current + 1) % radios.length;
      break;
    case "ArrowRight":
    case "ArrowUp":
      next = (Math.max(current, 0) - 1 + radios.length) % radios.length;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = radios.length - 1;
      break;
    default:
      return null;
  }
  e.preventDefault();
  radios[next].focus();
  return next;
}

const subscribeNothing = () => () => {};

/**
 * The server (and hydration) render an empty form; right after hydration the
 * client instance remounts with the saved draft + the session's random colour,
 * which only exist in browser storage.
 */
export function MessageForm() {
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return <LetterForm key={hydrated ? "client" : "server"} hydrated={hydrated} />;
}

function LetterForm({ hydrated }: { hydrated: boolean }) {
  const { addMessage, prefill } = useLetters();
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [draft] = useState(() => (hydrated ? readDraft() : null));
  const [title, setTitle] = useState<TeacherTitle | null>(draft?.title ?? null);
  const [toName, setToName] = useState(draft?.toName ?? "");
  const [school, setSchool] = useState(draft?.school ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [fromName, setFromName] = useState(draft?.fromName ?? "");
  /** null only in the server render (the random default colour is picked client-side). */
  const [variant, setVariant] = useState<number | null>(() =>
    !hydrated ? null : draft && draft.variant >= 0 ? draft.variant : sessionColor(),
  );
  const [inMemory, setInMemory] = useState(draft?.inMemory ?? false);
  const [surpriseOptIn, setSurpriseOptIn] = useState(draft?.surpriseOptIn ?? false);
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [flagged, setFlagged] = useState<Field[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [motion, setMotion] = useState<"fold" | "fade">("fold");
  const [sent, setSent] = useState<Sent | null>(null);
  const [resetTick, setResetTick] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);
  const toNameRef = useRef<HTMLInputElement>(null);
  const schoolRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fromNameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);

  const fieldRef = (f: InputField) =>
    ({ toName: toNameRef, school: schoolRef, body: bodyRef, fromName: fromNameRef, contact: contactRef })[f];

  // Debounced draft save. Never includes the private contact.
  useEffect(() => {
    if (!hydrated || phase !== "idle" || variant === null) return;
    saveTimer.current = window.setTimeout(
      () =>
        saveDraft({ title, toName, school, body, fromName, variant, inMemory, surpriseOptIn }),
      DRAFT_SAVE_MS,
    );
    return () => window.clearTimeout(saveTimer.current);
  }, [hydrated, title, toName, school, body, fromName, variant, inMemory, surpriseOptIn, phase]);

  // "اكتب له رسالة" from the search empty state: adjust state while rendering…
  const [prefillSeen, setPrefillSeen] = useState<number | null>(null);
  if (prefill && prefill.nonce !== prefillSeen) {
    setPrefillSeen(prefill.nonce);
    setToName(clampChars(prefill.toName.trim(), LIMITS.toName.max));
    setTitle(null);
    setErrors((e) => omit(e, "toName"));
    if (phase === "done") {
      setPhase("idle");
      setSent(null);
    }
  }
  // …then focus the next thing to fill once the provider's smooth scroll is under way.
  useEffect(() => {
    if (!prefill) return;
    const target = prefill.toName.trim() ? bodyRef : toNameRef;
    const t = window.setTimeout(() => target.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(t);
  }, [prefill]);

  useEffect(() => {
    if (resetTick === 0) return;
    formRef.current?.scrollIntoView({ block: "start" });
    toNameRef.current?.focus({ preventScroll: true });
  }, [resetTick]);

  /** Empties the letter (the chosen colour stays for the next one). */
  const clearFields = useCallback(() => {
    setTitle(null);
    setToName("");
    setSchool("");
    setBody("");
    setFromName("");
    setInMemory(false);
    setSurpriseOptIn(false);
    setContact("");
    setWebsite("");
  }, []);

  // The sent letter now lives in `sent`; the form underneath starts blank again
  // (so a later "write to «name»" prefill doesn't show the old text).
  const finishSending = useCallback(() => {
    setPhase((p) => (p === "sending" ? "done" : p));
    clearFields();
  }, [clearFields]);

  // Safety net in case `animationend` never fires (e.g. the tab was hidden).
  useEffect(() => {
    if (phase !== "sending") return;
    const t = window.setTimeout(finishSending, 1600);
    return () => window.clearTimeout(t);
  }, [phase, finishSending]);

  const dropError = (f: InputField) => {
    setErrors((e) => omit(e, f));
    setFlagged((list) => (list.includes(f as Field) ? list.filter((x) => x !== f) : list));
  };

  const focusField = (f: InputField | null) => {
    const el = f ? fieldRef(f).current : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
  };

  const reset = useCallback(() => {
    clearFields();
    setErrors({});
    setFlagged([]);
    setBanner(null);
    setSent(null);
    setPhase("idle");
    setResetTick((n) => n + 1);
  }, [clearFields]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The ref also stops a double tap that lands before React re-renders.
    if (phase !== "idle" || inFlight.current) return;

    const fields: FormFields = {
      title,
      toName,
      school,
      body,
      fromName,
      variant: variant ?? 0,
      inMemory,
      surpriseOptIn,
      contact,
    };

    setBanner(null);
    setFlagged([]);
    const clientErrors = validateForm(fields);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusField(firstInvalid(Object.keys(clientErrors)));
      return;
    }
    setErrors({});
    setPhase("submitting");

    inFlight.current = true;
    const res = await createMessage(buildRequestBody(fields, website)).finally(() => {
      inFlight.current = false;
    });

    if (res.ok) {
      window.clearTimeout(saveTimer.current);
      clearDraft();
      if (res.status === "published") addMessage(res.message);
      track("letter_submit", {
        status: res.status,
        variant: fields.variant,
        inMemory,
        surprise: wantsSurprise(fields),
      });
      setSent({ message: res.message, status: res.status });
      setMotion(reducedMotion() ? "fade" : "fold");
      setPhase("sending");
      return;
    }

    setPhase("idle");
    const err = res.error;
    if (err.error === "validation" && err.fields && Object.keys(err.fields).length > 0) {
      setErrors(err.fields);
      focusField(firstInvalid(Object.keys(err.fields)));
      track("letter_submit_blocked", { reason: "validation" });
    } else if (err.error === "moderation") {
      const fields = Array.isArray(err.fields) ? err.fields : [];
      setFlagged(fields);
      setBanner({ tone: "warn", message: err.message || COPY.moderationError });
      focusField(firstInvalid(fields));
      track("letter_submit_blocked", { reason: "moderation" });
    } else if (err.error === "rate_limited" || res.status === 429) {
      const message = "message" in err && err.message ? err.message : COPY.rateLimited;
      setBanner({ tone: "info", message });
      track("letter_submit_blocked", { reason: "rate_limited" });
    } else {
      setBanner({ tone: "warn", message: COPY.genericError });
    }
  }

  if (phase === "done" && sent) {
    return <SuccessPanel message={sent.message} status={sent.status} onReset={reset} />;
  }

  const look = variant === null && !inMemory ? null : cardStyle({ variant: variant ?? 0, inMemory });
  const busy = phase !== "idle";
  const errorText = (f: InputField) =>
    errors[f] ?? (flagged.includes(f as Field) ? MODERATION_FIELD_NOTE : undefined);
  const isInvalid = (f: InputField) => Boolean(errorText(f));
  const describedBy = (f: InputField, ...extra: (string | false | undefined)[]) =>
    [isInvalid(f) && id(`${f}-error`), flagged.includes(f as Field) && banner && id("banner"), ...extra]
      .filter(Boolean)
      .join(" ") || undefined;
  const showSurprise = !inMemory;
  const giftLabel =
    title === "ustadha" || title === "dr_f" ? COPY.giftLink.replace("له ", "لها ") : COPY.giftLink;

  return (
    <form
      ref={formRef}
      noValidate
      aria-label="رسالتك لمعلمك"
      onSubmit={handleSubmit}
      inert={phase === "sending"}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) finishSending();
      }}
      className={`paper ${styles.sheet} relative mt-6 scroll-mt-24 ps-[2.3rem] pe-4 pt-10 pb-6 sm:ps-[3.35rem] sm:pe-8 sm:pt-12 sm:pb-8 lg:mt-0 ${
        phase === "sending" ? (motion === "fold" ? styles.fold : styles.fade) : ""
      }`}
      style={{ backgroundColor: look?.bg ?? "var(--color-paper)" }}
    >
      {/* Wax seal in the chosen accent (a dove for «في ذكرى»). */}
      <span
        aria-hidden
        className={`${styles.seal} absolute -top-6 end-5 grid size-14 place-items-center rounded-full border-2 border-white/35 text-white shadow-[0_10px_20px_-8px_rgb(42_20_34/0.45)] sm:end-8`}
        style={{
          backgroundColor: look?.accent ?? "var(--color-orange)",
          transform: `rotate(${inMemory ? 0 : -12}deg)`,
        }}
      >
        {inMemory ? <span className="text-2xl leading-none">🕊️</span> : <HeartIcon className="size-6" />}
      </span>

      <div className="space-y-7">
        {/* To: title chips + name */}
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
            <label
              htmlFor={id("toName")}
              className="font-hand text-[2rem] leading-none font-bold text-plum"
            >
              {COPY.labelTo}
              <span className="visually-hidden"> {COPY.placeholderTo}</span>
            </label>
            <div
              role="radiogroup"
              aria-label={`${COPY.labelTitle} (${COPY.optional})`}
              onKeyDown={(e) => {
                const i = roveRadio(e);
                if (i !== null) setTitle(TEACHER_TITLE_KEYS[i]);
              }}
              className="flex flex-wrap gap-1.5"
            >
              {TEACHER_TITLE_KEYS.map((key, i) => {
                const checked = title === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked || (title === null && i === 0) ? 0 : -1}
                    onClick={() => setTitle(checked ? null : key)}
                    className="chip min-h-11 px-3.5"
                  >
                    {TEACHER_TITLES[key]}
                  </button>
                );
              })}
            </div>
          </div>
          <input
            ref={toNameRef}
            id={id("toName")}
            name="toName"
            type="text"
            required
            aria-required
            aria-invalid={isInvalid("toName")}
            aria-describedby={describedBy("toName")}
            maxLength={LIMITS.toName.max}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={COPY.placeholderTo}
            value={toName}
            onChange={(e) => {
              setToName(e.target.value);
              dropError("toName");
            }}
            className="field mt-3 text-[1.05rem] font-semibold"
          />
          <FieldError id={id("toName-error")} message={errorText("toName")} />
        </div>

        {/* School / university */}
        <div>
          <label htmlFor={id("school")} className="field-label">
            {COPY.labelSchool} <span className="field-optional">{COPY.optional}</span>
          </label>
          <input
            ref={schoolRef}
            id={id("school")}
            name="school"
            type="text"
            aria-invalid={isInvalid("school")}
            aria-describedby={describedBy("school")}
            maxLength={LIMITS.school.max}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={COPY.placeholderSchool}
            value={school}
            onChange={(e) => {
              setSchool(e.target.value);
              dropError("school");
            }}
            className="field"
          />
          <FieldError id={id("school-error")} message={errorText("school")} />
        </div>

        <BodyField
          id={id("body")}
          textareaRef={bodyRef}
          value={body}
          invalid={isInvalid("body")}
          error={<FieldError id={id("body-error")} message={errorText("body")} />}
          describedBy={describedBy("body", id("body-hint"))}
          hintId={id("body-hint")}
          onChange={(v) => {
            setBody(v);
            dropError("body");
          }}
        />

        {/* Sender */}
        <div>
          <label htmlFor={id("fromName")} className="field-label">
            {COPY.labelFrom} <span className="field-optional">{COPY.optional}</span>
          </label>
          <input
            ref={fromNameRef}
            id={id("fromName")}
            name="fromName"
            type="text"
            aria-invalid={isInvalid("fromName")}
            aria-describedby={describedBy("fromName")}
            maxLength={LIMITS.fromName.max}
            autoComplete="name"
            enterKeyHint="done"
            placeholder={COPY.placeholderFrom}
            value={fromName}
            onChange={(e) => {
              setFromName(e.target.value);
              dropError("fromName");
            }}
            className="field"
          />
          <FieldError id={id("fromName-error")} message={errorText("fromName")} />
        </div>

        {/* Card colour */}
        <div>
          <p id={id("color-label")} className="field-label">
            {COPY.labelColor}
            {look && !inMemory && <span className="field-optional">· {look.name}</span>}
          </p>
          <div
            role="radiogroup"
            aria-labelledby={id("color-label")}
            aria-describedby={inMemory ? id("color-note") : undefined}
            aria-disabled={inMemory || undefined}
            onKeyDown={(e) => {
              const i = roveRadio(e);
              if (i !== null) setVariant(i);
            }}
            className={`-ms-1.5 flex flex-wrap gap-[3px] transition-[opacity,filter] duration-300 ${
              inMemory ? "opacity-45 grayscale" : ""
            }`}
          >
            {CARD_COLORS.map((c, i) => {
              const checked = !inMemory && variant === i;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={c.name}
                  title={c.name}
                  disabled={inMemory}
                  tabIndex={checked || (variant === null && i === 0) ? 0 : -1}
                  onClick={() => setVariant(i)}
                  className="group grid size-11 place-items-center rounded-full disabled:cursor-not-allowed"
                >
                  <span
                    aria-hidden
                    className="grid size-8 place-items-center rounded-full transition-[box-shadow,transform] duration-200 group-hover:scale-110 group-active:scale-95 group-disabled:scale-100"
                    style={{
                      background: `linear-gradient(140deg, ${c.gradient[0]}, ${c.gradient[1]})`,
                      boxShadow: checked
                        ? "0 0 0 3px var(--color-paper), 0 0 0 5.5px var(--color-plum)"
                        : "inset 0 0 0 1px rgb(42 20 34 / 0.14)",
                    }}
                  >
                    {checked && <CheckIcon className="size-4 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.4)]" />}
                  </span>
                </button>
              );
            })}
          </div>
          {inMemory && (
            <p id={id("color-note")} className="mt-1 text-sm text-ink-soft">
              {MEMORY_COLOR_NOTE}
            </p>
          )}
        </div>

        {/* «في ذكرى» switch */}
        <label className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-line bg-white/65 p-4 transition-colors hover:border-plum-200">
          <input
            type="checkbox"
            role="switch"
            checked={inMemory}
            onChange={(e) => setInMemory(e.target.checked)}
            aria-describedby={id("memory-hint")}
            className="peer sr-only"
          />
          {/* Track colour = MEMORY_STYLE.accent */}
          <span
            aria-hidden
            className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors duration-300 peer-checked:bg-[#6f6275] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-orange after:absolute after:start-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-300 peer-checked:after:-translate-x-5"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-bold text-plum">
              {COPY.labelMemory}
              {inMemory && (
                <span aria-hidden className="animate-fade-up text-lg leading-none">
                  🕊️
                </span>
              )}
            </span>
            <span id={id("memory-hint")} className="mt-0.5 block text-sm leading-6 text-ink-soft">
              {COPY.memoryHint}
            </span>
          </span>
        </label>

        {/* Surprise opt-in (not offered for «في ذكرى» letters) */}
        {showSurprise && (
          <div className="rounded-[1.25rem] border border-orange-100 bg-orange-50/85 p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <Icon3D name="gift" size={64} className="-mt-1 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-plum">{COPY.surpriseTitle}</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{COPY.surpriseLead}</p>
              </div>
            </div>
            <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-plum">
              <input
                type="checkbox"
                checked={surpriseOptIn}
                onChange={(e) => {
                  setSurpriseOptIn(e.target.checked);
                  if (!e.target.checked) dropError("contact");
                }}
                aria-controls={id("contact-wrap")}
                className="size-5 shrink-0 accent-orange"
              />
              {COPY.surpriseOptIn}
            </label>
            <div
              id={id("contact-wrap")}
              inert={!surpriseOptIn}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out-soft ${
                surpriseOptIn ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="-mx-1.5 overflow-hidden px-1.5">
                <div className="pt-2 pb-1.5">
                  <label htmlFor={id("contact")} className="field-label">
                    {COPY.labelContact}
                  </label>
                  <input
                    ref={contactRef}
                    id={id("contact")}
                    name="contact"
                    type="text"
                    inputMode="text"
                    autoComplete="on"
                    dir="ltr"
                    required={surpriseOptIn}
                    aria-required={surpriseOptIn}
                    aria-invalid={isInvalid("contact")}
                    aria-describedby={describedBy("contact", id("contact-privacy"))}
                    maxLength={LIMITS.contact.max}
                    placeholder={COPY.placeholderContact}
                    value={contact}
                    onChange={(e) => {
                      setContact(e.target.value);
                      dropError("contact");
                    }}
                    className="field text-start"
                  />
                  <FieldError id={id("contact-error")} message={errorText("contact")} />
                  <p
                    id={id("contact-privacy")}
                    className="mt-2 flex items-start gap-1.5 text-[0.8rem] leading-5 text-ink-soft"
                  >
                    <LockIcon className="mt-0.5 size-3.5 shrink-0 text-plum" />
                    {COPY.contactPrivacy}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Honeypot: real visitors never see or fill it. */}
        <div aria-hidden="true" className="visually-hidden">
          <label>
            Website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        {banner && (
          <div
            role="alert"
            id={id("banner")}
            className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[0.95rem] leading-7 font-semibold ${
              banner.tone === "warn"
                ? "border-orange-100 bg-orange-50 text-orange-700"
                : "border-plum-100 bg-plum-50 text-plum"
            }`}
          >
            <span aria-hidden className="text-lg">
              {banner.tone === "warn" ? "✋" : "💜"}
            </span>
            <span>{banner.message}</span>
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          {!inMemory ? (
            <GiftLink
              from="form"
              className="inline-flex min-h-11 items-center justify-center gap-1.5 self-center rounded-full px-3 font-bold text-orange-700 underline-offset-4 transition-colors hover:text-orange-600 hover:underline sm:-ms-3 sm:self-auto"
            >
              {giftLabel}
            </GiftLink>
          ) : (
            <span className="hidden sm:block" />
          )}
          <button
            type="submit"
            aria-disabled={busy || undefined}
            className={`btn btn-primary w-full text-[1.05rem] sm:w-auto sm:min-w-[11rem] ${
              busy ? "cursor-progress opacity-85" : ""
            }`}
          >
            {phase === "submitting" ? (
              <>
                <Spinner className="size-5" />
                {COPY.submitting}
              </>
            ) : (
              <>
                {COPY.submit}
                <SendIcon className="size-[1.1rem]" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}

/** Auto-growing message box with a live counter and rotating writing prompts. */
function BodyField({
  id,
  textareaRef,
  value,
  invalid,
  error,
  describedBy,
  hintId,
  onChange,
}: {
  id: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  invalid: boolean;
  error: ReactNode;
  describedBy?: string;
  hintId: string;
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [prompt, setPrompt] = useState(0);
  const empty = value.length === 0;
  const count = charCount(value);

  useEffect(() => {
    if (!empty || focused || reducedMotion()) return;
    const t = window.setInterval(
      () => setPrompt((i) => (i + 1) % COPY.bodyPlaceholders.length),
      PLACEHOLDER_MS,
    );
    return () => window.clearInterval(t);
  }, [empty, focused]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value, textareaRef]);

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {COPY.labelBody}
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        name="body"
        rows={6}
        required
        aria-required
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder={COPY.bodyPlaceholders[prompt]}
        value={value}
        onChange={(e) => onChange(clampChars(e.target.value, BODY_MAX))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="field block resize-none overflow-hidden text-[1.05rem] leading-8"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{error}</div>
        <span
          aria-hidden
          dir="ltr"
          className={`mt-1.5 shrink-0 text-xs font-semibold tabular-nums transition-colors ${
            count > BODY_WARN_AT ? "text-orange-700" : "text-ink-mute"
          }`}
        >
          {count} / {BODY_MAX}
        </span>
      </div>
      <span id={hintId} className="visually-hidden">
        بحد أقصى {BODY_MAX} حرف
      </span>
    </div>
  );
}

type IconProps = { className?: string };

function HeartIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 20.7l-1.4-1.3C5.4 14.7 2 11.6 2 7.8 2 4.7 4.4 2.3 7.5 2.3c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6L12 20.7z" />
    </svg>
  );
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function LockIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

/** Paper plane, mirrored to point along the RTL reading direction. */
function SendIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`-scale-x-100 ${className ?? ""}`}
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function Spinner({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ""}`}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
