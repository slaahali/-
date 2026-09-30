import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ fail: false }));

// Outside a Next request there is no scope for connection().
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

vi.mock("./store", () => {
  const boom = async () => {
    if (state.fail) throw Object.assign(new Error("too many clients"), { code: "53300" });
    return null;
  };
  return {
    getStore: () => ({
      get: boom,
      count: async () => (state.fail ? boom() : 7),
      list: async () => {
        await boom();
        return { items: [], nextCursor: null, total: 3 };
      },
    }),
  };
});

import { DataUnavailableError, getInitialWall, getPublicMessage, getSearchSummary, getTotal } from "./data";

beforeEach(() => {
  state.fail = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("data access", () => {
  it("tells 'not found' apart from 'database down'", async () => {
    expect(await getPublicMessage("abcd123456")).toBeNull();
    expect(await getPublicMessage("../etc")).toBeNull();
    state.fail = true;
    await expect(getPublicMessage("abcd123456")).rejects.toBeInstanceOf(DataUnavailableError);
    // Invalid ids never reach the store.
    expect(await getPublicMessage("../etc")).toBeNull();
  });

  it("never turns a failed count into a cacheable '0 letters' search image", async () => {
    expect(await getSearchSummary("نورة")).toEqual({ q: "نورة", total: 3 });
    expect(await getSearchSummary("")).toEqual({ q: "", total: 7 });
    state.fail = true;
    await expect(getSearchSummary("نورة")).rejects.toBeInstanceOf(DataUnavailableError);
  });

  it("the wall and counter degrade to empty so the page still renders", async () => {
    state.fail = true;
    expect(await getInitialWall()).toEqual({ items: [], nextCursor: null, total: 0 });
    expect(await getTotal()).toBe(0);
  });
});
