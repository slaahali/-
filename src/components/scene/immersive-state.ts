// Whether the full-screen letters tunnel is open. The hero engine listens so it
// stops rendering while the tunnel covers it (two live WebGL loops on a phone
// would halve the frame rate for nothing).

let open = false;
const listeners = new Set<(open: boolean) => void>();

export function isImmersiveOpen(): boolean {
  return open;
}

export function setImmersiveOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const fn of listeners) fn(open);
}

export function subscribeImmersive(fn: (open: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
