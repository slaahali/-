import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "./ratelimit";
import {
  DEVICE_COOKIE,
  attachDeviceCookie,
  clampChars,
  deviceHash,
  getClientIp,
  hashValue,
  jsonNoStore,
  readDeviceId,
  readJsonBody,
} from "./request";

const req = (headers: Record<string, string> = {}, body?: string) =>
  new Request("http://localhost/api/x", { method: body === undefined ? "GET" : "POST", headers, body });

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "5.6.7.8" }))).toBe("1.2.3.4");
    expect(getClientIp(req({ "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9" }))).toBe("5.6.7.8");
    expect(getClientIp(req({ "cf-connecting-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(getClientIp(req())).toBeNull();
    expect(getClientIp(req({ "x-forwarded-for": "x".repeat(200) }))).toBeNull();
  });
});

describe("hashing", () => {
  it("is salted, stable, 32 hex chars", () => {
    const h = hashValue("ip:1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(hashValue("ip:1.2.3.4")).toBe(h);
    expect(hashValue("ip:1.2.3.5")).not.toBe(h);
  });
});

describe("device cookie", () => {
  it("reuses a valid cookie and mints a new one otherwise", () => {
    const fresh = readDeviceId(req());
    expect(fresh.isNew).toBe(true);
    expect(fresh.id).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const again = readDeviceId(req({ cookie: `a=1; ${DEVICE_COOKIE}=${fresh.id}; b=2` }));
    expect(again).toEqual({ id: fresh.id, isNew: false });
    expect(deviceHash(again)).toBe(deviceHash(fresh));

    expect(readDeviceId(req({ cookie: `${DEVICE_COOKIE}=short` })).isNew).toBe(true);
  });

  it("sets an HttpOnly, SameSite=Lax, year-long cookie only when new", () => {
    const fresh = readDeviceId(req());
    const set = attachDeviceCookie(jsonNoStore({ ok: true }), fresh).headers.get("set-cookie") ?? "";
    expect(set).toContain(`${DEVICE_COOKIE}=${fresh.id}`);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Path=\//);
    expect(set).toMatch(/Max-Age=31536000/);

    const known = attachDeviceCookie(jsonNoStore({ ok: true }), { id: fresh.id, isNew: false });
    expect(known.headers.get("set-cookie")).toBeNull();
  });

  it("marks the cookie Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = attachDeviceCookie(jsonNoStore({}), readDeviceId(req()));
      expect(res.headers.get("set-cookie")).toMatch(/Secure/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("readJsonBody", () => {
  const json = { "content-type": "application/json" };

  it("parses JSON bodies", async () => {
    expect(await readJsonBody(req(json, '{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects non-JSON, oversized and malformed bodies", async () => {
    expect(await readJsonBody(req({ "content-type": "text/plain" }, "{}"), 100)).toEqual({
      ok: false,
      reason: "not_json",
    });
    expect(await readJsonBody(req(json, JSON.stringify({ a: "x".repeat(200) })), 100)).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(await readJsonBody(req(json, "{nope"), 100)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("clampChars", () => {
  it("cuts by code points", () => {
    expect(clampChars("💜💜💜", 2)).toBe("💜💜");
    expect(clampChars("abc", 5)).toBe("abc");
  });
});

describe("rateLimit", () => {
  afterEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows `limit` hits per sliding window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(1);
    expect(rateLimit("other", 3, 1000).ok).toBe(true);
    vi.setSystemTime(1001);
    expect(rateLimit("k", 3, 1000).ok).toBe(true);
  });

  it("keeps memory bounded", () => {
    for (let i = 0; i < 12_000; i++) rateLimit(`key-${i}`, 1, 60_000);
    // The newest keys are still tracked…
    expect(rateLimit("key-11999", 1, 60_000).ok).toBe(false);
    // …the oldest were evicted.
    expect(rateLimit("key-0", 1, 60_000).ok).toBe(true);
  });
});
