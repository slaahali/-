import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { clampChars, jsonNoStore, logError, serverError } from "@/lib/request";
import { getStore } from "@/lib/store";
import { MAX_ADMIN_PAGE_SIZE, clampOffset, isAdminFilter, toAdminItem } from "@/lib/store/shared";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const rawFilter = sp.get("filter");
  const filter = isAdminFilter(rawFilter) ? rawFilter : "all";
  const q = clampChars((sp.get("q") ?? "").trim(), 100);
  const rawLimit = Number.parseInt(sp.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_ADMIN_PAGE_SIZE, Math.max(1, rawLimit))
    : DEFAULT_LIMIT;
  const offset = clampOffset(Number.parseInt(sp.get("offset") ?? "", 10));

  try {
    const { items, total, counts } = await getStore().adminList({
      filter,
      q: q || undefined,
      limit,
      offset,
    });
    return jsonNoStore({ items: items.map(toAdminItem), total, counts });
  } catch (e) {
    logError("[api] admin list failed", e);
    return serverError();
  }
}
