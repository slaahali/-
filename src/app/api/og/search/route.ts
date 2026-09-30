import type { NextRequest } from "next/server";
import { getSearchSummary } from "@/lib/data";
import { ogError, ogResponse, renderOgPng } from "@/lib/og/render";
import { isDrawableQuery } from "@/lib/og/searchQuery";
import { safeSearchQuery } from "@/lib/search-query";

export const runtime = "nodejs";

/**
 * Shareable search result preview: "N رسالة شكر إلى «q»", or the invitation
 * when nothing matched. The query itself is only drawn when every word of it
 * matched real, moderated letters; anything else gets the campaign image.
 */
export async function GET(req: NextRequest) {
  try {
    // Offensive / contact / empty-after-honorifics queries never reach the image.
    const safe = safeSearchQuery(req.nextUrl.searchParams.get("q"));
    if (!safe) return ogResponse(await renderOgPng({ kind: "default" }));
    const { q, total } = await getSearchSummary(safe);
    if (!q) return ogResponse(await renderOgPng({ kind: "default" }));
    if (total > 0 && !isDrawableQuery(q)) return ogResponse(await renderOgPng({ kind: "default" }));
    return ogResponse(await renderOgPng({ kind: "search", q, total }));
  } catch (e) {
    return ogError(e);
  }
}
