import type { NextRequest } from "next/server";
import { serveStoredFile } from "@/lib/signed-file";

/** A brand's crown image from the `crowns` bucket, after an access check (customers: own brands only). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveStoredFile(request, id, {
    bucket: "crowns",
    staffTable: "brands",
    customerView: "customer_brands",
    pathColumn: "crown_image_path",
    nameColumn: "crown_image_path",
    ttl: 600,
  });
}
