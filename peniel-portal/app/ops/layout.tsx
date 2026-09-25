import OpsShell from "@/components/ops/OpsShell";
import { requireStaff } from "@/lib/auth";
import { staffSeenBadges } from "@/lib/nav-badges";
import { OPS_NAV } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: { default: "Peniel Ops", template: "%s | Peniel Ops" } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const supabase = await createClient();

  // Sidebar badges: orders waiting to be confirmed, unread customer messages,
  // batches held in QC, artwork customers sent that nobody has reviewed yet.
  // Counted through RLS as this staff member.
  // The other tabs show what's new since this person last opened them.
  const visible = (area: string) => OPS_NAV.some((n) => n.area === area && n.roles.includes(profile.role));
  const [inbox, messages, held, artwork, seen] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("read_by_staff", false),
    supabase.from("qc_inspections").select("id", { count: "exact", head: true }).eq("result", "on_hold"),
    supabase.from("artwork_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    staffSeenBadges(supabase, profile, visible),
  ]);

  return (
    <OpsShell
      name={profile.full_name}
      role={profile.role}
      badges={{ inbox: inbox.count ?? 0, messages: messages.count ?? 0, quality: held.count ?? 0, artwork: artwork.count ?? 0, ...seen }}
    >
      {children}
    </OpsShell>
  );
}
