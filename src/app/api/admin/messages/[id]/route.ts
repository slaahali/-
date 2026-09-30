import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isValidId } from "@/lib/ids";
import {
  badRequest,
  bodyError,
  jsonNoStore,
  notFound,
  readJsonBody,
  storeFailure,
} from "@/lib/request";
import { getStore } from "@/lib/store";
import type { AdminPatch } from "@/lib/store/types";
import type { MessageStatus } from "@/lib/types";

export const runtime = "nodejs";

const STATUSES: readonly MessageStatus[] = ["published", "pending", "hidden"];

function parsePatch(v: unknown): AdminPatch | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as { status?: unknown; starred?: unknown };
  const patch: AdminPatch = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as MessageStatus)) return null;
    patch.status = b.status as MessageStatus;
  }
  if (b.starred !== undefined) {
    if (typeof b.starred !== "boolean") return null;
    patch.starred = b.starred;
  }
  return patch.status !== undefined || patch.starred !== undefined ? patch : null;
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();

  const body = await readJsonBody(req, 1024);
  if (!body.ok) return bodyError(body.reason);
  const patch = parsePatch(body.value);
  if (!patch) return badRequest("expected { status?: published|pending|hidden, starred?: boolean }");

  try {
    const ok = await getStore().adminUpdate(id, patch);
    return ok ? jsonNoStore({ ok: true }) : notFound();
  } catch (e) {
    return storeFailure("[api] admin update failed", e);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]">) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isValidId(id)) return notFound();

  try {
    const ok = await getStore().adminDelete(id);
    return ok ? jsonNoStore({ ok: true }) : notFound();
  } catch (e) {
    return storeFailure("[api] admin delete failed", e);
  }
}
