"use client";

import { useId, useState, type CSSProperties, type ReactNode, type RefCallback } from "react";
import type { AdminFilter, MessageStatus } from "@/lib/types";
import { MEMORY_STYLE, cardStyle, colorAt } from "@/lib/assets";
import { COPY } from "@/lib/config";
import { formatCount, fromName, timeAgo, toLine } from "@/lib/format";
import type { AdminMessage } from "./admin-api";
import {
  STATUS_LABELS,
  expandsByDefault,
  formatAbsolute,
  humanReviewReason,
  moderationSummary,
  showsPrivate,
} from "./admin-model";
import { BTN, cx } from "./ui";

/** Shared by the desktop header row so columns line up. */
export const ROW_GRID = "lg:grid-cols-[2rem_minmax(0,1fr)_17rem_10.5rem] lg:gap-x-5";

const STATUS_TONE: Record<MessageStatus, string> = {
  published: "border-success/25 bg-success/10 text-success",
  pending: "border-orange-100 bg-orange-50 text-orange-700",
  hidden: "border-line-strong bg-cream-2 text-ink-soft",
};

export interface AdminItemProps {
  m: AdminMessage;
  filter: AdminFilter;
  now: number;
  selected: boolean;
  active: boolean;
  busy: boolean;
  rowRef: RefCallback<HTMLElement>;
  onSelect: (id: string, on: boolean) => void;
  onActivate: (id: string) => void;
  onStatus: (m: AdminMessage, status: MessageStatus) => void;
  onStar: (m: AdminMessage) => void;
  onDelete: (m: AdminMessage) => void;
  onCopy: (text: string) => void;
}

function Badge({
  className,
  style,
  children,
}: {
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold", className)}
      style={style}
    >
      {children}
    </span>
  );
}

export function AdminItem({
  m,
  filter,
  now,
  selected,
  active,
  busy,
  rowRef,
  onSelect,
  onActivate,
  onStatus,
  onStar,
  onDelete,
  onCopy,
}: AdminItemProps) {
  const id = useId();
  const s = cardStyle(m);
  const long = m.body.length > 240 || m.body.split("\n").length > 5;
  const [expanded, setExpanded] = useState(() => expandsByDefault(filter));
  const reason = humanReviewReason(m.reviewReason);
  // Kept after a removal request, then asked again: still public, needs another look.
  const flaggedAgain = m.status === "published" && m.reviewReason === "removal_request_again";
  const showReason =
    reason && !flaggedAgain && !(m.removalRequested && m.reviewReason === "removal_request");
  const mod = moderationSummary(m.moderation);
  const queue = filter === "pending";
  const absolute = formatAbsolute(m.createdAt);

  // Order matters: the first action is the one a moderator most likely wants.
  const hideFirst = filter === "removal" || filter === "reported";
  const actions: ReactNode[] = [];
  const publish =
    m.status !== "published" ? (
      <button
        key="publish"
        type="button"
        disabled={busy}
        aria-keyshortcuts={queue ? "A" : undefined}
        className={hideFirst ? BTN.quiet : BTN.primary}
        onClick={() => onStatus(m, "published")}
      >
        اعتماد ونشر
      </button>
    ) : null;
  const hide =
    m.status !== "hidden" ? (
      <button
        key="hide"
        type="button"
        disabled={busy}
        aria-keyshortcuts={queue ? "H" : undefined}
        className={hideFirst ? BTN.plum : BTN.quiet}
        onClick={() => onStatus(m, "hidden")}
      >
        إخفاء
      </button>
    ) : null;
  // Re-publishing clears the flag (the server keeps the letter as it is).
  const keep = flaggedAgain ? (
    <button key="keep" type="button" disabled={busy} className={BTN.quiet} onClick={() => onStatus(m, "published")}>
      إبقاء منشورة
    </button>
  ) : null;
  actions.push(...(hideFirst ? [hide, publish ?? keep] : [publish ?? keep, hide]));
  if (m.status !== "pending") {
    actions.push(
      <button key="pending" type="button" disabled={busy} className={BTN.quiet} onClick={() => onStatus(m, "pending")}>
        إرجاع للمراجعة
      </button>,
    );
  }
  if (m.status === "published") {
    actions.push(
      <a
        key="open"
        href={`/m/${encodeURIComponent(m.id)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={BTN.quiet}
      >
        فتح <span aria-hidden>↗</span>
        <span className="visually-hidden">(نافذة جديدة)</span>
      </a>,
    );
  }
  actions.push(
    <button key="delete" type="button" disabled={busy} className={BTN.danger} onClick={() => onDelete(m)}>
      حذف نهائي
    </button>,
  );

  return (
    <article
      ref={rowRef}
      tabIndex={-1}
      aria-labelledby={`${id}-to`}
      aria-current={active ? "true" : undefined}
      aria-busy={busy || undefined}
      onClick={() => onActivate(m.id)}
      className={cx(
        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-2xl border border-line p-3.5 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-plum/50 lg:rounded-none lg:border-0 lg:border-b lg:px-4 lg:py-4 lg:focus-visible:ring-inset",
        ROW_GRID,
        // Exclusive: Tailwind emits bg-white after bg-plum-50, so both at once would hide the selection.
        selected ? "bg-plum-50" : "bg-white",
        active && "ring-2 ring-orange/70 lg:ring-inset",
        busy && "opacity-70",
      )}
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: s.accent }}
    >
      {/* select */}
      <div className="pt-0.5">
        <label className="-m-2.5 grid size-11 cursor-pointer place-items-center lg:m-0 lg:size-7">
          <input
            type="checkbox"
            checked={selected}
            disabled={busy}
            onChange={(e) => onSelect(m.id, e.target.checked)}
            className="size-[1.1rem] accent-plum"
          />
          <span className="visually-hidden">تحديد {toLine(m)}</span>
        </label>
      </div>

      {/* the letter */}
      <div className="min-w-0 space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 id={`${id}-to`} className="leading-snug font-bold [overflow-wrap:anywhere] text-plum-900">
              {toLine(m)}
            </h3>
            {m.school ? (
              <p className="text-sm [overflow-wrap:anywhere] text-ink-soft">
                <span aria-hidden>🏫 </span>
                {m.school}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy}
            aria-pressed={m.starred}
            aria-keyshortcuts={queue ? "S" : undefined}
            title={m.starred ? "إزالة من المميزة" : "إضافة للمميزة"}
            onClick={() => onStar(m)}
            className={cx(
              "grid size-11 shrink-0 place-items-center rounded-xl border-[1.5px] text-lg transition-colors lg:size-9",
              m.starred
                ? "border-gold bg-gold-soft"
                : "border-line bg-white text-ink-mute hover:border-gold hover:bg-gold-soft/50",
            )}
          >
            <span aria-hidden>{m.starred ? "⭐" : "☆"}</span>
            <span className="visually-hidden">مميزة</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            title="لون الكارد"
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold"
            style={{ background: s.bg, color: s.ink, borderColor: s.accent }}
          >
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.accent }} />
            {m.inMemory ? `${colorAt(m.variant).name} (يظهر بلون الذكرى)` : s.name}
          </span>
          {m.inMemory ? (
            <Badge
              className="border-current"
              style={{ background: MEMORY_STYLE.bg, color: MEMORY_STYLE.accent }}
            >
              {COPY.memoryTag}
            </Badge>
          ) : null}
          {flaggedAgain ? (
            <Badge className="border-danger bg-danger text-white">طلب حذف جديد — ما زالت منشورة</Badge>
          ) : m.removalRequested ? (
            <Badge className="border-danger bg-danger text-white">طلب حذف من الشخص المذكور</Badge>
          ) : null}
          {m.removalKept && !flaggedAgain ? (
            <Badge className="border-line-strong bg-cream-2 text-ink-soft">أُبقيت بعد مراجعة طلب الحذف</Badge>
          ) : null}
          {m.reports > 0 ? (
            <Badge className="border-danger/30 bg-danger/10 text-danger">
              🚩 {formatCount(m.reports)} {m.reports === 1 ? "بلاغ" : "بلاغات"}
            </Badge>
          ) : null}
        </div>

        <div className="rounded-xl px-3.5 py-2.5 text-[15px] leading-7" style={{ background: s.bg, color: s.ink }}>
          <p
            id={`${id}-body`}
            className={cx("whitespace-pre-line [overflow-wrap:anywhere]", long && !expanded && "line-clamp-4")}
          >
            {m.body}
          </p>
          {long ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-body`}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="mt-1 text-xs font-bold underline underline-offset-2"
            >
              {expanded ? "طي الرسالة" : "عرض الرسالة كاملة"}
            </button>
          ) : null}
        </div>
      </div>

      {/* details */}
      <div className="col-span-2 min-w-0 space-y-2 lg:col-span-1">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px] leading-5 text-ink-soft">
          <dt className="text-ink-mute">من</dt>
          <dd className="[overflow-wrap:anywhere]">
            {fromName(m)}
            {!m.fromName ? <span className="text-ink-mute"> (بدون اسم)</span> : null}
          </dd>
          <dt className="text-ink-mute">التفاعل</dt>
          <dd>
            <span aria-hidden>{m.inMemory ? "🤍" : "❤️"}</span> {formatCount(m.likes)}{" "}
            {m.inMemory ? COPY.memoryLike : "إعجاب"}
            <span className="text-ink-mute"> · </span>
            <span className={m.reports > 0 ? "font-bold text-danger" : undefined}>
              {formatCount(m.reports)} بلاغ
            </span>
          </dd>
          <dt className="text-ink-mute">الوقت</dt>
          <dd>
            <time dateTime={m.createdAt} title={absolute}>
              {timeAgo(m.createdAt, now)}
            </time>
            <span className="text-ink-mute"> · {absolute}</span>
          </dd>
          {showReason ? (
            <>
              <dt className="text-ink-mute">المراجعة</dt>
              <dd title={m.reviewReason ?? undefined} className="[overflow-wrap:anywhere]">
                {reason}
              </dd>
            </>
          ) : null}
          {mod ? (
            <>
              <dt className="text-ink-mute">الفلتر</dt>
              <dd className="[overflow-wrap:anywhere]">{mod}</dd>
            </>
          ) : null}
          <dt className="text-ink-mute">المعرّف</dt>
          <dd>
            <span dir="ltr" className="font-mono text-xs select-all">
              {m.id}
            </span>
          </dd>
        </dl>

        {showsPrivate(filter) ? (
          <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50 px-3 py-2 text-[13px]">
            <p className="text-xs font-bold text-orange-700">🔒 بيانات خاصة — لا تُنشر ولا تُشارك</p>
            <p className="mt-0.5 text-ink">
              {m.surpriseOptIn ? "🎁 وافق على التواصل لو انختارت رسالته" : "لم يوافق على التواصل"}
            </p>
            {m.contact ? (
              <div className="mt-1 flex items-center gap-2">
                <span dir="ltr" className="min-w-0 font-mono text-sm font-semibold [overflow-wrap:anywhere] text-plum-900 select-all">
                  {m.contact}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (m.contact) onCopy(m.contact);
                  }}
                  className="ms-auto shrink-0 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100"
                >
                  نسخ
                </button>
              </div>
            ) : (
              <p className="mt-0.5 text-ink-mute">بدون وسيلة تواصل</p>
            )}
          </div>
        ) : null}
      </div>

      {/* status + actions */}
      <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:flex-col lg:items-stretch">
        <Badge className={cx("me-auto lg:me-0 lg:self-start", STATUS_TONE[m.status])}>
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {STATUS_LABELS[m.status]}
        </Badge>
        {actions}
      </div>
    </article>
  );
}
