import { describe, expect, it } from "vitest";
import { createLikeSync, letterHistory, type HistoryWindow } from "@/components/LettersProvider";
import type { LikeResult } from "@/lib/types";

/** A browser history stack: pushState truncates forward entries, back/forward fire popstate. */
function fakeBrowser(start: string, onPop: (w: FakeWindow) => void = () => {}) {
  const entries: { url: string; state: unknown }[] = [{ url: start, state: null }];
  let i = 0;
  const loc = () => new URL(entries[i].url, "https://site.test");
  const w = {
    scrollY: 0,
    get location() {
      const u = loc();
      return { pathname: u.pathname, search: u.search, hash: u.hash };
    },
    history: {
      get state() {
        return entries[i].state;
      },
      pushState(state: unknown, _t: string, url?: string | URL | null) {
        entries.splice(i + 1);
        entries.push({ url: String(url), state });
        i++;
      },
      replaceState(state: unknown, _t: string, url?: string | URL | null) {
        entries[i] = { url: String(url), state };
      },
      back() {
        if (i === 0) return;
        i--;
        onPop(w);
      },
    },
    forward() {
      if (i === entries.length - 1) return;
      i++;
      onPop(w);
    },
    scrollTo(o: ScrollToOptions) {
      w.scrollY = o.top ?? w.scrollY;
    },
    requestAnimationFrame(cb: () => void) {
      cb();
      return 0;
    },
    urls: () => entries.map((e) => e.url),
    index: () => i,
  };
  return w;
}
type FakeWindow = ReturnType<typeof fakeBrowser>;

/** Wires a fake browser to letterHistory the way LettersProvider does. */
function setup(start: string) {
  let open: string | null = start.startsWith("/m/") ? start.slice(3) : null;
  const ref: { nav?: ReturnType<typeof letterHistory> } = {};
  const w = fakeBrowser(start, (win) => {
    const m = win.location.pathname.match(/^\/m\/(.+)$/);
    if (m) {
      ref.nav?.open(m[1], false, open !== null);
      open = m[1];
    } else {
      open = null;
      ref.nav?.popClosed();
    }
  });
  const nav = (ref.nav = letterHistory(w as unknown as HistoryWindow));
  return {
    w,
    openLetter(id: string) {
      nav.open(id, true, open !== null);
      open = id;
    },
    close() {
      if (open === null) return;
      open = null;
      nav.close();
    },
    isOpen: () => open,
  };
}

describe("letterHistory", () => {
  it("closing from a #letters URL comes back to the same scroll position", () => {
    const s = setup("/?q=x#letters");
    s.w.scrollY = 6045;
    s.openLetter("abcd1");
    expect(s.w.urls()).toEqual(["/?q=x", "/m/abcd1"]);
    s.w.scrollY = 2456; // e.g. the browser scrolled to an anchor
    s.close();
    expect(s.w.location.pathname).toBe("/");
    expect(s.w.scrollY).toBe(6045);
  });

  it("Back from an open letter restores the scroll position too", () => {
    const s = setup("/");
    s.w.scrollY = 5332;
    s.openLetter("abcd1");
    s.w.scrollY = 0;
    s.w.history.back();
    expect(s.isOpen()).toBeNull();
    expect(s.w.scrollY).toBe(5332);
  });

  it("back → forward → close leaves no dead entry", () => {
    const s = setup("/");
    s.openLetter("abcd1");
    s.w.history.back();
    s.w.forward();
    expect(s.isOpen()).toBe("abcd1");
    s.close();
    expect(s.w.urls()).toEqual(["/", "/m/abcd1"]);
    expect(s.w.index()).toBe(0);
  });

  it("stepping between letters replaces the entry and close still goes back", () => {
    const s = setup("/");
    s.openLetter("abcd1");
    s.openLetter("efgh2");
    expect(s.w.urls()).toEqual(["/", "/m/efgh2"]);
    s.close();
    expect(s.w.index()).toBe(0);
    expect(s.w.location.pathname).toBe("/");
  });

  it("a letter opened from a deep link rewrites to / instead of leaving the site", () => {
    const s = setup("/m/abcd1");
    s.openLetter("efgh2");
    s.close();
    expect(s.w.urls()).toEqual(["/"]);
  });
});

describe("createLikeSync", () => {
  function deferred() {
    let resolve!: (v: LikeResult | null) => void;
    const promise = new Promise<LikeResult | null>((r) => (resolve = r));
    return { promise, resolve };
  }

  function harness(serverLikes = 5) {
    const ui = { liked: false, count: serverLikes };
    const server = { liked: false, likes: serverLikes };
    const calls: { like: boolean; d: ReturnType<typeof deferred> }[] = [];
    const toggle = createLikeSync({
      send: (_id, like) => {
        const d = deferred();
        calls.push({ like, d });
        return d.promise;
      },
      read: () => ({ ...ui }),
      write: (_id, liked, count) => {
        ui.liked = liked;
        ui.count = count;
      },
    });
    /** The server applies the request, then the response is delivered. */
    const answer = async (n: number) => {
      const c = calls[n];
      if (c.like !== server.liked) server.likes += c.like ? 1 : -1;
      server.liked = c.like;
      c.d.resolve({ liked: server.liked, likes: server.likes });
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    };
    return { ui, server, calls, answer, toggle: () => toggle({ id: "abcd1", likes: serverLikes }) };
  }

  it("is optimistic and settles on the server's numbers", async () => {
    const h = harness();
    const done = h.toggle();
    expect(h.ui).toEqual({ liked: true, count: 6 });
    await h.answer(0);
    await done;
    expect(h.ui).toEqual({ liked: true, count: 6 });
    expect(h.calls).toHaveLength(1);
  });

  it("a double tap never leaves the UI liked while the server is not", async () => {
    const h = harness();
    void h.toggle(); // like
    void h.toggle(); // unlike while the like is in flight
    expect(h.ui).toEqual({ liked: false, count: 5 });
    expect(h.calls).toHaveLength(1); // serialized: the unlike waits
    await h.answer(0);
    expect(h.calls.map((c) => c.like)).toEqual([true, false]);
    await h.answer(1);
    expect(h.server.liked).toBe(false);
    expect(h.ui).toEqual({ liked: false, count: 5 });
  });

  it("taps that cancel out while a request is in flight send nothing more", async () => {
    const h = harness();
    void h.toggle(); // like
    void h.toggle(); // unlike
    void h.toggle(); // like again
    await h.answer(0);
    expect(h.calls).toHaveLength(1);
    expect(h.ui).toEqual({ liked: true, count: 6 });
    expect(h.server).toEqual({ liked: true, likes: 6 });
  });

  it("rolls back to the last confirmed state when the request fails", async () => {
    const h = harness();
    const done = h.toggle();
    h.calls[0].d.resolve(null);
    await done;
    expect(h.ui).toEqual({ liked: false, count: 5 });
  });
});
