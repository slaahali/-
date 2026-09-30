import type { NextRequest } from "next/server";
import { getPublicMessage } from "@/lib/data";
import { ogError, ogResponse, renderOgPng } from "@/lib/og/render";

export const runtime = "nodejs";

/** One letter's link-preview image. Unknown / unpublished ids get the campaign image. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/og/[id]">) {
  const { id } = await ctx.params;
  try {
    const m = await getPublicMessage(id);
    return ogResponse(await renderOgPng(m ? { kind: "letter", m } : { kind: "default" }));
  } catch (e) {
    return ogError(e);
  }
}
