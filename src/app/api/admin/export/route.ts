import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { badRequest, storeFailure } from "@/lib/request";
import { getStore } from "@/lib/store";
import { messagesToCsv } from "@/lib/store/csv";
import type { ExportFilter } from "@/lib/store/types";

export const runtime = "nodejs";

/** Starred / surprise opt-in letters with contact details, as CSV (admin only). */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const filter = req.nextUrl.searchParams.get("filter");
  if (filter !== "starred" && filter !== "surprise") {
    return badRequest("filter must be starred or surprise");
  }

  try {
    const rows = await getStore().adminExport(filter satisfies ExportFilter);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(messagesToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="teachers-day-letters-${filter}-${date}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return storeFailure("[api] admin export failed", e);
  }
}
