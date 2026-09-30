// Request helpers for route handlers: client IP, salted hashing, the anonymous
// device cookie, bounded JSON body reading, no-store JSON responses and
// privacy-safe error logging.

import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { COPY } from "./config";
import { getIpHashSalt, isProduction } from "./server-config";

const MAX_IP_LENGTH = 64;

function firstHeader(req: Request, name: string): string | null {
  const v = req.headers.get(name);
  if (!v) return null;
  const first = v.split(",")[0]?.trim();
  return first && first.length <= MAX_IP_LENGTH ? first : null;
}

/** Best-effort client IP from proxy headers (first hop of x-forwarded-for wins). */
export function getClientIp(req: Request): string | null {
  return (
    firstHeader(req, "x-forwarded-for") ??
    firstHeader(req, "x-real-ip") ??
    firstHeader(req, "cf-connecting-ip")
  );
}

/** Salted SHA-256, hex, truncated to 32 chars. Used for IPs and device ids. */
export function hashValue(value: string): string {
  return createHash("sha256").update(`${getIpHashSalt()}:${value}`).digest("hex").slice(0, 32);
}

export function hashIp(req: Request): string | null {
  const ip = getClientIp(req);
  return ip ? hashValue(`ip:${ip}`) : null;
}

// ---------------------------------------------------------------------------
// Anonymous device id: one like / report per device, per-device submit limit
// ---------------------------------------------------------------------------

export const DEVICE_COOKIE = "tcz_vid";
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
const ONE_YEAR_S = 60 * 60 * 24 * 365;

export interface DeviceId {
  id: string;
  /** True when the request had no (valid) cookie and one must be set on the response. */
  isNew: boolean;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/** The device cookie, or a freshly minted id (16 random bytes, base64url) to set. */
export function readDeviceId(req: Request): DeviceId {
  const existing = readCookie(req, DEVICE_COOKIE);
  if (existing && DEVICE_ID_RE.test(existing)) return { id: existing, isNew: false };
  return { id: randomBytes(16).toString("base64url"), isNew: true };
}

/** Hash of the device id, as stored with likes, reports and letters. */
export function deviceHash(device: DeviceId): string {
  return hashValue(`device:${device.id}`);
}

/** Sets the device cookie on the response when it was freshly minted. */
export function attachDeviceCookie<T extends NextResponse>(res: T, device: DeviceId): T {
  if (device.isNew) {
    res.cookies.set(DEVICE_COOKIE, device.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: "/",
      maxAge: ONE_YEAR_S,
    });
  }
  return res;
}

// ---------------------------------------------------------------------------
// Bodies + responses
// ---------------------------------------------------------------------------

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "not_json" | "too_large" | "invalid" };

/**
 * Reads a JSON body without buffering more than `maxBytes` (Content-Length can be
 * absent or lie, so the stream itself is capped).
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<JsonBodyResult> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type.trim())) {
    return { ok: false, reason: "not_json" };
  }
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: false, reason: "invalid" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

/** JSON response that is never cached by browsers or CDNs. */
export function jsonNoStore(
  body: unknown,
  status: number = 200,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function badRequest(message?: string): NextResponse {
  return jsonNoStore(message ? { error: "bad_request", message } : { error: "bad_request" }, 400);
}

export function bodyError(reason: "not_json" | "too_large" | "invalid"): NextResponse {
  return badRequest(reason === "too_large" ? "payload_too_large" : "invalid_json");
}

export function notFound(): NextResponse {
  return jsonNoStore({ error: "not_found" }, 404);
}

export function serverError(): NextResponse {
  return jsonNoStore({ error: "server" }, 500);
}

export function rateLimited(retryAfter: number): NextResponse {
  return jsonNoStore(
    { error: "rate_limited", retryAfter, message: COPY.rateLimited },
    429,
    { "Retry-After": String(retryAfter) },
  );
}

/** Truncates by code points (so emoji aren't split). */
export function clampChars(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

/**
 * Logs an error without its attached data: driver errors carry the query
 * parameters, which may include a writer's private contact.
 */
export function logError(context: string, e: unknown): void {
  if (e && typeof e === "object") {
    const err = e as { name?: unknown; message?: unknown; code?: unknown };
    const code = typeof err.code === "string" ? ` [${err.code}]` : "";
    console.error(`${context}: ${String(err.name ?? "Error")}${code}: ${String(err.message ?? "")}`);
  } else {
    console.error(`${context}: ${String(e)}`);
  }
}
