import OpsShell from "@/components/ops/OpsShell";
import { requireStaff } from "@/lib/auth";
import { countedAt, staffBadges } from "@/lib/nav-badges";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: { default: "Peniel Ops", template: "%s | Peniel Ops" } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const supabase = await createClient();
  // Sidebar badges (lib/nav-badges.ts): work waiting, and what's new since this
  // person last opened each tab. The sidebar keeps them fresh as you move around.
  const badges = await staffBadges(supabase, profile);

  return (
    <OpsShell name={profile.full_name} role={profile.role} badges={badges} badgesAsOf={countedAt()}>
      {children}
    </OpsShell>
  );
}
