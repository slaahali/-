import { describe, expect, it } from "vitest";
import { COPY, lettersCount } from "./config";

describe("lettersCount (Arabic number agreement)", () => {
  it.each([
    [0, "0 رسالة"],
    [1, "رسالة وحدة"],
    [2, "رسالتين"],
    [3, "3 رسائل"],
    [10, "10 رسائل"],
    [11, "11 رسالة"],
    [99, "99 رسالة"],
    [100, "100 رسالة"],
    [103, "103 رسائل"],
    [240, "240 رسالة"],
  ])("%i → %s", (n, expected) => {
    expect(lettersCount(n)).toBe(expected);
  });

  it("puts a qualifier right after the noun", () => {
    expect(lettersCount(1, "1", "شكر")).toBe("رسالة شكر وحدة");
    expect(lettersCount(2, "2", "شكر")).toBe("رسالتين شكر");
    expect(lettersCount(5, "5", "شكر")).toBe("5 رسائل شكر");
    expect(lettersCount(1200, "1,200", "شكر")).toBe("1,200 رسالة شكر");
  });

  it("reads formatted counts (as the wall passes them)", () => {
    expect(lettersCount("3")).toBe("3 رسائل");
    expect(lettersCount("1,003")).toBe("1,003 رسائل");
    expect(lettersCount("١٢")).toBe("١٢ رسالة");
  });
});

describe("COPY.searchResults", () => {
  it("agrees with the count", () => {
    expect(COPY.searchResults("3", "نورة")).toBe("3 رسائل لـ «نورة»");
    expect(COPY.searchResults(1, "نورة")).toBe("رسالة وحدة لـ «نورة»");
    expect(COPY.searchResults("2", "نورة")).toBe("رسالتين لـ «نورة»");
    expect(COPY.searchResults("25", "نورة")).toBe("25 رسالة لـ «نورة»");
  });
});

describe("COPY decoration", () => {
  // Emoji belong inside the campaign sentences, not on headings/badges/buttons.
  const EMOJI = /\p{Extended_Pictographic}/u;
  it.each([
    "badge",
    "heroCtaWrite",
    "heroCtaSearch",
    "heroCtaExplore",
    "writeTitle",
    "labelColor",
    "labelMemory",
    "surpriseTitle",
    "giftLink",
    "successTitle",
    "pendingTitle",
    "writeAnother",
    "emptySearchCta",
    "memoryTag",
  ] as const)("%s has no emoji", (key) => {
    expect(COPY[key]).not.toMatch(EMOJI);
  });
});
