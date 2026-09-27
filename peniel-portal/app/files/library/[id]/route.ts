import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/**
 * Download a file from the artwork library, after an access check under RLS:
 * designs for admin, sales and quality; print layouts for admin only.
 * Customers have no access (no customer view; the table denies them).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, { bucket: "artwork-library", staffTable: "brand_artwork_files", customerView: "brand_artwork_files" });
}
