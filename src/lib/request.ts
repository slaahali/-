// Request helpers for route handlers: client IP, salted hashing, the anonymous
// device cookie, bounded JSON body reading, no-store JSON responses and
// privacy-safe error logging.

import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { COPY } from "./config";
import {
  getClientIpHeader,
  getIpHashSalt,
  getTrustedProxyHops,
  isProduction,
} from "./server-config";
import { StoreUnavailableError } from "./store/errors";

// ---------------------------------------------------------------------------
// Client IP. Every proxy APPENDS to X-Forwarded-For, so only the entries added
// by proxies we trust are real; the leftmost ones are whatever the client sent.
// ---------------------------------------------------------------------------

const MAX_IP_LENGTH = 64;

/** "1.2.3.4:80" → "1.2.3.4", "[2001:db8::1]:443" → "2001:db8::1", "::ffff:1.2.3.4" → "1.2.3.4"; null if not an IP. */
export function normalizeIp(raw: string | null | undefined): string | null {
  let s = raw?.trim() ?? "";
  if (!s || s.length > MAX_IP_LENGTH) return null;
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(s);
  if (bracketed) s = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  s = s.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) s = mapped[1];
  return isIP(s) ? s : null;
}

/** The rightmost entry of a comma-separated header (the one the nearest hop set). */
function lastEntry(value: string | null): string | null {
  const parts = value?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
  return normalizeIp(parts.at(-1));
}

/** The entry `hops` from the right: the address the outermost trusted proxy saw. */
export function ipFromForwardedFor(value: string | null, hops: number): string | null {
  if (!value || hops <= 0) return null;
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return normalizeIp(parts[Math.max(0, parts.length - hops)]);
}

/**
 * Client IP, in order of trust:
 * 1. CLIENT_IP_HEADER when configured (cf-connecting-ip behind Cloudflare, x-real-ip from your nginx);
 * 2. on Vercel, the headers its edge sets and overwrites (x-vercel-forwarded-for, x-real-ip);
 * 3. X-Forwarded-For, TRUSTED_PROXY_HOPS entries from the right (never the client-controlled first hop).
 */
export function getClientIp(req: Request): string | null {
  const configured = getClientIpHeader();
  if (configured) return lastEntry(req.headers.get(configured));
  if (process.env.VERCEL) {
    const v = lastEntry(req.headers.get("x-vercel-forwarded-for")) ?? lastEntry(req.headers.get("x-real-ip"));
    if (v) return v;
  }
  return ipFromForwardedFor(req.headers.get("x-forwarded-for"), getTrustedProxyHops());
}

/**
 * What rate limits and dedupe key on: the IPv4 address, or the /64 prefix of an
 * IPv6 one (a single subscriber owns a whole /64, so per-address keys are free to rotate).
 */
export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail] = ip.split("%")[0].split("::");
  const groups = (s: string | undefined) => (s ? s.split(":") : []);
  const width = (g: string[]) => g.reduce((n, x) => n + (x.includes(".") ? 2 : 1), 0);
  const h = groups(head);
  const t = groups(tail);
  const full = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - width(h) - width(t))).fill("0"), ...t];
  return `${full
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** Salted SHA-256, hex, truncated to 32 chars. Used for IPs and device ids. */
export function hashValue(value: string): string {
  return createHash("sha256").update(`${getIpHashSalt()}:${value}`).digest("hex").slice(0, 32);
}

export function hashIp(req: Request): string | null {
  const ip = getClientIp(req);
  return ip ? hashValue(`ip:${ipKey(ip)}`) : null;
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

export const UNAVAILABLE_MESSAGE = "الموقع قيد التجهيز وما نقدر نستقبل هذا الطلب الحين، جرّب بعد شوي 🙏";

export function serviceUnavailable(): NextResponse {
  return jsonNoStore({ error: "server", message: UNAVAILABLE_MESSAGE }, 503, { "Retry-After": "120" });
}

/** A failed store call: 503 when no database is configured (logged by the store), else a logged 500. */
export function storeFailure(context: string, e: unknown): NextResponse {
  if (e instanceof StoreUnavailableError) return serviceUnavailable();
  logError(context, e);
  return serverError();
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
