// Browser-side wrappers around the HTTP API (see the contract in ./types.ts).

import type {
  ApiError,
  CreateMessageBody,
  LikeResult,
  ListResult,
  PublicMessage,
  SortMode,
} from "./types";

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchMessages(
  params: { q?: string; sort: SortMode; cursor?: string | null; limit?: number },
  signal?: AbortSignal,
): Promise<ListResult> {
  const sp = new URLSearchParams({ sort: params.sort });
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.limit) sp.set("limit", String(params.limit));
  const res = await fetch(`/api/messages?${sp}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return (await res.json()) as ListResult;
}

export async function fetchMessage(id: string, signal?: AbortSignal): Promise<PublicMessage | null> {
  const res = await fetch(`/api/messages/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get failed: ${res.status}`);
  const data = await readJson<{ message: PublicMessage }>(res);
  return data?.message ?? null;
}

export type CreateResult =
  | { ok: true; message: PublicMessage }
  | { ok: false; status: number; error: ApiError };

export async function createMessage(body: CreateMessageBody): Promise<CreateResult> {
  let res: Response;
  try {
    res = await fetch("/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: { error: "server", message: "network" } };
  }
  if (res.status === 201) {
    const data = await readJson<{ message: PublicMessage }>(res);
    if (data?.message) return { ok: true, message: data.message };
  }
  const err = (await readJson<ApiError>(res)) ?? { error: "server" as const };
  return { ok: false, status: res.status, error: err };
}

export async function likeMessage(id: string, like: boolean): Promise<LikeResult | null> {
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(id)}/like`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ like }),
    });
    if (!res.ok) return null;
    return await readJson<LikeResult>(res);
  } catch {
    return null;
  }
}

export async function reportMessage(id: string, reason?: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(id)}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason ?? null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
