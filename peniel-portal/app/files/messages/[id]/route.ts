import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** Download (or `?inline=1` view) a file attached to a message, after an access check. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, {
    bucket: "message-attachments",
    staffTable: "message_attachments",
    customerView: "customer_message_attachments",
  });
}
