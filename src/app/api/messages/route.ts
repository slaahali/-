import type { NextRequest } from "next/server";
import { COPY } from "@/lib/config";
import { normalizeQuery } from "@/lib/data";
import { newId, variantFor } from "@/lib/ids";
import { moderateSubmission, type ModerationVerdict } from "@/lib/moderation";
import { rateLimit } from "@/lib/ratelimit";
import {
  attachDeviceCookie,
  bodyError,
  deviceHash,
  hashIp,
  jsonNoStore,
  logError,
  rateLimited,
  readDeviceId,
  readJsonBody,
  serverError,
} from "@/lib/request";
import { getModerationMode, getSubmitLimitPerDay, type ModerationMode } from "@/lib/server-config";
import { getStore } from "@/lib/store";
import { toPublic } from "@/lib/store/shared";
import type {
  CreateMessageResponse,
  ModerationRecord,
  PublicMessage,
  SortMode,
} from "@/lib/types";
import { parseCreateBody, type ParsedMessageInput } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const DEFAULT_PAGE = 12;
const MAX_PAGE = 30;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Per IP. Mobile carriers put many visitors behind one IP (CGNAT), hence the
// generous daily IP cap; the tighter limit is per device.
const BURST_LIMIT = 5;
const BURST_WINDOW_MS = 10 * MINUTE;
const IP_DAILY_LIMIT = 15;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = normalizeQuery(sp.get("q"));
  const sort: SortMode = sp.get("sort") === "top" ? "top" : "new";
  const cursor = sp.get("cursor");
  const rawLimit = Number.parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(MAX_PAGE, Math.max(1, rawLimit)) : DEFAULT_PAGE;

  try {
    const result = await getStore().list({ q: q || undefined, sort, cursor, limit });
    return jsonNoStore(result);
  } catch (e) {
    logError("[api] list messages failed", e);
    return serverError();
  }
}

/** What a honeypot-tripping bot gets back: looks real, is never stored. */
function fakeMessage(input: ParsedMessageInput): PublicMessage {
  const id = newId();
  return toPublic({
    ...input,
    id,
    likes: 0,
    createdAt: new Date().toISOString(),
    variant: input.variant ?? variantFor(id),
  });
}

function reviewDecision(
  mode: ModerationMode,
  verdict: ModerationVerdict,
): { status: "published" | "pending"; reviewReason: string | null } {
  if (mode === "review_all") return { status: "pending", reviewReason: "review_all" };
  if (verdict.suspicious && mode === "review_suspicious") {
    const why = verdict.suspicionReason || verdict.reason || verdict.layer;
    return { status: "pending", reviewReason: `suspicious: ${why}` };
  }
  return { status: "published", reviewReason: null };
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body.ok) return bodyError(body.reason);

    const parsed = parseCreateBody(body.value);
    if (!parsed.ok) return jsonNoStore({ error: "validation", fields: parsed.fields }, 400);
    const { input } = parsed;

    const device = readDeviceId(req);
    const respond = (payload: CreateMessageResponse) =>
      attachDeviceCookie(jsonNoStore(payload, 201), device);

    if (parsed.isBot) return respond({ message: fakeMessage(input), status: "published" });

    // Cheap in-memory check first (also shields the moderation layer from floods)…
    const ipHash = hashIp(req);
    const burst = rateLimit(`create:${ipHash ?? "unknown"}`, BURST_LIMIT, BURST_WINDOW_MS);
    if (!burst.ok) return rateLimited(burst.retryAfter);

    // …then the durable daily limits, which survive restarts and span instances.
    const store = getStore();
    const since = Date.now() - DAY;
    const devHash = deviceHash(device);
    const [byIp, byDevice] = await Promise.all([
      ipHash ? store.countRecent({ ipHash, sinceMs: since }) : 0,
      device.isNew ? 0 : store.countRecent({ deviceHash: devHash, sinceMs: since }),
    ]);
    if (byIp >= IP_DAILY_LIMIT || byDevice >= getSubmitLimitPerDay()) {
      return rateLimited(Math.ceil(DAY / 1000));
    }

    // Moderation (possibly a third-party AI) never gets the private contact.
    const verdict = await moderateSubmission({ ...input, variant: input.variant ?? 0, contact: null });
    if (!verdict.ok) {
      return jsonNoStore(
        { error: "moderation", fields: verdict.fields, message: verdict.message || COPY.moderationError },
        422,
      );
    }

    const { status, reviewReason } = reviewDecision(getModerationMode(), verdict);
    const moderation: ModerationRecord = { layer: verdict.layer, flagged: false };
    if (verdict.suspicious) {
      moderation.suspicious = true;
      const why = verdict.suspicionReason || verdict.reason;
      if (why) moderation.reason = why;
    }

    const message = await store.create({
      ...input,
      ipHash,
      deviceHash: devHash,
      status,
      reviewReason,
      moderation,
    });
    return respond({ message: toPublic(message), status });
  } catch (e) {
    logError("[api] create message failed", e);
    return serverError();
  }
}
