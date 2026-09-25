import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** Download (or `?inline=1` view) a file from the `proofs` bucket, after an access check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, { bucket: "proofs", staffTable: "proofs", customerView: "customer_proofs", nameColumn: "file_name" });
}
