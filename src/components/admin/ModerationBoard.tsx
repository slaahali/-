"use client";

import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AdminFilter, MessageStatus } from "@/lib/types";
import { COPY } from "@/lib/config";
import { formatCount, timeAgo, toLine } from "@/lib/format";
import {
  AdminApiError,
  deleteMessage,
  describeError,
  fetchExport,
  isAbortError,
  isUnauthorized,
  listMessages,
  patchMessage,
  saveBlob,
  type AdminMessage,
  type AdminPatch,
  type ExportFilter,
} from "./admin-api";
import {
  ADMIN_TITLE,
  PAGE_SIZE,
  POLL_MS,
  SEARCH_DEBOUNCE_MS,
  applyPatch,
  countsDelta,
  emptyCounts,
  exportFilename,
  inversePatch,
  matchesFilter,
  membershipDelta,
  neighbourId,
  nextOffset,
  orderForTab,
  pageRange,
  placeItem,
  prevOffset,
  refillOffset,
  runPool,
  shortcutFor,
  stepId,
  tabFor,
} from "./admin-model";
import { AdminItem, ROW_GRID } from "./AdminItem";
import { AdminTabs, tabId } from "./AdminTabs";
import { ConfirmDialog } from "./ConfirmDialog";
import { Toaster, useToasts } from "./Toasts";
import { BTN, WRAP, copyText, cx, isTypingTarget, prefersReducedMotion } from "./ui";

type BulkStatus = "published" | "hidden";

type Confirm =
  | { kind: "delete"; item: AdminMessage }
  | { kind: "bulk"; status: BulkStatus; ids: string[] };

const DONE: Record<MessageStatus, string> = {
  published: "تم نشر الرسالة ✅",
  hidden: "تم إخفاء الرسالة",
  pending: "رجعت الرسالة لقائمة المراجعة",
};

const BULK_DONE: Record<BulkStatus, (n: string) => string> = {
  published: (n) => `تم نشر ${n} رسالة ✅`,
  hidden: (n) => `تم إخفاء ${n} رسالة`,
};

const EMPTY: ReadonlySet<string> = new Set();

/** Latest state for async callbacks (undo toasts, polling) that outlive their render. */
interface Live {
  items: AdminMessage[];
  filter: AdminFilter;
  q: string;
  activeId: string | null;
  busy: ReadonlySet<string>;
  counts: Record<AdminFilter, number>;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-line-strong bg-white px-1.5 font-sans text-[11px] leading-5 font-bold text-plum shadow-[0_1px_0_var(--color-line-strong)]">
      {children}
    </kbd>
  );
}

export function ModerationBoard({
  token,
  onUnauthorized,
  onLogout,
}: {
  token: string;
  onUnauthorized: () => void;
  onLogout: () => void;
}) {
  const panelId = useId();
  const searchId = useId();
  const panelRef = useRef<HTMLElement>(null);

  // What we're looking at.
  const [filter, setFilter] = useState<AdminFilter>("pending");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const viewKey = `${filter}\u0000${q}\u0000${offset}`;
  const requestKey = `${viewKey}\u0000${reloadKey}`;

  // What the server said (plus optimistic edits).
  const [items, setItems] = useState<AdminMessage[]>([]);
  const [itemsView, setItemsView] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(emptyCounts);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; text: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [arrivals, setArrivals] = useState(0);

  // Interaction.
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY);
  const [busy, setBusy] = useState<ReadonlySet<string>>(EMPTY);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [exporting, setExporting] = useState<ExportFilter | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  const { toasts, push, dismiss } = useToasts();

  /** Bumps whenever `items` is replaced by a server load (so stale rollbacks reload instead). */
  const gen = useRef(0);
  /** An action emptied the page → load the next batch once nothing is in flight. */
  const refill = useRef(false);
  const rows = useRef(new Map<string, HTMLElement>());

  const loading = loadedKey !== requestKey && loadError?.key !== requestKey;
  const fresh = itemsView === viewKey;
  const errorText = loadError?.key === requestKey ? loadError.text : null;
  const queue = filter === "pending";
  const activeInList = activeId !== null && items.some((m) => m.id === activeId) ? activeId : null;
  const currentActive = queue && fresh ? (activeInList ?? items[0]?.id ?? null) : null;

  const live = useRef<Live>({ items, filter, q, activeId: currentActive, busy, counts });
  useLayoutEffect(() => {
    live.current = { items, filter, q, activeId: currentActive, busy, counts };
  });

  // ------------------------------------------------------------ loading ---
  useEffect(() => {
    const ctrl = new AbortController();
    listMessages(token, { filter, q, limit: PAGE_SIZE, offset }, ctrl.signal).then(
      (res) => {
        gen.current += 1;
        refill.current = false;
        const ids = new Set(res.items.map((m) => m.id));
        setItems(orderForTab(filter, res.items));
        setItemsView(viewKey);
        setTotal(res.total);
        setCounts(res.counts);
        setLoadedKey(requestKey);
        setLoadError(null);
        setUpdatedAt(new Date().toISOString());
        setArrivals(0);
        setSelected((prev) => (prev.size ? new Set([...prev].filter((id) => ids.has(id))) : prev));
      },
      (err: unknown) => {
        if (isAbortError(err)) return;
        if (isUnauthorized(err)) return onUnauthorized();
        setLoadError({ key: requestKey, text: describeError(err) });
      },
    );
    return () => ctrl.abort();
  }, [token, filter, q, offset, viewKey, requestKey, onUnauthorized]);

  // Debounced search.
  useEffect(() => {
    const next = qInput.trim();
    if (next === q) return;
    const t = window.setTimeout(() => {
      setQ(next);
      setOffset(0);
      setSelected(EMPTY);
      setActiveId(null);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [qInput, q]);

  // The page was emptied by moderation actions: pull in the next batch.
  useEffect(() => {
    if (!refill.current || busy.size > 0 || items.length > 0 || !fresh) return;
    const t = window.setTimeout(() => {
      refill.current = false;
      if (total <= 0) return;
      const o = refillOffset(offset, total);
      if (o !== offset) setOffset(o);
      else setReloadKey((k) => k + 1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [items.length, busy.size, total, offset, fresh]);

  // Live counts: poll every minute (and when the tab becomes visible again).
  const pollCounts = useEffectEvent(async (detectArrivals: boolean) => {
    try {
      const res = await listMessages(token, { filter: "pending", limit: 1, offset: 0 });
      const cur = live.current;
      if (cur.busy.size > 0) return; // an optimistic edit is in flight; next tick will catch up
      if (detectArrivals && cur.filter === "pending" && !cur.q) {
        const arrived = res.counts.pending - cur.counts.pending;
        if (arrived > 0) {
          if (cur.items.length === 0) setReloadKey((k) => k + 1);
          else setArrivals((n) => n + arrived);
        }
      }
      setCounts(res.counts);
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
    }
  });

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      setNow(Date.now());
      void pollCounts(true);
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Settle the counts shortly after edits (server-side side effects, other moderators).
  useEffect(() => {
    if (!syncTick) return;
    const t = window.setTimeout(() => void pollCounts(false), 1500);
    return () => window.clearTimeout(t);
  }, [syncTick]);

  useEffect(() => {
    document.title = counts.pending > 0 ? `(${formatCount(counts.pending)}) ${ADMIN_TITLE}` : ADMIN_TITLE;
  }, [counts.pending]);
  useEffect(
    () => () => {
      document.title = ADMIN_TITLE;
    },
    [],
  );

  // ---------------------------------------------------------- mutations ---
  function markBusy(ids: ReadonlyArray<string>, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** Moves one letter from state `from` to `to` (null = absent / deleted) in list, counts and total. */
  function applyLocal(id: string, from: AdminMessage | null, to: AdminMessage | null, hint: number) {
    const f = live.current.filter;
    setItems((list) => placeItem(list, id, to, f, hint));
    setCounts((c) => countsDelta(c, from, to));
    setTotal((t) => Math.max(0, t + membershipDelta(f, from, to)));
    if (!to || !matchesFilter(f, to)) refill.current = true;
  }

  function rollback(g: number, id: string, from: AdminMessage | null, to: AdminMessage | null, hint: number) {
    if (gen.current !== g) setReloadKey((k) => k + 1);
    else applyLocal(id, from, to, hint);
  }

  function reportFailure(err: unknown, what: string) {
    if (isUnauthorized(err)) onUnauthorized();
    else push({ kind: "error", text: `${what} — ${describeError(err)}` });
  }

  function focusRow(id: string | null) {
    if (!id) return;
    requestAnimationFrame(() => {
      const el = rows.current.get(id);
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  /** `id` is about to leave the list: hand the queue cursor (and focus) to its neighbour. */
  function handOff(id: string) {
    const { items: list, activeId: cur } = live.current;
    const nb = neighbourId(list, id);
    if (cur === id) setActiveId(nb);
    if (rows.current.get(id)?.contains(document.activeElement)) focusRow(nb);
  }

  // Reads everything through `live`, so an undo from an old toast still acts on current state.
  async function patchOne(
    m: AdminMessage,
    patch: AdminPatch,
    doneText: string,
    opts: { undoable?: boolean; hint?: number } = {},
  ) {
    const { items: list, filter: f, busy: b } = live.current;
    if (b.has(m.id)) return;
    const idx = list.findIndex((x) => x.id === m.id);
    const hint = idx >= 0 ? idx : (opts.hint ?? 0);
    const before = idx >= 0 ? list[idx] : m;
    const after = applyPatch(before, patch);
    const g = gen.current;
    if (!matchesFilter(f, after)) handOff(m.id);
    applyLocal(m.id, before, after, hint);
    markBusy([m.id], true);
    try {
      await patchMessage(token, m.id, patch);
      push({
        kind: "success",
        text: doneText,
        action:
          opts.undoable === false
            ? undefined
            : {
                label: "تراجع",
                run: () => void patchOne(after, inversePatch(before, patch), "تم التراجع", { undoable: false, hint }),
              },
      });
      setSyncTick((t) => t + 1);
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === "not_found") {
        rollback(g, m.id, after, null, hint);
        push({ kind: "info", text: describeError(err) });
      } else {
        rollback(g, m.id, after, before, hint);
        reportFailure(err, "ما قدرنا نحدّث الرسالة");
      }
    } finally {
      markBusy([m.id], false);
    }
  }

  function changeStatus(m: AdminMessage, status: MessageStatus) {
    if (m.status !== status) void patchOne(m, { status }, DONE[status]);
    // "Keep": re-publishing an already public letter clears a new removal-request flag.
    else if (status === "published" && m.reviewReason) void patchOne(m, { status }, "أُبقيت الرسالة منشورة");
  }

  function toggleStar(m: AdminMessage) {
    void patchOne(m, { starred: !m.starred }, m.starred ? "أزيلت من المميزة" : "انضافت للمميزة ⭐");
  }

  async function removeForever(m: AdminMessage) {
    const { items: list, busy: b } = live.current;
    if (b.has(m.id)) return;
    const idx = list.findIndex((x) => x.id === m.id);
    const before = idx >= 0 ? list[idx] : m;
    const g = gen.current;
    handOff(m.id);
    applyLocal(m.id, before, null, idx);
    setSelected((prev) => (prev.has(m.id) ? new Set([...prev].filter((id) => id !== m.id)) : prev));
    markBusy([m.id], true);
    try {
      await deleteMessage(token, m.id);
      push({ kind: "success", text: "تم حذف الرسالة نهائياً" });
      setSyncTick((t) => t + 1);
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === "not_found") {
        push({ kind: "info", text: "الرسالة كانت محذوفة أصلاً" });
      } else {
        rollback(g, m.id, null, before, idx);
        reportFailure(err, "ما قدرنا نحذف الرسالة");
      }
    } finally {
      markBusy([m.id], false);
    }
  }

  async function bulkSetStatus(ids: ReadonlyArray<string>, status: BulkStatus) {
    const { items: list, busy: b, filter: f, activeId: cur } = live.current;
    const wanted = new Set(ids);
    const targets = list
      .map((before, index) => ({ before, after: applyPatch(before, { status }), index }))
      .filter((t) => wanted.has(t.before.id) && t.before.status !== status && !b.has(t.before.id));
    setSelected(EMPTY);
    if (targets.length === 0) return;
    const g = gen.current;
    if (targets.some((t) => t.before.id === cur && !matchesFilter(f, t.after))) setActiveId(null);
    for (const t of targets) applyLocal(t.before.id, t.before, t.after, t.index);
    const tids = targets.map((t) => t.before.id);
    markBusy(tids, true);
    const results = await runPool(targets, 4, (t) => patchMessage(token, t.before.id, { status }));
    markBusy(tids, false);

    let ok = 0;
    let lastError: unknown = null;
    let failed = 0;
    // targets are in list order, so rolling back in order restores the original positions.
    results.forEach((r, i) => {
      const t = targets[i];
      if (r.status === "fulfilled") {
        ok++;
      } else if (r.reason instanceof AdminApiError && r.reason.kind === "not_found") {
        rollback(g, t.before.id, t.after, null, t.index);
      } else {
        failed++;
        lastError = r.reason;
        rollback(g, t.before.id, t.after, t.before, t.index);
      }
    });
    if (ok) push({ kind: "success", text: BULK_DONE[status](formatCount(ok)) });
    if (failed) {
      if (isUnauthorized(lastError)) return onUnauthorized();
      push({
        kind: "error",
        text: `تعذر تحديث ${formatCount(failed)} رسالة ورجّعناها — ${describeError(lastError)}`,
      });
    }
    setSyncTick((t) => t + 1);
  }

  // ---------------------------------------------------------- shortcuts ---
  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (!queue || !fresh || confirm || e.defaultPrevented || isTypingTarget(e.target)) return;
    const action = shortcutFor(e);
    if (!action) return;
    if (e.repeat && action !== "next" && action !== "prev") return;
    e.preventDefault();
    if (action === "next" || action === "prev") {
      const id = stepId(items, currentActive, action === "next" ? 1 : -1);
      setActiveId(id);
      focusRow(id);
      return;
    }
    const m = items.find((x) => x.id === currentActive);
    if (!m || busy.has(m.id)) return;
    if (action === "publish") changeStatus(m, "published");
    else if (action === "hide") changeStatus(m, "hidden");
    else toggleStar(m);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ------------------------------------------------------------ actions ---
  function selectTab(f: AdminFilter) {
    if (f === filter) return;
    setFilter(f);
    setOffset(0);
    setSelected(EMPTY);
    setActiveId(null);
    setArrivals(0);
  }

  function refresh() {
    setReloadKey((k) => k + 1);
  }

  function goTo(o: number) {
    setOffset(o);
    setSelected(EMPTY);
    setActiveId(null);
    panelRef.current?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectable = fresh ? items.filter((m) => !busy.has(m.id)) : [];
  const selectedIds = items.filter((m) => selected.has(m.id)).map((m) => m.id);
  const allSelected = selectable.length > 0 && selectable.every((m) => selected.has(m.id));
  const someSelected = selectedIds.length > 0;

  function selectAll(on: boolean) {
    setSelected(on ? new Set(selectable.map((m) => m.id)) : EMPTY);
  }

  async function runExport(f: ExportFilter) {
    if (exporting) return;
    setExporting(f);
    try {
      const { blob, filename } = await fetchExport(token, f);
      saveBlob(blob, filename ?? exportFilename(f));
      push({ kind: "success", text: "تم تنزيل الملف 📄" });
    } catch (err) {
      reportFailure(err, "ما قدرنا نصدّر الملف");
    } finally {
      setExporting(null);
    }
  }

  async function copyContact(text: string) {
    const ok = await copyText(text);
    push(ok ? { kind: "success", text: "تم النسخ" } : { kind: "error", text: "ما قدرنا ننسخ — انسخه يدوياً" });
  }

  function runConfirm() {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "delete") void removeForever(c.item);
    else void bulkSetStatus(c.ids, c.status);
  }

  // ------------------------------------------------------------- render ---
  const tab = tabFor(filter);
  const range = pageRange(offset, items.length, total);
  const hasPrev = offset > 0;
  const hasNext = nextOffset(offset, items.length) < total;
  const selectAllBox = (className: string, label: ReactNode) => (
    <label className={className}>
      <input
        type="checkbox"
        checked={allSelected}
        disabled={selectable.length === 0}
        ref={(el) => {
          if (el) el.indeterminate = someSelected && !allSelected;
        }}
        onChange={(e) => selectAll(e.target.checked)}
        className="size-[1.1rem] accent-plum"
      />
      {label}
    </label>
  );

  let panel: ReactNode;
  if (!fresh && errorText) {
    panel = (
      <div role="alert" className="rounded-2xl border border-danger/25 bg-white px-5 py-8 text-center">
        <p className="font-bold text-danger">{errorText}</p>
        <button type="button" className={cx(BTN.quiet, "mt-4")} onClick={refresh}>
          إعادة المحاولة
        </button>
      </div>
    );
  } else if (!fresh) {
    panel = (
      <>
        <p className="visually-hidden" role="status">
          جاري التحميل…
        </p>
        <ul aria-hidden className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-white/70" />
          ))}
        </ul>
      </>
    );
  } else if (items.length === 0) {
    panel = (
      <div className="rounded-2xl border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
        <p className="font-bold text-plum">{q ? `ما لقينا شي لـ «${q}» في «${tab.label}»` : tab.empty}</p>
        {queue && !q ? (
          <p className="mt-1 text-sm text-ink-mute">نشيّك على الرسائل الجديدة تلقائياً كل دقيقة.</p>
        ) : null}
        {q ? (
          <button type="button" className={cx(BTN.quiet, "mt-4")} onClick={() => setQInput("")}>
            مسح البحث
          </button>
        ) : null}
      </div>
    );
  } else {
    panel = (
      <>
        {errorText ? (
          <p role="alert" className="mb-3 rounded-xl border border-danger/25 bg-white px-3 py-2 text-sm text-danger">
            {errorText}
          </p>
        ) : null}
        {selectAllBox(
          "mb-2 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-soft lg:hidden",
          "تحديد كل رسائل الصفحة",
        )}
        <div
          className={cx(
            "transition-opacity lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:bg-white",
            loading && "opacity-60",
          )}
        >
          <div
            className={cx(
              "hidden items-center border-b border-line bg-cream px-4 py-2 text-xs font-bold text-ink-mute lg:grid",
              ROW_GRID,
            )}
            style={{ borderInlineStartWidth: 4, borderInlineStartColor: "transparent" }}
          >
            {selectAllBox(
              "grid size-7 cursor-pointer place-items-center",
              <span className="visually-hidden">تحديد كل رسائل الصفحة</span>,
            )}
            <span>الرسالة</span>
            <span>التفاصيل</span>
            <span>الحالة والإجراءات</span>
          </div>
          <ul className="flex flex-col gap-3 lg:gap-0 lg:[&>li:last-child>article]:border-b-0">
            {items.map((m) => (
              <li key={`${filter}:${m.id}`}>
                <AdminItem
                  m={m}
                  filter={filter}
                  now={now}
                  selected={selected.has(m.id)}
                  active={m.id === currentActive}
                  busy={busy.has(m.id)}
                  rowRef={(el) => {
                    if (el) rows.current.set(m.id, el);
                    return () => {
                      rows.current.delete(m.id);
                    };
                  }}
                  onSelect={toggleSelect}
                  onActivate={(id) => {
                    if (queue) setActiveId(id);
                  }}
                  onStatus={changeStatus}
                  onStar={toggleStar}
                  onDelete={(item) => setConfirm({ kind: "delete", item })}
                  onCopy={copyContact}
                />
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }

  const confirmProps =
    confirm?.kind === "delete"
      ? {
          title: "حذف الرسالة نهائياً؟",
          body: (
            <p>
              رسالة «{toLine(confirm.item)}» بتنحذف من قاعدة البيانات وما تقدر ترجعها. لو تبي تشيلها من الجدار بس،
              استخدم «إخفاء».
            </p>
          ),
          confirmLabel: "حذف نهائي",
          tone: "danger" as const,
        }
      : confirm?.kind === "bulk"
        ? {
            title:
              confirm.status === "published"
                ? `نشر ${formatCount(confirm.ids.length)} رسالة؟`
                : `إخفاء ${formatCount(confirm.ids.length)} رسالة؟`,
            body: (
              <p>
                {confirm.status === "published"
                  ? "بتظهر على جدار الامتنان للكل مباشرة. تأكد إنك قريتها."
                  : "بتختفي من الجدار، وتقدر ترجعها من تبويب «مخفية»."}
              </p>
            ),
            confirmLabel: confirm.status === "published" ? "اعتماد ونشر" : "إخفاء",
            tone: "primary" as const,
          }
        : { title: "", confirmLabel: "", tone: "primary" as const };

  return (
    <div className="min-h-dvh pb-16">
      <header className="border-b border-line bg-paper">
        <div className={cx(WRAP, "flex flex-wrap items-center gap-x-3 gap-y-3 py-3")}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-plum text-lg">
              ✉️
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="text-lg font-bold text-plum">لوحة الإشراف</h1>
              <p className="text-xs text-ink-mute">رسائل يوم المعلم · {COPY.brand}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:order-last">
            <button type="button" className={BTN.quiet} onClick={refresh} disabled={loading}>
              <span aria-hidden className={cx("inline-block", loading && "animate-spin")}>
                ↻
              </span>
              تحديث
            </button>
            <button type="button" className={BTN.quiet} onClick={onLogout}>
              خروج
            </button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            {(["starred", "surprise"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cx(BTN.quiet, "whitespace-normal sm:whitespace-nowrap")}
                disabled={exporting !== null}
                onClick={() => void runExport(f)}
              >
                <span aria-hidden>⬇</span>
                {exporting === f
                  ? "جاري التصدير…"
                  : f === "starred"
                    ? "تصدير المميزة CSV"
                    : "تصدير المرشحين للمفاجأة CSV"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={cx(WRAP, "pt-4")}>
        <AdminTabs value={filter} counts={counts} onChange={selectTab} panelId={panelId} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="relative min-w-0 flex-1 basis-72">
            <label htmlFor={searchId} className="visually-hidden">
              ابحث في الرسائل
            </label>
            <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-sm">
              🔍
            </span>
            <input
              id={searchId}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && qInput) {
                  e.preventDefault();
                  setQInput("");
                }
              }}
              placeholder="ابحث بالاسم، المدرسة، المعرّف أو وسيلة التواصل…"
              className="field min-h-11 rounded-xl py-2 ps-10"
            />
          </div>
          <p className="text-xs text-ink-mute">
            {loading
              ? "جاري التحميل…"
              : updatedAt
                ? `آخر تحديث ${timeAgo(updatedAt, now)} · العدّاد يتحدّث كل دقيقة`
                : null}
          </p>
        </div>

        {queue ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-soft">
            <span className="font-bold text-plum">الأقدم أولاً</span>
            <span className="hidden flex-wrap items-center gap-x-3 gap-y-1 md:flex" aria-label="اختصارات لوحة المفاتيح">
              <span>
                <Kbd>A</Kbd> اعتماد ونشر
              </span>
              <span>
                <Kbd>H</Kbd> إخفاء
              </span>
              <span>
                <Kbd>S</Kbd> تمييز ⭐
              </span>
              <span>
                <Kbd>J</Kbd> التالي
              </span>
              <span>
                <Kbd>K</Kbd> السابق
              </span>
            </span>
          </div>
        ) : null}

        {arrivals > 0 ? (
          <div
            role="status"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-sm text-orange-700"
          >
            <span>وصلت {formatCount(arrivals)} رسالة جديدة للمراجعة</span>
            <button type="button" className="ms-auto font-bold underline underline-offset-2" onClick={refresh}>
              تحديث القائمة
            </button>
          </div>
        ) : null}

        <section
          ref={panelRef}
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(filter)}
          aria-busy={loading}
          className="mt-3 scroll-mt-4"
        >
          <h2 className="visually-hidden">
            {tab.label}
            {q ? ` — نتائج «${q}»` : ""}
          </h2>
          {panel}
        </section>

        {someSelected ? (
          <div className="sticky bottom-3 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-plum-200 bg-paper/95 p-2.5 shadow-lift backdrop-blur">
            <p className="me-auto px-1 text-sm font-bold text-plum">تم تحديد {formatCount(selectedIds.length)}</p>
            <button
              type="button"
              className={BTN.primary}
              onClick={() => setConfirm({ kind: "bulk", status: "published", ids: selectedIds })}
            >
              اعتماد ونشر المحدد
            </button>
            <button
              type="button"
              className={BTN.plum}
              onClick={() => setConfirm({ kind: "bulk", status: "hidden", ids: selectedIds })}
            >
              إخفاء المحدد
            </button>
            <button type="button" className={BTN.quiet} onClick={() => setSelected(EMPTY)}>
              إلغاء التحديد
            </button>
          </div>
        ) : null}

        {fresh && (hasPrev || hasNext) ? (
          <nav aria-label="التنقل بين الصفحات" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              عرض {formatCount(range.from)}–{formatCount(range.to)} من {formatCount(range.total)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={BTN.quiet}
                disabled={!hasPrev || loading}
                onClick={() => goTo(prevOffset(offset))}
              >
                <span aria-hidden>→</span> السابق
              </button>
              <button
                type="button"
                className={BTN.quiet}
                disabled={!hasNext || loading}
                onClick={() => goTo(nextOffset(offset, items.length))}
              >
                التالي <span aria-hidden>←</span>
              </button>
            </div>
          </nav>
        ) : fresh && items.length > 0 ? (
          <p className="mt-4 text-sm text-ink-mute">
            {formatCount(items.length)} من {formatCount(total)}
          </p>
        ) : null}
      </main>

      <ConfirmDialog
        open={confirm !== null}
        title={confirmProps.title}
        body={"body" in confirmProps ? confirmProps.body : undefined}
        confirmLabel={confirmProps.confirmLabel}
        tone={confirmProps.tone}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
      <Toaster toasts={toasts} onDismiss={dismiss} raised={someSelected} />
    </div>
  );
}
