import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/ids";
import { rateLimit } from "@/lib/ratelimit";
import {
  attachDeviceCookie,
  badRequest,
  bodyError,
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

export const runtime = "nodejs";

const LIKE_LIMIT = 60;
const LIKE_WINDOW_MS = 60_000;
// A client without the device cookie gets a fresh voter id on every call, so
// cap how often one IP can like the same letter that way (CGNAT-friendly).
const NEW_DEVICE_LIKES_PER_LETTER = 10;
const NEW_DEVICE_WINDOW_MS = 60 * 60_000;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/messages/[id]/like">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();

  const body = await readJsonBody(req, 1024);
  if (!body.ok) return bodyError(body.reason);
  const like = (body.value as { like?: unknown } | null)?.like;
  if (typeof like !== "boolean") return badRequest("like must be a boolean");

  const ipKey = hashIp(req) ?? "unknown";
  const limited = rateLimit(`like:${ipKey}`, LIKE_LIMIT, LIKE_WINDOW_MS);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  const device = readDeviceId(req);
  if (like && device.isNew) {
    const fresh = rateLimit(`like-new:${ipKey}:${id}`, NEW_DEVICE_LIKES_PER_LETTER, NEW_DEVICE_WINDOW_MS);
    if (!fresh.ok) return rateLimited(fresh.retryAfter);
  }

  try {
    const result = await getStore().toggleLike(id, deviceHash(device), like);
    if (!result) return notFound();
    return attachDeviceCookie(jsonNoStore({ likes: result.likes, liked: result.liked }), device);
  } catch (e) {
    logError("[api] like failed", e);
    return serverError();
  }
}
