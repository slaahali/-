import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/ids";
import { jsonNoStore, notFound, storeFailure } from "@/lib/request";
import { getStore } from "@/lib/store";
import { toPublic } from "@/lib/store/shared";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/messages/[id]">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();
  try {
    const message = await getStore().get(id);
    return message ? jsonNoStore({ message: toPublic(message) }) : notFound();
  } catch (e) {
    return storeFailure("[api] get message failed", e);
  }
}
