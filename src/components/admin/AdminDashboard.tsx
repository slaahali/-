"use client";

import { useCallback, useState } from "react";
import { saveToken, useAdminToken } from "./admin-token";
import { ModerationBoard } from "./ModerationBoard";
import { TokenGate } from "./TokenGate";

/**
 * /admin entry: token gate → moderation board. Everything renders client-side
 * after hydration (the token lives in sessionStorage), so the server HTML only
 * ever contains the loading shell.
 */
export function AdminDashboard() {
  const token = useAdminToken();
  const [gateError, setGateError] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => {
    setGateError("الرمز غير صحيح");
    saveToken(null);
  }, []);

  const onLogout = useCallback(() => {
    setGateError(null);
    saveToken(null);
  }, []);

  const onAuthenticated = useCallback((t: string) => {
    setGateError(null);
    saveToken(t);
  }, []);

  if (token === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center" aria-busy="true">
        <p role="status" className="text-sm text-ink-mute">
          جاري التحميل…
        </p>
      </main>
    );
  }

  // Keyed on the error: the store update (sync lane) can render the gate before
  // setGateError lands, and TokenGate only reads initialError on mount.
  if (!token) return <TokenGate key={gateError ?? ""} initialError={gateError} onAuthenticated={onAuthenticated} />;

  return <ModerationBoard key={token} token={token} onUnauthorized={onUnauthorized} onLogout={onLogout} />;
}

export default AdminDashboard;
