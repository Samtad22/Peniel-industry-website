import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** Download (or `?inline=1` view) a file from the `documents` bucket, after an access check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, { bucket: "documents", staffTable: "documents", customerView: "customer_documents", nameColumn: "file_name" });
}
