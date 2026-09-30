// Small browser-side helpers + the admin's denser button styles (built on the
// site's .btn classes from globals.css).

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const base =
  "btn min-h-11 gap-1.5 rounded-xl px-3.5 py-2 text-sm shadow-none disabled:opacity-50 lg:min-h-9 lg:px-3 lg:text-[13px]";

export const BTN = {
  primary: cx(base, "btn-primary shadow-none"),
  plum: cx(base, "btn-plum shadow-none"),
  quiet: cx(base, "border-[1.5px] border-line bg-white text-ink-soft hover:border-plum-200 hover:text-plum"),
  danger: cx(
    base,
    "border-[1.5px] border-danger/25 bg-white text-danger hover:border-danger hover:bg-danger hover:text-white",
  ),
  dangerSolid: cx(base, "bg-danger text-white hover:bg-[#a52c18]"),
} as const;

/** Page width for the dashboard: the site container, a bit wider for dense rows. */
export const WRAP = "container-page max-w-[90rem]";

/** True when a key press belongs to a text field (so shortcuts must not fire). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(target.type);
  }
  return false;
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
