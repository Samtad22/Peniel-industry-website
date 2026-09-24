import OpsShell from "@/components/ops/OpsShell";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: { default: "Peniel Ops", template: "%s | Peniel Ops" } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const supabase = await createClient();

  // Sidebar badges: orders waiting to be confirmed, unread customer messages,
  // batches held in QC. Counted through RLS as this staff member.
  const [inbox, messages, held] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("read_by_staff", false),
    supabase.from("qc_inspections").select("id", { count: "exact", head: true }).eq("result", "on_hold"),
  ]);

  return (
    <OpsShell
      name={profile.full_name}
      role={profile.role}
      badges={{ inbox: inbox.count ?? 0, messages: messages.count ?? 0, quality: held.count ?? 0 }}
    >
      {children}
    </OpsShell>
  );
}
