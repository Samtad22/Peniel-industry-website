import SettingsView from "@/components/ops/SettingsView";
import type { UserRow } from "@/components/ops/UsersTable";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireStaff(opsRolesFor("settings"));
  const supabase = await createClient();

  const [{ data: staff }, { data: presets }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, role, active, last_login_at")
      .neq("role", "customer_user")
      .order("full_name")
      .returns<UserRow[]>(),
    supabase
      .from("hold_reason_presets")
      .select("id, text")
      .eq("active", true)
      .order("sort_order")
      .returns<{ id: string; text: string }[]>(),
  ]);

  return <SettingsView staff={staff ?? []} presets={presets ?? []} meId={me.user_id} />;
}
