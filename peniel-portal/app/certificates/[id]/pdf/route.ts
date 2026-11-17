import { penielLogo } from "@/lib/coa-issued";
import { certificateFileName, certificatePdf, type CertificateData } from "@/lib/coa-pdf";
import { getSettings } from "@/lib/settings-server";
import { createClient } from "@/lib/supabase/server";

/**
 * The certificate as a PDF download. It shows exactly what the certificate
 * page shows the person asking: certificate_of_analysis() runs as them, so a
 * customer gets only their own released, published, signed batch.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data } = await supabase.rpc("certificate_of_analysis", { p_inspection_id: id });
  const c = data as CertificateData | null;
  if (!c) return new Response("Not found", { status: 404 });
  const { coa } = await getSettings();
  const bytes = await certificatePdf(c, coa, await penielLogo());
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${certificateFileName(c)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
