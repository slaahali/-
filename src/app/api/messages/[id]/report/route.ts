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
  notFound,
  rateLimited,
  readDeviceId,
  readJsonBody,
  storeFailure,
} from "@/lib/request";
import { getStore } from "@/lib/store";
import { cleanInput } from "@/lib/text/normalize";
import type { ReportReason } from "@/lib/types";

export const runtime = "nodejs";

const REASONS: readonly ReportReason[] = ["inappropriate", "removal_request", "other"];
const MAX_NOTE_CHARS = 200;
// First line only (per instance). The store dedupes per letter by device AND
// IP and caps new removal requests per device / IP per day, durably.
const REPORT_LIMIT = 10;
const REPORT_WINDOW_MS = 10 * 60_000;
const REMOVAL_RETRY_S = 6 * 60 * 60;

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

  const ipHash = hashIp(req);
  const limited = rateLimit(`report:${ipHash ?? "unknown"}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  try {
    const device = readDeviceId(req);
    const result = await getStore().report(id, {
      voterHash: deviceHash(device),
      ipHash,
      newDevice: device.isNew,
      reason,
      note,
    });
    if (!result) return notFound();
    if (result.limited) return attachDeviceCookie(rateLimited(REMOVAL_RETRY_S), device);
    return attachDeviceCookie(jsonNoStore({ ok: true, hidden: result.hidden }), device);
  } catch (e) {
    return storeFailure("[api] report failed", e);
  }
}
