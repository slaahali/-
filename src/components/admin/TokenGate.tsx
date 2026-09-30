"use client";

import { useState, type FormEvent } from "react";
import { COPY } from "@/lib/config";
import { describeError, listMessages } from "./admin-api";
import { cx } from "./ui";

/**
 * Password-style gate. The token is checked against the API before it's kept,
 * and the input has no `name`, so even a native submit could never put it in a URL.
 */
export function TokenGate({
  initialError,
  onAuthenticated,
}: {
  initialError: string | null;
  onAuthenticated: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = value.trim();
    if (!token) {
      setError("اكتب رمز الدخول");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await listMessages(token, { filter: "pending", limit: 1, offset: 0 });
      onAuthenticated(token);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span
            aria-hidden
            className="mx-auto grid size-14 place-items-center rounded-2xl bg-plum text-2xl text-white shadow-soft"
          >
            🔒
          </span>
          <h1 className="mt-3 text-xl font-bold text-plum">لوحة الإشراف</h1>
          <p className="text-sm text-ink-soft">رسائل يوم المعلم · {COPY.brand}</p>
        </div>

        <form method="post" noValidate onSubmit={submit} className="paper-plain space-y-4 p-5">
          <div>
            <label htmlFor="admin-token" className="field-label">
              رمز الدخول
            </label>
            <div dir="ltr" className="relative">
              <input
                id="admin-token"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "admin-token-error" : "admin-token-hint"}
                className="field pe-20"
              />
              <button
                type="button"
                aria-pressed={reveal}
                aria-controls="admin-token"
                onClick={() => setReveal((v) => !v)}
                className="absolute inset-y-0 end-2 my-auto h-9 rounded-lg px-2.5 text-xs font-bold text-plum hover:bg-plum-50"
              >
                {reveal ? "إخفاء" : "إظهار"}
              </button>
            </div>
            {error ? (
              <p id="admin-token-error" role="alert" className="field-error">
                {error}
              </p>
            ) : (
              <p id="admin-token-hint" className="mt-1.5 text-xs leading-relaxed text-ink-mute">
                يُحفظ في هذا التبويب فقط، ويُمسح لما تسكّره أو تضغط «خروج».
              </p>
            )}
          </div>
          <button type="submit" disabled={busy} className={cx("btn btn-plum w-full", busy && "opacity-70")}>
            {busy ? "جاري التحقق…" : "دخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
