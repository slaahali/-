// End-to-end tests of the route handlers against the file store (moderation mocked).

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/config";
import { resetRateLimits } from "@/lib/ratelimit";
import { makeTestDir } from "@/lib/store/test-dirs";
import { GET as adminExport } from "../admin/export/route";
import { DELETE as adminDelete, PATCH as adminPatch } from "../admin/messages/[id]/route";
import { GET as adminList } from "../admin/messages/route";
import { GET as getOne } from "./[id]/route";
import { POST as like } from "./[id]/like/route";
import { POST as report } from "./[id]/report/route";
import { GET as list, POST as create } from "./route";

const mod = vi.hoisted(() => ({
  verdict: {} as Record<string, unknown>,
  seen: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/moderation", () => ({
  moderateSubmission: async (input: Record<string, unknown>) => {
    mod.seen.push(input);
    return {
      ok: true,
      fields: [],
      reason: null,
      layer: "wordlist",
      message: "",
      suspicious: false,
      ...mod.verdict,
    };
  },
}));

const root = makeTestDir("api-");
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

const TOKEN = "test-admin-token-123";
const CONTACT = "+966500000077";
const g = globalThis as { __letters_store?: unknown };
let ipCounter = 0;
let ip = "";

beforeEach(() => {
  delete g.__letters_store;
  resetRateLimits();
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("DATA_DIR", mkdtempSync(path.join(root, "data-")));
  vi.stubEnv("SEED_DEMO", "false");
  vi.stubEnv("ADMIN_TOKEN", TOKEN);
  vi.stubEnv("IP_HASH_SALT", "test-salt");
  vi.stubEnv("MODERATION_MODE", "");
  vi.stubEnv("SUBMIT_LIMIT_PER_DAY", "");
  mod.verdict = {};
  mod.seen = [];
  ip = `10.0.0.${++ipCounter}`;
});

const letter = {
  title: "ustadha",
  toName: "نورة القحطاني",
  school: "ثانوية الملك فهد",
  body: "شكراً على كل شي يا أستاذة، ما أنسى فضلك 💜",
  fromName: "سارة",
  variant: 3,
};

function request(
  url: string,
  init: { method?: string; body?: unknown; raw?: string; headers?: Record<string, string>; cookie?: string } = {},
) {
  const headers: Record<string, string> = { "x-forwarded-for": ip, ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  let body: string | undefined = init.raw;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["content-type"] ??= "application/json";
  }
  return new NextRequest(`http://localhost${url}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const admin = { authorization: `Bearer ${TOKEN}` };

function cookieOf(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  return set.split(";")[0];
}

async function post(body: unknown, cookie?: string) {
  const res = await create(request("/api/messages", { body, cookie }));
  return { res, json: await res.json() };
}

describe("public API", () => {
  it("creates a letter, sets the device cookie and never echoes the contact", async () => {
    const { res, json } = await post({ ...letter, surpriseOptIn: true, contact: "0500000077" });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toMatch(/tcz_vid=[\w-]{22}; .*HttpOnly/i);
    expect(json.status).toBe("published");
    expect(json.message).toMatchObject({ toName: "نورة القحطاني", variant: 3, likes: 0, inMemory: false });
    expect(Object.keys(json.message).sort()).toEqual(
      ["body", "createdAt", "fromName", "id", "inMemory", "likes", "school", "title", "toName", "variant"],
    );
    expect(JSON.stringify(json)).not.toContain("500000077");
    // Moderation never sees the contact.
    expect(mod.seen[0].contact).toBeNull();

    const one = await getOne(request(`/api/messages/${json.message.id}`), ctx({ id: json.message.id }));
    expect(one.status).toBe(200);
    expect((await one.json()).message).toEqual(json.message);

    const wall = await list(request("/api/messages?sort=new&limit=5&q=%D9%86%D9%88%D8%B1%D8%A9"));
    const page = await wall.json();
    expect(page.items.map((m: { id: string }) => m.id)).toEqual([json.message.id]);
    expect(page.total).toBe(1);
    expect(JSON.stringify(page)).not.toContain("500000077");

    // …but the admin sees it.
    const adm = await (await adminList(request("/api/admin/messages?filter=surprise", { headers: admin }))).json();
    expect(adm.items[0].contact).toBe(CONTACT);
    expect(adm.items[0]).not.toHaveProperty("ipHash");
    expect(adm.items[0]).not.toHaveProperty("deviceHash");
  });

  it("rejects bad bodies", async () => {
    const notJson = await create(request("/api/messages", { raw: "hi", headers: { "content-type": "text/plain" } }));
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error).toBe("bad_request");

    const huge = await post({ ...letter, body: "ش".repeat(5000) });
    expect(huge.res.status).toBe(400);
    expect(huge.json.error).toBe("bad_request");

    const invalid = await post({ ...letter, toName: "", surpriseOptIn: true, contact: "nope" });
    expect(invalid.res.status).toBe(400);
    expect(invalid.json.error).toBe("validation");
    expect(Object.keys(invalid.json.fields).sort()).toEqual(["contact", "toName"]);
  });

  it("answers the honeypot with a fake letter that is never stored", async () => {
    const { res, json } = await post({ ...letter, website: "http://spam.example", surpriseOptIn: true, contact: CONTACT });
    expect(res.status).toBe(201);
    expect(json.status).toBe("published");
    expect(JSON.stringify(json)).not.toContain(CONTACT);
    const one = await getOne(request(`/api/messages/${json.message.id}`), ctx({ id: json.message.id }));
    expect(one.status).toBe(404);
    expect((await (await list(request("/api/messages"))).json()).total).toBe(0);
    expect(mod.seen).toHaveLength(0);
  });

  it("returns 422 when moderation rejects", async () => {
    mod.verdict = { ok: false, fields: ["body"], reason: "profanity", message: "عدّلها شوي" };
    const { res, json } = await post(letter);
    expect(res.status).toBe(422);
    expect(json).toEqual({ error: "moderation", fields: ["body"], message: "عدّلها شوي" });
  });

  it("sends suspicious letters to review (default mode) and hides them publicly", async () => {
    mod.verdict = { suspicious: true, suspicionReason: "soft_word", layer: "wordlist" };
    const { res, json } = await post(letter);
    expect(res.status).toBe(201);
    expect(json.status).toBe("pending");
    expect((await getOne(request(`/api/messages/${json.message.id}`), ctx({ id: json.message.id }))).status).toBe(404);
    expect((await (await list(request("/api/messages"))).json()).total).toBe(0);

    const queue = await (await adminList(request("/api/admin/messages?filter=pending", { headers: admin }))).json();
    expect(queue.items[0]).toMatchObject({ id: json.message.id, reviewReason: "suspicious: soft_word", status: "pending" });
    expect(queue.counts.pending).toBe(1);
  });

  it("honours MODERATION_MODE", async () => {
    vi.stubEnv("MODERATION_MODE", "review_all");
    expect((await post(letter)).json.status).toBe("pending");

    vi.stubEnv("MODERATION_MODE", "auto");
    mod.verdict = { suspicious: true, suspicionReason: "ai_unavailable" };
    expect((await post(letter)).json.status).toBe("published");

    const all = await (await adminList(request("/api/admin/messages?filter=all", { headers: admin }))).json();
    expect(all.items.map((m: { reviewReason: string | null }) => m.reviewReason).sort()).toEqual([null, "review_all"].sort());
  });

  it("limits submissions per device", async () => {
    vi.stubEnv("SUBMIT_LIMIT_PER_DAY", "1");
    const first = await post(letter);
    expect(first.res.status).toBe(201);
    const cookie = cookieOf(first.res);
    const second = await post(letter, cookie);
    expect(second.res.status).toBe(429);
    expect(second.json).toMatchObject({ error: "rate_limited", message: COPY.rateLimited });
    expect(second.json.retryAfter).toBeGreaterThan(0);
    expect(second.res.headers.get("retry-after")).toBeTruthy();
  });

  it("limits bursts per IP", async () => {
    for (let i = 0; i < 5; i++) expect((await post(letter)).res.status).toBe(201);
    const sixth = await post(letter);
    expect(sixth.res.status).toBe(429);
    expect(sixth.json.error).toBe("rate_limited");
  });

  it("likes once per device", async () => {
    const { json } = await post(letter);
    const id = json.message.id;
    const first = await like(request(`/api/messages/${id}/like`, { body: { like: true } }), ctx({ id }));
    expect(await first.json()).toEqual({ likes: 1, liked: true });
    const cookie = cookieOf(first);
    expect(cookie).toMatch(/^tcz_vid=/);
    const again = await like(request(`/api/messages/${id}/like`, { body: { like: true }, cookie }), ctx({ id }));
    expect(await again.json()).toEqual({ likes: 1, liked: true });
    expect(again.headers.get("set-cookie")).toBeNull();
    const undo = await like(request(`/api/messages/${id}/like`, { body: { like: false }, cookie }), ctx({ id }));
    expect(await undo.json()).toEqual({ likes: 0, liked: false });

    expect((await like(request(`/api/messages/${id}/like`, { body: { like: "yes" } }), ctx({ id }))).status).toBe(400);
    expect((await like(request(`/api/messages/nope0000/like`, { body: { like: true } }), ctx({ id: "nope0000" }))).status).toBe(404);
    expect((await like(request(`/api/messages/x/like`, { body: { like: true } }), ctx({ id: "../x" }))).status).toBe(404);
  });

  it("caps cookieless likes on one letter per IP", async () => {
    const { json } = await post(letter);
    const id = json.message.id;
    for (let i = 0; i < 10; i++) {
      expect((await like(request(`/api/messages/${id}/like`, { body: { like: true } }), ctx({ id }))).status).toBe(200);
    }
    const eleventh = await like(request(`/api/messages/${id}/like`, { body: { like: true } }), ctx({ id }));
    expect(eleventh.status).toBe(429);
  });

  it("a removal request hides the letter at once", async () => {
    const { json } = await post(letter);
    const id = json.message.id;
    const bad = await report(request(`/api/messages/${id}/report`, { body: { reason: "spam" } }), ctx({ id }));
    expect(bad.status).toBe(400);

    const res = await report(
      request(`/api/messages/${id}/report`, { body: { reason: "removal_request", note: "أنا نورة 🙏" } }),
      ctx({ id }),
    );
    expect(await res.json()).toEqual({ ok: true, hidden: true });
    expect((await getOne(request(`/api/messages/${id}`), ctx({ id }))).status).toBe(404);

    const removal = await (await adminList(request("/api/admin/messages?filter=removal", { headers: admin }))).json();
    expect(removal.items[0]).toMatchObject({ id, removalRequested: true, reviewReason: "removal_request" });
    expect((await report(request(`/api/messages/zzzz0000/report`, { body: { reason: "other" } }), ctx({ id: "zzzz0000" }))).status).toBe(404);
  });
});

describe("admin API", () => {
  it("requires the bearer token", async () => {
    expect((await adminList(request("/api/admin/messages"))).status).toBe(401);
    expect((await adminList(request("/api/admin/messages", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect((await adminExport(request("/api/admin/export?filter=starred"))).status).toBe(401);

    vi.stubEnv("ADMIN_TOKEN", "");
    expect((await adminList(request("/api/admin/messages", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    expect((await adminList(request("/api/admin/messages", { headers: admin }))).status).toBe(401);
  });

  it("moderates: publish, star, hide, delete, export CSV", async () => {
    vi.stubEnv("MODERATION_MODE", "review_all");
    const { json } = await post({ ...letter, surpriseOptIn: true, contact: "Lama@Example.com" });
    const id = json.message.id;

    const bad = await adminPatch(request(`/api/admin/messages/${id}`, { method: "PATCH", body: { status: "gone" }, headers: admin }), ctx({ id }));
    expect(bad.status).toBe(400);
    const empty = await adminPatch(request(`/api/admin/messages/${id}`, { method: "PATCH", body: {}, headers: admin }), ctx({ id }));
    expect(empty.status).toBe(400);

    const pub = await adminPatch(
      request(`/api/admin/messages/${id}`, { method: "PATCH", body: { status: "published", starred: true }, headers: admin }),
      ctx({ id }),
    );
    expect(await pub.json()).toEqual({ ok: true });
    expect((await getOne(request(`/api/messages/${id}`), ctx({ id }))).status).toBe(200);

    const listed = await (await adminList(request("/api/admin/messages?filter=starred&limit=500&offset=-4", { headers: admin }))).json();
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toMatchObject({ id, starred: true, status: "published", reviewReason: null });
    expect(listed.counts).toMatchObject({ all: 1, starred: 1, surprise: 1, published: 1, pending: 0 });

    const csv = await adminExport(request("/api/admin/export?filter=starred", { headers: admin }));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(csv.headers.get("content-disposition")).toMatch(/attachment; filename=".+\.csv"/);
    // Download it as bytes (res.text() would strip the BOM Excel needs).
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"lama@example.com"');
    expect(text).toContain(`/m/${id}`);
    expect((await adminExport(request("/api/admin/export?filter=all", { headers: admin }))).status).toBe(400);

    const hide = await adminPatch(request(`/api/admin/messages/${id}`, { method: "PATCH", body: { status: "hidden" }, headers: admin }), ctx({ id }));
    expect(hide.status).toBe(200);
    expect((await getOne(request(`/api/messages/${id}`), ctx({ id }))).status).toBe(404);

    const del = await adminDelete(request(`/api/admin/messages/${id}`, { method: "DELETE", headers: admin }), ctx({ id }));
    expect(await del.json()).toEqual({ ok: true });
    expect((await adminDelete(request(`/api/admin/messages/${id}`, { method: "DELETE", headers: admin }), ctx({ id }))).status).toBe(404);
  });
});
