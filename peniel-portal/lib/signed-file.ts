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
  opts: {
    bucket: string;
    staffTable: string;
    customerView: string;
    nameColumn?: string;
    /** Column holding the Storage path (default `file_path`). */
    pathColumn?: string;
    /** Seconds the signed URL lives (default 60). The redirect may be cached privately for slightly less. */
    ttl?: number;
  },
) {
  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (!UUID.test(id)) return new NextResponse("Not found", { status: 404 });

  const pathCol = opts.pathColumn ?? "file_path";
  const nameCol = opts.nameColumn ?? "file_name";
  const ttl = opts.ttl ?? 60;
  const supabase = await createClient();
  const { data } = await supabase
    .from(isStaffRole(profile.role) ? opts.staffTable : opts.customerView)
    .select(nameCol === pathCol ? pathCol : `${pathCol}, ${nameCol}`)
    .eq("id", id)
    .maybeSingle<Record<string, string | null>>();
  const path = data?.[pathCol];
  if (!data || !path) return new NextResponse("Not found", { status: 404 });

  const name = (nameCol !== pathCol && data[nameCol]) || path.split("/").pop() || "file";
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  const { data: signed, error } = await createAdminClient()
    .storage.from(opts.bucket)
    .createSignedUrl(path, ttl, inline ? undefined : { download: name });
  if (error || !signed) return new NextResponse("This file is not available right now.", { status: 404 });
  const res = NextResponse.redirect(signed.signedUrl);
  if (ttl > 60) res.headers.set("Cache-Control", `private, max-age=${ttl - 60}`);
  return res;
}
