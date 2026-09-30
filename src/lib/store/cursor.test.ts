import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor";

describe("pagination cursors", () => {
  it("round-trips a 'new' keyset cursor", () => {
    const t = "2026-10-05T08:30:00.123Z";
    const raw = encodeCursor({ k: "n", t, i: "abc123XYZ0" });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(raw, "new")).toEqual({ k: "n", t, i: "abc123XYZ0" });
  });

  it("round-trips a 'top' offset cursor", () => {
    expect(decodeCursor(encodeCursor({ k: "t", o: 24 }), "top")).toEqual({ k: "t", o: 24 });
  });

  it("rejects a cursor from the other sort", () => {
    expect(decodeCursor(encodeCursor({ k: "t", o: 12 }), "new")).toBeNull();
    expect(decodeCursor(encodeCursor({ k: "n", t: new Date().toISOString(), i: "x" }), "top")).toBeNull();
  });

  it("treats anything malformed as the first page", () => {
    const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    for (const raw of [
      null,
      undefined,
      "",
      "not base64!",
      "%%%",
      Buffer.from("{not json").toString("base64url"),
      b64(null),
      b64([1, 2]),
      b64({ k: "n", t: "yesterday", i: "abc" }),
      b64({ k: "n", t: new Date().toISOString(), i: 5 }),
      b64({ k: "n", t: new Date().toISOString(), i: "x".repeat(65) }),
      "A".repeat(500),
    ]) {
      expect(decodeCursor(raw, "new")).toBeNull();
    }
    for (const o of [-1, 1.5, "3", 1e9, Number.NaN]) {
      expect(decodeCursor(b64({ k: "t", o }), "top")).toBeNull();
    }
  });

  it("normalises the timestamp", () => {
    const raw = Buffer.from(JSON.stringify({ k: "n", t: "2026-10-05T11:30:00+03:00", i: "a" })).toString(
      "base64url",
    );
    expect(decodeCursor(raw, "new")).toEqual({ k: "n", t: "2026-10-05T08:30:00.000Z", i: "a" });
  });
});
