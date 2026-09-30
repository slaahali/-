import type { NextRequest } from "next/server";
import { getSearchSummary } from "@/lib/data";
import { ogError, ogResponse, renderOgPng } from "@/lib/og/render";

export const runtime = "nodejs";

/**
 * Shareable search result preview: "N رسالة شكر إلى «q»", or the invitation
 * when nothing matched (the query itself is only drawn when it matched real,
 * moderated letters).
 */
export async function GET(req: NextRequest) {
  try {
    const { q, total } = await getSearchSummary(req.nextUrl.searchParams.get("q"));
    return ogResponse(await renderOgPng(q ? { kind: "search", q, total } : { kind: "default" }));
  } catch (e) {
    return ogError(e);
  }
}
