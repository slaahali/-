import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/ids";
import { rateLimit } from "@/lib/ratelimit";
import {
  attachDeviceCookie,
  badRequest,
  bodyError,
  clampChars,
  deviceHash,
  hashIp,
  jsonNoStore,
  logError,
  notFound,
  rateLimited,
  readDeviceId,
  readJsonBody,
  serverError,
} from "@/lib/request";
import { getStore } from "@/lib/store";
import { cleanInput } from "@/lib/text/normalize";
import type { ReportReason } from "@/lib/types";

export const runtime = "nodejs";

const REASONS: readonly ReportReason[] = ["inappropriate", "removal_request", "other"];
const MAX_NOTE_CHARS = 200;
const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 10 * 60_000;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/messages/[id]/report">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();

  const body = await readJsonBody(req, 2048);
  if (!body.ok) return bodyError(body.reason);
  const b = (body.value ?? {}) as { reason?: unknown; note?: unknown };
  if (!REASONS.includes(b.reason as ReportReason)) return badRequest("invalid reason");
  const reason = b.reason as ReportReason;
  if (b.note != null && typeof b.note !== "string") return badRequest("invalid note");
  const note = typeof b.note === "string" ? clampChars(cleanInput(b.note), MAX_NOTE_CHARS) || null : null;

  const limited = rateLimit(`report:${hashIp(req) ?? "unknown"}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  try {
    const device = readDeviceId(req);
    const result = await getStore().report(id, deviceHash(device), reason, note);
    if (!result) return notFound();
    return attachDeviceCookie(jsonNoStore({ ok: true, hidden: result.hidden }), device);
  } catch (e) {
    logError("[api] report failed", e);
    return serverError();
  }
}
