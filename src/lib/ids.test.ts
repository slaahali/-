import { describe, expect, it } from "vitest";
import { ID_LENGTH, isValidId, newId, variantFor } from "./ids";
import { VARIANT_COUNT } from "./types";

describe("newId", () => {
  it("makes 10-char base62 ids", () => {
    for (let i = 0; i < 500; i++) {
      const id = newId();
      expect(id).toHaveLength(ID_LENGTH);
      expect(id).toMatch(/^[0-9A-Za-z]{10}$/);
      expect(isValidId(id)).toBe(true);
    }
  });

  it("supports other lengths", () => {
    expect(newId(6)).toMatch(/^[0-9A-Za-z]{6}$/);
    expect(newId(32)).toHaveLength(32);
  });

  it("doesn't repeat and uses the whole alphabet", () => {
    const ids = new Set<string>();
    const chars = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const id = newId();
      ids.add(id);
      for (const c of id) chars.add(c);
    }
    expect(ids.size).toBe(20_000);
    expect(chars.size).toBe(62);
  });
});

describe("isValidId", () => {
  it("accepts url-safe ids of 4..32 chars only", () => {
    expect(isValidId("abcd")).toBe(true);
    expect(isValidId("a_b-C9")).toBe(true);
    expect(isValidId("abc")).toBe(false);
    expect(isValidId("a".repeat(33))).toBe(false);
    expect(isValidId("abc/def")).toBe(false);
    expect(isValidId("../etc")).toBe(false);
    expect(isValidId(42)).toBe(false);
  });
});

describe("variantFor", () => {
  it("is stable and in range", () => {
    expect(variantFor("abc123XYZ0")).toBe(variantFor("abc123XYZ0"));
    for (let i = 0; i < 300; i++) {
      const v = variantFor(newId());
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(VARIANT_COUNT);
    }
  });

  it("spreads ids over every colour", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(variantFor(newId()));
    expect(seen.size).toBe(VARIANT_COUNT);
  });
});
