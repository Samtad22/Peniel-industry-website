import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** Download (or `?inline=1` view) artwork a customer sent to Peniel, after an access check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, {
    bucket: "artwork",
    staffTable: "artwork_submissions",
    customerView: "customer_artwork_submissions",
  });
}
