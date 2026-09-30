// Bearer-token guard for /api/admin/*. With ADMIN_TOKEN unset every request is refused.

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { rateLimit } from "./ratelimit";
import { getClientIp, jsonNoStore, rateLimited } from "./request";
import { getAdminToken } from "./server-config";

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

export function isAdminRequest(req: Request): boolean {
  const token = getAdminToken();
  if (!token) return false;
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;
  // Comparing fixed-length digests keeps the check constant-time regardless of input length.
  return timingSafeEqual(digest(match[1].trim()), digest(token));
}

/** Returns an error response when the request isn't an authorised admin call, else null. */
export function requireAdmin(req: Request): NextResponse | null {
  if (isAdminRequest(req)) return null;
  const unauthorized = jsonNoStore({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  if (!getAdminToken()) return unauthorized;
  // Slow down token guessing.
  const limited = rateLimit(`admin-fail:${getClientIp(req) ?? "unknown"}`, 30, 10 * 60_000);
  return limited.ok ? unauthorized : rateLimited(limited.retryAfter);
}
