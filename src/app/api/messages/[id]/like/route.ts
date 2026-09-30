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

export async function POST(req: NextRequest, ctx: RouteContext<"/api/messages/[id]/like">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();

  const body = await readJsonBody(req, 1024);
  if (!body.ok) return bodyError(body.reason);
  const like = (body.value as { like?: unknown } | null)?.like;
  if (typeof like !== "boolean") return badRequest("like must be a boolean");

  const limited = rateLimit(`like:${hashIp(req) ?? "unknown"}`, LIKE_LIMIT, LIKE_WINDOW_MS);
  if (!limited.ok) return rateLimited(limited.retryAfter);

  try {
    const device = readDeviceId(req);
    const result = await getStore().toggleLike(id, deviceHash(device), like);
    if (!result) return notFound();
    return attachDeviceCookie(jsonNoStore({ likes: result.likes, liked: result.liked }), device);
  } catch (e) {
    logError("[api] like failed", e);
    return serverError();
  }
}
