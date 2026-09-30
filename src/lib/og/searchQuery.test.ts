import { describe, expect, it } from "vitest";
import { isDrawableQuery } from "./searchQuery";

describe("isDrawableQuery", () => {
  it("accepts ordinary name / school searches (titles included)", () => {
    expect(isDrawableQuery("نورة")).toBe(true);
    expect(isDrawableQuery("أستاذة نورة العتيبي")).toBe(true);
    expect(isDrawableQuery("ثانوية الملك فهد")).toBe(true);
  });

  it("rejects queries whose tail was never matched", () => {
    expect(isDrawableQuery("نورة سارة هند ريم لمى منى كلام مو مناسب")).toBe(false);
  });

  it("rejects single-letter words and title-only queries", () => {
    expect(isDrawableQuery("ك ل ب")).toBe(false);
    expect(isDrawableQuery("أستاذ")).toBe(false);
    expect(isDrawableQuery("   ")).toBe(false);
  });
});
