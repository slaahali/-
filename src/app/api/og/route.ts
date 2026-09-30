import { ogError, ogResponse, renderOgPng } from "@/lib/og/render";

export const runtime = "nodejs";

/** Campaign link-preview image (1200×630). */
export async function GET() {
  try {
    return ogResponse(await renderOgPng({ kind: "default" }));
  } catch (e) {
    return ogError(e);
  }
}
