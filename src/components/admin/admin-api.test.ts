import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  buildListQuery,
  deleteMessage,
  describeError,
  fetchExport,
  filenameFromDisposition,
  listMessages,
  normalizeItem,
  normalizeListResponse,
  patchMessage,
} from "./admin-api";

const TOKEN = "s3cret-token";

type Call = { url: string; init: RequestInit };

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url: String(url), init };
      calls.push(call);
      return respond(call);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const authOf = (c: Call) => new Headers(c.init.headers).get("authorization");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("sends the token only in the Authorization header", async () => {
    const calls = mockFetch(() => json({ items: [], total: 0, counts: {} }));
    await listMessages(TOKEN, { filter: "pending", q: " نورة ", limit: 25, offset: 50 });
    await patchMessage(TOKEN, "abc/1", { status: "published" });
    await deleteMessage(TOKEN, "abc");
    for (const c of calls) {
      expect(authOf(c)).toBe(`Bearer ${TOKEN}`);
      expect(c.url).not.toContain(TOKEN);
      expect(c.init.cache).toBe("no-store");
    }
    expect(calls[0].url).toBe(`/api/admin/messages?${buildListQuery({ filter: "pending", q: "نورة", limit: 25, offset: 50 })}`);
    expect(calls[1].url).toBe("/api/admin/messages/abc%2F1");
    expect(calls[1].init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ status: "published" });
    expect(calls[2].init.method).toBe("DELETE");
  });

  it("builds list queries without empty search", () => {
    const sp = new URLSearchParams(buildListQuery({ filter: "starred", q: "  ", limit: 25, offset: -3 }));
    expect(Object.fromEntries(sp)).toEqual({ filter: "starred", limit: "25", offset: "0" });
    expect(new URLSearchParams(buildListQuery({ filter: "all", q: "مدرسة", limit: 1, offset: 0 })).get("q")).toBe("مدرسة");
  });

  it("maps HTTP failures to typed errors", async () => {
    mockFetch(() => json({ error: "unauthorized" }, 401));
    await expect(listMessages(TOKEN, { filter: "all", limit: 25, offset: 0 })).rejects.toMatchObject({
      kind: "unauthorized",
    });

    mockFetch(() => json({ error: "rate_limited", retryAfter: 120 }, 429));
    const limited = await patchMessage(TOKEN, "x", { starred: true }).catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(AdminApiError);
    expect(limited).toMatchObject({ kind: "rate_limited", retryAfter: 120 });
    expect(describeError(limited)).toBe("محاولات كثيرة، جرّب بعد 2 دقيقة");

    mockFetch(() => new Response("", { status: 429, headers: { "retry-after": "30" } }));
    await expect(deleteMessage(TOKEN, "x")).rejects.toMatchObject({ retryAfter: 30 });

    mockFetch(() => json({ error: "not_found" }, 404));
    await expect(deleteMessage(TOKEN, "x")).rejects.toMatchObject({ kind: "not_found" });

    mockFetch(() => json({ error: "server" }, 500));
    await expect(deleteMessage(TOKEN, "x")).rejects.toMatchObject({ kind: "server", status: 500 });

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(deleteMessage(TOKEN, "x")).rejects.toMatchObject({ kind: "network" });
    expect(describeError(new AdminApiError("unauthorized", 401))).toBe("الرمز غير صحيح");
  });

  it("lets aborts through untouched", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(abort)));
    await expect(listMessages(TOKEN, { filter: "all", limit: 25, offset: 0 })).rejects.toBe(abort);
  });
});

describe("export", () => {
  it("downloads with the Bearer header and reads the filename", async () => {
    const calls = mockFetch(
      () =>
        new Response("﻿id,contact\n1,0500000000\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": "attachment; filename=\"letters-starred.csv\"",
          },
        }),
    );
    const { blob, filename } = await fetchExport(TOKEN, "starred");
    expect(calls[0].url).toBe("/api/admin/export?filter=starred");
    expect(authOf(calls[0])).toBe(`Bearer ${TOKEN}`);
    expect(filename).toBe("letters-starred.csv");
    expect(await blob.text()).toContain("0500000000");
  });

  it("parses Content-Disposition variants safely", () => {
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition("attachment; filename=plain.csv")).toBe("plain.csv");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%D8%B1%D8%B3%D8%A7%D8%A6%D9%84.csv")).toBe("رسائل.csv");
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"')).toBe(".._.._etc_passwd");
  });
});

describe("normalisation", () => {
  it("drops ipHash / searchText and fills defaults", () => {
    const m = normalizeItem({
      id: "x1",
      title: "dr_f",
      toName: "سارة",
      body: "شكراً",
      createdAt: "2026-09-30T10:00:00Z",
      status: "hidden",
      ipHash: "deadbeef",
      searchText: "ساره",
      contact: "0500000000",
      surpriseOptIn: true,
    });
    expect(m).not.toBeNull();
    expect(m).not.toHaveProperty("ipHash");
    expect(m).not.toHaveProperty("searchText");
    expect(m).toMatchObject({
      id: "x1",
      title: "dr_f",
      school: null,
      fromName: null,
      status: "hidden",
      reports: 0,
      starred: false,
      removalRequested: false,
      surpriseOptIn: true,
      contact: "0500000000",
      moderation: null,
    });
  });

  it("rejects junk and unknown enums", () => {
    expect(normalizeItem(null)).toBeNull();
    expect(normalizeItem({ toName: "x" })).toBeNull();
    expect(normalizeItem({ id: "y", title: "king", status: "weird" })).toMatchObject({ title: null, status: "pending" });
    const res = normalizeListResponse({ items: [{ id: "a" }, 5, null], total: "9", counts: { pending: 2 } });
    expect(res.items.map((m) => m.id)).toEqual(["a"]);
    expect(res.total).toBe(1);
    expect(res.counts.pending).toBe(2);
    expect(res.counts.all).toBe(0);
  });
});
