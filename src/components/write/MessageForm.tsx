"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useLetters } from "@/components/LettersProvider";
import { GiftLink } from "@/components/layout/GiftLink";
import { Icon3D } from "@/components/ui/Icon3D";
import { createMessage } from "@/lib/api-client";
import { CARD_COLORS, cardStyle, type CardStyle } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { play, preloadSounds } from "@/lib/sound";
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
import {
  buildRequestBody,
  charCount,
  clampChars,
  DRAFT_KEY,
  firstInvalid,
  parseDraft,
  prefillAction,
  serializeDraft,
  validateForm,
  wantsSurprise,
  type Draft,
  type FieldErrors,
  type FormFields,
} from "./form-logic";
import styles from "./sheet.module.css";
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
const MEMORY_COLOR_NOTE = "رسائل «في ذكرى» توصل بظرف هادئ موحّد";
const MODERATION_FIELD_NOTE = "عدّل هذا الجزء شوي 🙏";
/** Envelope before the random colour is picked (server render). */
const NEUTRAL_ENVELOPE: Pick<CardStyle, "gradient"> = { gradient: ["#f4ece0", "#d9bfa3"] };

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

/** A random card colour, kept for the whole visit so the envelope doesn't change on reload. */
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
  /** A search CTA asked for a letter to someone else while an unfinished one is on the paper. */
  const [readdress, setReaddress] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const toNameRef = useRef<HTMLInputElement>(null);
  const schoolRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fromNameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const readdressRef = useRef<HTMLButtonElement>(null);
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

  // Search CTAs ("اكتب رسالة لـ «…»"): adjust state while rendering…
  const [prefillSeen, setPrefillSeen] = useState<number | null>(null);
  if (prefill && prefill.nonce !== prefillSeen) {
    setPrefillSeen(prefill.nonce);
    // After a send the fields are already blank underneath the success panel.
    if (phase === "done") {
      setPhase("idle");
      setSent(null);
    }
    const blank = phase === "done";
    const action = prefillAction(
      prefill.toName,
      { toName: blank ? "" : toName, body: blank ? "" : body },
      LIMITS.toName.max,
    );
    if (action.kind === "set") {
      setToName(action.toName);
      if (action.clearTitle) setTitle(null);
      setErrors((e) => omit(e, "toName"));
      setReaddress(null);
    } else if (action.kind === "ask") {
      setReaddress(action.toName);
    }
  }
  // …then focus the next thing to fill once the provider's smooth scroll is under way.
  useEffect(() => {
    if (!prefill) return;
    const t = window.setTimeout(() => {
      const target =
        readdressRef.current ?? (toNameRef.current?.value.trim() ? bodyRef.current : toNameRef.current);
      target?.focus({ preventScroll: true });
    }, 80);
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
    setReaddress(null);
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

  const startReaddressed = () => {
    if (!readdress) return;
    const name = readdress;
    clearFields();
    setErrors({});
    setFlagged([]);
    setToName(name);
    window.setTimeout(() => bodyRef.current?.focus(), 0);
  };

  const keepDraft = () => {
    setReaddress(null);
    window.setTimeout(() => bodyRef.current?.focus(), 0);
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The ref also stops a double tap that lands before React re-renders.
    if (phase !== "idle" || inFlight.current) return;
    // Wakes the audio context inside the tap (iOS), so the whoosh can play after the request.
    preloadSounds();

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
      void play("send");
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
  const envelope = look ?? NEUTRAL_ENVELOPE;
  const busy = phase !== "idle";
  const sending = phase === "sending";
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
      inert={sending}
      className="relative sm:scroll-mt-24"
    >
      <div
        className={styles.stage}
        style={{ "--env": envelope.gradient[0], "--env-in": envelope.gradient[1] } as CSSProperties}
      >
        <div
          className={`${styles.sheet} ${sending ? (motion === "fold" ? styles.fold : styles.fade) : ""}`}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) finishSending();
          }}
        >
          <p aria-hidden className="text-end text-[0.85rem] font-bold text-ink-mute">
            {COPY.badge}
          </p>

          {readdress && (
            <div
              role="status"
              className="mt-3 rounded-lg border border-dashed border-orange-300 bg-orange-50/70 px-3.5 py-3 text-[0.95rem] leading-7 text-plum"
            >
              <p>عندك رسالة ما كملتها لـ «{toName.trim()}».</p>
              <div className="mt-1 flex flex-wrap gap-x-4">
                <button
                  ref={readdressRef}
                  type="button"
                  onClick={startReaddressed}
                  className="inline-flex min-h-11 items-center font-bold text-orange-700 underline decoration-orange-300 decoration-2 underline-offset-[6px]"
                >
                  ابدأ رسالة جديدة لـ «{readdress}»
                </button>
                <button
                  type="button"
                  onClick={keepDraft}
                  className="inline-flex min-h-11 items-center font-bold text-plum"
                >
                  أكمّل رسالتي
                </button>
              </div>
            </div>
          )}

          {/* «إلى [اللقب ▾] [الاسم]» */}
          <div className="mt-2 flex flex-wrap items-end gap-x-2.5">
            <label htmlFor={id("toName")} className={styles.word}>
              {COPY.letterTo}
              <span className="visually-hidden"> {COPY.labelToName}</span>
            </label>
            <select
              aria-label={`${COPY.labelTitle} (${COPY.optional})`}
              value={title ?? ""}
              data-empty={title === null}
              onChange={(e) => setTitle((e.target.value || null) as TeacherTitle | null)}
              className={`${styles.blank} ${styles.select} shrink-0`}
            >
              <option value="">{COPY.labelTitle}</option>
              {TEACHER_TITLE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {TEACHER_TITLES[key]}
                </option>
              ))}
            </select>
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
              className={`${styles.blank} ${styles.name} min-w-[8.5rem] flex-1`}
            />
          </div>
          <FieldError id={id("toName-error")} message={errorText("toName")} />

          {/* «في [المدرسة / الجامعة]» */}
          <div className="mt-1 flex items-end gap-x-2.5">
            <label htmlFor={id("school")} className={styles.word}>
              {COPY.letterIn}
              <span className="visually-hidden">
                {" "}
                {COPY.labelSchool} ({COPY.optional})
              </span>
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
              className={`${styles.blank} flex-1`}
            />
          </div>
          <FieldError id={id("school-error")} message={errorText("school")} />

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

          {/* «من: [اسمك]» — the signature, at the end of the letter. */}
          <div className="mt-4 sm:ms-auto sm:max-w-[21rem]">
            <div className="flex items-end gap-x-2.5">
              <label htmlFor={id("fromName")} className={styles.word}>
                {COPY.letterFrom}
                <span className="visually-hidden">
                  {" "}
                  {COPY.labelFrom} ({COPY.optional})
                </span>
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
                className={`${styles.blank} ${styles.signature} flex-1`}
              />
            </div>
            <FieldError id={id("fromName-error")} message={errorText("fromName")} />
          </div>
        </div>

        {/* The envelope's pocket in the writer's colour: the sheet stands in it. */}
        <div aria-hidden className={`${styles.pocket} ${sending ? styles.awayLate : ""}`}>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <path d="M0 0 L35.6 19.9 M100 0 L64.4 19.9" fill="none" stroke="rgb(42 20 34 / 0.16)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <path d="M0 40 L47 13.5 Q50 11.8 53 13.5 L100 40 Z" fill="currentColor" opacity="0.55" />
            <path d="M0 40 L47 13.5 Q50 11.8 53 13.5 L100 40" fill="none" stroke="rgb(255 255 255 / 0.4)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      </div>

      <div className={`mt-8 space-y-7 ${sending ? styles.away : ""}`}>
        <EnvelopePicker
          labelId={id("color-label")}
          noteId={id("color-note")}
          variant={variant}
          inMemory={inMemory}
          look={look}
          onPick={setVariant}
        />

        {/* خيارات: «في ذكرى» + the surprise opt-in */}
        <div role="group" aria-labelledby={id("options")}>
          <p id={id("options")} className="eyebrow text-plum">
            {COPY.labelOptions}
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-3.5 py-1">
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
              <span className="block font-bold text-plum">{COPY.labelMemory}</span>
              <span id={id("memory-hint")} className="block text-[0.95rem] leading-7 text-ink-soft max-sm:text-balance">
                {COPY.memoryHint}
              </span>
            </span>
          </label>

          {/* Surprise opt-in (not offered for «في ذكرى» letters) */}
          {showSurprise && (
            <div className="mt-4 flex items-start gap-3.5 border-t border-dashed border-line-strong pt-4">
              <Icon3D name="gift" size={48} className="-mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-plum">{COPY.surpriseTitle}</p>
                <p id={id("surprise-lead")} className="text-[0.95rem] leading-7 text-ink-soft">
                  {COPY.surpriseLead}
                </p>
                <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 font-bold text-plum">
                  <input
                    type="checkbox"
                    checked={surpriseOptIn}
                    onChange={(e) => {
                      setSurpriseOptIn(e.target.checked);
                      if (!e.target.checked) dropError("contact");
                    }}
                    aria-controls={id("contact-wrap")}
                    aria-describedby={id("surprise-lead")}
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
                    <div className="pt-1 pb-1.5">
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
                        className="field font-latin text-start"
                      />
                      <FieldError id={id("contact-error")} message={errorText("contact")} />
                      <p
                        id={id("contact-privacy")}
                        className="mt-2 flex items-start gap-1.5 text-[0.85rem] leading-6 text-ink-soft"
                      >
                        <LockIcon className="mt-1 size-3.5 shrink-0 text-plum" />
                        {COPY.contactPrivacy}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

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
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[0.95rem] leading-7 font-bold ${
              banner.tone === "warn"
                ? "border-orange-100 bg-orange-50 text-orange-700"
                : "border-plum-100 bg-plum-50 text-plum"
            }`}
          >
            <NoteIcon className="mt-1.5 size-4 shrink-0" />
            <span>{banner.message}</span>
          </div>
        )}

        {/* Submit first in the DOM so keyboard order matches what's seen on every size. */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-5">
          <button
            type="submit"
            aria-disabled={busy || undefined}
            className={`btn btn-primary w-full text-[1.05rem] sm:w-auto sm:min-w-[12rem] ${
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
          {!inMemory && (
            <GiftLink
              from="form"
              className="inline-flex min-h-11 items-center justify-center self-center rounded-xl px-3 font-bold text-orange-700 underline decoration-orange-300 decoration-2 underline-offset-[6px] transition-colors hover:decoration-orange-700 sm:self-auto"
            >
              {giftLabel}
            </GiftLink>
          )}
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

/** «لون الظرف»: six small envelopes instead of colour dots. */
function EnvelopePicker({
  labelId,
  noteId,
  variant,
  inMemory,
  look,
  onPick,
}: {
  labelId: string;
  noteId: string;
  variant: number | null;
  inMemory: boolean;
  look: CardStyle | null;
  onPick: (v: number) => void;
}) {
  return (
    <div>
      <p id={labelId} className="eyebrow text-plum">
        {COPY.labelColor}
        {look && !inMemory && <span className="font-medium text-ink-soft">· {look.name}</span>}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={inMemory ? noteId : undefined}
        aria-disabled={inMemory || undefined}
        onKeyDown={(e) => {
          const i = roveRadio(e);
          if (i !== null) onPick(i);
        }}
        // Phones: the six envelopes span the row, edge to edge, instead of bunching at the start.
        className={`mt-2 flex max-w-[26rem] justify-between gap-1 transition-[opacity,filter] duration-300 sm:max-w-none sm:flex-wrap sm:justify-start sm:gap-1.5 ${
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
              onClick={() => onPick(i)}
              className={styles.swatch}
            >
              <EnvelopeGlyph colors={c.gradient} checked={checked} />
            </button>
          );
        })}
      </div>
      {inMemory && (
        <p id={noteId} className="mt-1 text-[0.95rem] text-ink-soft">
          {MEMORY_COLOR_NOTE}
        </p>
      )}
    </div>
  );
}

function EnvelopeGlyph({ colors: [light, deep], checked }: { colors: [string, string]; checked: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 44 32" className="h-[1.9rem] w-[2.6rem]">
      <rect x="1" y="1" width="42" height="30" rx="3" fill={light} stroke="rgb(42 20 34 / 0.16)" />
      <path d="M1.6 30.4 17 16.5M42.4 30.4 27 16.5" stroke="rgb(42 20 34 / 0.14)" strokeWidth="1.2" />
      <path d="M1.8 1.8 20.3 17.2a2.6 2.6 0 0 0 3.4 0L42.2 1.8Z" fill={deep} />
      {checked && (
        <>
          <circle cx="22" cy="17.3" r="6.2" fill="#fffdf8" />
          <path
            d="M19 17.4l2.1 2.1 4-4.2"
            fill="none"
            stroke="#691d4e"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

/** Auto-growing ruled message area with a live counter and rotating writing prompts. */
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
    <div className="mt-5">
      <label htmlFor={id} className="mb-1 block text-[0.95rem] font-bold text-ink-soft">
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
        className={styles.ruled}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{error}</div>
        <span
          aria-hidden
          dir="ltr"
          className={`mt-1.5 shrink-0 text-caption font-bold tabular-nums transition-colors ${
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

function NoteIcon({ className }: IconProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <circle cx="8" cy="8" r="6.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r="1" fill="currentColor" />
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
