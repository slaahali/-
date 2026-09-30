// Moderation entry point for submissions: word lists first (fast, decisive),
// then the optional Claude layer. Only PUBLIC fields are ever checked or sent
// anywhere — `input.contact` never leaves the store.

import { COPY } from "../config";
import type { CreateMessageInput, Field } from "../types";
import { aiConfigured, aiMode, aiModerate } from "./ai";
import { arabicShare, checkText, type ModerationReason, type TextKind } from "./filter";

export { checkText };
export type { ModerationReason, CheckResult, TextKind } from "./filter";

export interface ModerationVerdict {
  ok: boolean;
  /** Which inputs triggered it (for highlighting). */
  fields: Field[];
  reason: ModerationReason | null;
  layer: "wordlist" | "ai" | "none";
  /** Arabic, user-facing. */
  message: string;
  /** ok=true but not sure (soft word hit, AI unsure/unavailable…) → pending under review_suspicious. */
  suspicious: boolean;
  suspicionReason?: string;
}

export const MODERATION_MESSAGES: Record<ModerationReason, string> = {
  profanity: COPY.moderationError,
  ai_flagged: COPY.moderationError,
  contact_info: "حفاظاً على الخصوصية ما ننشر أرقام جوالات أو إيميلات أو حسابات 🙏 احذفها وأرسل رسالتك",
  link: "ما ننشر روابط داخل الرسائل 🙏 احذف الرابط وأرسلها",
  spam: "رسالتك تبدو مكررة أو غير مفهومة، عدّلها شوي 🙏",
};

export const AI_UNAVAILABLE_MESSAGE = "الفلتر مو متاح الحين، جرّب بعد شوي 🙏";

/** Below this the AI's "allowed" still sends the letter to a human. */
const AI_CONFIDENCE_MIN = 0.75;
/** A body with less Arabic than this is probably spam or off-topic; a human glances at it. */
const ARABIC_SHARE_MIN = 0.5;
const REASON_ORDER: ModerationReason[] = ["profanity", "contact_info", "link", "spam"];

const PUBLIC_FIELDS: Array<[Field, TextKind]> = [
  ["toName", "name"],
  ["school", "school"],
  ["fromName", "name"],
  ["body", "body"],
];

export async function moderateSubmission(input: CreateMessageInput): Promise<ModerationVerdict> {
  const failures: Array<{ field: Field; reason: ModerationReason }> = [];
  const suspicion: string[] = [];

  for (const [field, kind] of PUBLIC_FIELDS) {
    const text = input[field];
    if (!text) continue;
    const r = checkText(text, { kind });
    if (!r.ok && r.reason) failures.push({ field, reason: r.reason });
    if (r.soft.length) suspicion.push(`soft words in ${field}: ${r.soft.join(", ")}`);
  }

  if (failures.length) {
    const reason = REASON_ORDER.find((r) => failures.some((f) => f.reason === r)) ?? failures[0].reason;
    return {
      ok: false,
      fields: [...new Set(failures.map((f) => f.field))],
      reason,
      layer: "wordlist",
      message: MODERATION_MESSAGES[reason],
      suspicious: false,
    };
  }

  const share = arabicShare(input.body);
  if (share !== null && share < ARABIC_SHARE_MIN) suspicion.push("mostly non-Arabic text");

  let layer: ModerationVerdict["layer"] = "wordlist";
  const mode = aiMode();
  const useAi = mode === "required" || (mode === "auto" && aiConfigured());

  if (useAi) {
    const ai = await aiModerate({
      title: input.title,
      toName: input.toName,
      school: input.school,
      body: input.body,
      fromName: input.fromName,
      inMemory: input.inMemory,
    });
    if (!ai) {
      if (mode === "required") {
        return {
          ok: false,
          fields: [],
          reason: "ai_flagged",
          layer: "ai",
          message: AI_UNAVAILABLE_MESSAGE,
          suspicious: false,
        };
      }
      suspicion.push("AI check unavailable, word list only");
    } else if (!ai.allowed) {
      return {
        ok: false,
        fields: ai.fields.length ? ai.fields : ["body"],
        reason: "ai_flagged",
        layer: "ai",
        message: MODERATION_MESSAGES.ai_flagged,
        suspicious: false,
      };
    } else {
      layer = "ai";
      if (ai.confidence < AI_CONFIDENCE_MIN) {
        suspicion.push(`AI unsure (${ai.confidence.toFixed(2)}${ai.reason ? `: ${ai.reason}` : ""})`);
      }
    }
  }

  return {
    ok: true,
    fields: [],
    reason: null,
    layer,
    message: "",
    suspicious: suspicion.length > 0,
    suspicionReason: suspicion.length ? suspicion.join("; ") : undefined,
  };
}
