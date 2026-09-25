import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { isStaffRole } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serve one stored file through a 60-second signed URL (CLAUDE.md rule 6).
 * Access is checked first with the caller's own client: the customer view
 * for customers (their company, customer-visible only), the table under RLS
 * for staff. Only then does the service role sign the URL.
 * `?inline=1` shows the file instead of downloading it.
 */
export async function serveStoredFile(
  request: NextRequest,
  id: string,
  opts: { bucket: string; staffTable: string; customerView: string; nameColumn?: string },
) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const nameCol = opts.nameColumn ?? "file_name";
  const supabase = await createClient();
  const { data } = await supabase
    .from(isStaffRole(profile.role) ? opts.staffTable : opts.customerView)
    .select(nameCol === "file_path" ? "file_path" : `file_path, ${nameCol}`)
    .eq("id", id)
    .maybeSingle<Record<string, string | null>>();
  if (!data?.file_path) return new NextResponse("Not found", { status: 404 });

  const name = (nameCol !== "file_path" && data[nameCol]) || data.file_path.split("/").pop() || "file";
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const { data: signed, error } = await createAdminClient()
    .storage.from(opts.bucket)
    .createSignedUrl(data.file_path, 60, inline ? undefined : { download: name });
  if (error || !signed) return new NextResponse("This file is not available right now.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
