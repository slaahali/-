// Analytics hook. Pushes to window.dataLayer (GTM) when present; no-op otherwise.
// Event names used across the app:
//   letter_submit, letter_submit_blocked, letter_open, letter_like, letter_share,
//   story_download, gift_click, search, load_more, letter_report

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };

export function track(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const w = window as DataLayerWindow;
  w.dataLayer?.push({ event, ...params });
}
