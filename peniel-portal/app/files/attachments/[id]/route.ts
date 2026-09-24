import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { isStaffRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens an order attachment through a short-lived signed URL (CLAUDE.md
 * rule 6). Access is checked with the caller's own client first — the
 * customer view for customers, RLS for staff — so a customer can only ever
 * reach their own company's files. `?inline=1` shows the file in the
 * browser (the inbox PO preview) instead of downloading it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: file } = await supabase
    .from(isStaffRole(profile.role) ? "order_attachments" : "customer_order_attachments")
    .select("file_path, file_name")
    .eq("id", id)
    .maybeSingle<{ file_path: string; file_name: string }>();
  if (!file) return new NextResponse("Not found", { status: 404 });

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const { data, error } = await createAdminClient()
    .storage.from("order-attachments")
    .createSignedUrl(file.file_path, 60, inline ? undefined : { download: file.file_name });
  if (error || !data) return new NextResponse("This file is not available right now.", { status: 404 });

  return NextResponse.redirect(data.signedUrl);
}
