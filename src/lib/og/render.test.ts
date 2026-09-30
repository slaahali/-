import { describe, expect, it } from "vitest";
import type { PublicMessage } from "@/lib/types";
import { renderOgPng, sceneFor } from "./render";
import { buildOgSvg } from "./svg";

const m: PublicMessage = {
  id: "abc123xyz",
  title: "ustadha",
  toName: "نورة 💜",
  school: "Riyadh School - مدرسة الرياض",
  body: "شكراً لأنك آمنت فيني يوم ما أحد آمن ✨ للحين أتذكر عبارتك.",
  fromName: null,
  likes: 3,
  createdAt: "2026-10-05T08:00:00.000Z",
  variant: 1,
  inMemory: false,
};

function pngSize(buf: Buffer) {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("sceneFor", () => {
  it("never carries private fields into the image", () => {
    const record = { ...m, contact: "0551234567", surpriseOptIn: true, ipHash: "deadbeef" } as PublicMessage;
    const scene = sceneFor({ kind: "letter", m: record });
    const svg = buildOgSvg(scene);
    for (const secret of ["0551234567", "deadbeef"]) {
      expect(JSON.stringify(scene)).not.toContain(secret);
      expect(svg).not.toContain(secret);
    }
  });
  it("is memory aware and signs anonymous letters", () => {
    const s = sceneFor({ kind: "letter", m: { ...m, inMemory: true } });
    expect(s.kind).toBe("letter");
    if (s.kind !== "letter") return;
    expect(s.to).toBe("إلى روح أستاذة نورة");
    expect(s.label).toBe("في ذكرى");
    expect(s.memory).toBe(true);
    expect(s.stamp).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(s.signature).toBe("— أحد طلابك");
  });
});

describe("renderOgPng", () => {
  it("renders 1200×630 PNGs for every kind", async () => {
    for (const input of [
      { kind: "default" as const },
      { kind: "letter" as const, m },
      { kind: "letter" as const, m: { ...m, id: "mem1", inMemory: true } },
      { kind: "search" as const, q: "نورة", total: 12 },
      { kind: "search" as const, q: "لا أحد", total: 0 },
    ]) {
      const png = await renderOgPng(input);
      expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    }
  });
  it("caches identical requests", async () => {
    const a = renderOgPng({ kind: "search", q: "كاش", total: 2 });
    const b = renderOgPng({ kind: "search", q: "كاش", total: 2 });
    expect(a).toBe(b);
    await a;
  });
});
