import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** Download (or `?inline=1` view) a file from the `artwork` bucket, after an access check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, { bucket: "artwork", staffTable: "artwork_versions", customerView: "customer_artwork", nameColumn: "file_path" });
}
