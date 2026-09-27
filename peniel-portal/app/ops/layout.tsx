import OpsShell from "@/components/ops/OpsShell";
import { PlantSettingsProvider } from "@/components/PlantSettings";
import { getSettings } from "@/lib/settings-server";
import { requireStaff } from "@/lib/auth";
import { countedAt, staffBadges } from "@/lib/nav-badges";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: { default: "Peniel Ops", template: "%s | Peniel Ops" } };

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStaff();
  const supabase = await createClient();
  // Sidebar badges (lib/nav-badges.ts): work waiting, and what's new since this
  // person last opened each tab. The sidebar keeps them fresh as you move around.
  const [badges, settings] = await Promise.all([staffBadges(supabase, profile), getSettings()]);

  return (
    <OpsShell name={profile.full_name} role={profile.role} badges={badges} badgesAsOf={countedAt()}>
      <PlantSettingsProvider value={settings.plant}>{children}</PlantSettingsProvider>
    </OpsShell>
  );
}
