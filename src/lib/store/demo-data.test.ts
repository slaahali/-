import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VARIANT_COUNT } from "../types";
import { normalizeContact, parseCreateBody } from "../validation";
import { DEMO_LETTERS, DEMO_PENDING_REASON, buildDemoMessages } from "./demo-data";

const published = DEMO_LETTERS.filter((d) => (d.status ?? "published") === "published");
const pending = DEMO_LETTERS.filter((d) => d.status === "pending");

describe("demo letters", () => {
  it("has 24 published letters and a small review queue", () => {
    expect(published).toHaveLength(24);
    expect(pending).toHaveLength(2);
  });

  it("passes the same validation as real submissions", () => {
    for (const d of DEMO_LETTERS) {
      const r = parseCreateBody({ ...d });
      expect(r.ok, `${d.toName}: ${JSON.stringify(!r.ok && r.fields)}`).toBe(true);
      if (r.ok) {
        expect(r.input.toName).toBe(d.toName);
        expect(r.input.body).toBe(d.body);
        expect(r.input.contact).toBe(d.contact);
      }
      const len = [...d.body].length;
      expect(len).toBeGreaterThanOrEqual(20);
      expect(len).toBeLessThanOrEqual(550);
    }
  });

  it("is varied: every colour, titles, anonymous senders, schools, in-memory, surprise", () => {
    expect(new Set(published.map((d) => d.variant)).size).toBe(VARIANT_COUNT);
    expect(DEMO_LETTERS.every((d) => d.variant >= 0 && d.variant < VARIANT_COUNT)).toBe(true);
    expect(new Set(published.map((d) => d.title))).toEqual(new Set(["ustadh", "ustadha", "dr_m", "dr_f", null]));
    expect(published.filter((d) => d.fromName === null).length).toBeGreaterThanOrEqual(4);
    expect(published.some((d) => d.school === null)).toBe(true);
    expect(published.some((d) => d.school && /international school/i.test(d.school))).toBe(true);

    const memory = published.filter((d) => d.inMemory);
    expect(memory).toHaveLength(2);
    for (const d of memory) expect(d.body).toMatch(/رحم/);

    const surprise = DEMO_LETTERS.filter((d) => d.surpriseOptIn);
    expect(surprise).toHaveLength(3);
    for (const d of surprise) {
      expect(normalizeContact(d.contact ?? "")).toBe(d.contact);
      expect(d.contact).toMatch(/^\+9665000000\d\d$|@example\.com$/);
    }
    expect(DEMO_LETTERS.filter((d) => !d.surpriseOptIn).every((d) => d.contact === null)).toBe(true);
    for (const d of DEMO_LETTERS) {
      expect(d.likes).toBeGreaterThanOrEqual(0);
      expect(d.likes).toBeLessThanOrEqual(240);
    }
  });

  it("spreads createdAt over the last 6 days", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    const msgs = buildDemoMessages(now);
    for (const m of msgs) {
      const t = Date.parse(m.createdAt);
      expect(t).toBeLessThanOrEqual(now);
      expect(now - t).toBeLessThanOrEqual(6 * 24 * 3_600_000);
    }
    expect(msgs.filter((m) => m.status === "pending").every((m) => m.reviewReason === DEMO_PENDING_REASON)).toBe(true);
    expect(msgs.filter((m) => m.status === "published").every((m) => m.reviewReason === null)).toBe(true);
  });

  const moderationReady = existsSync(path.resolve(__dirname, "../moderation/index.ts"));
  it.skipIf(!moderationReady)("passes the moderation rules", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // word list only: deterministic, offline
    try {
      const { moderateSubmission } = await import("../moderation");
      for (const d of DEMO_LETTERS) {
        const verdict = await moderateSubmission({ ...d, contact: null });
        expect(verdict.ok, `${d.toName}: ${verdict.reason} ${verdict.message}`).toBe(true);
      }
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
