import SettingsView, { type EmailLogRow } from "@/components/ops/SettingsView";
import type { UserRow } from "@/components/ops/UsersTable";
import type { ActivityRow } from "@/lib/activity";
import { requireStaff } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { loadPresets } from "@/lib/presets";
import { opsRolesFor } from "@/lib/roles";
import { getSettings } from "@/lib/settings-server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireStaff(opsRolesFor("settings"));
  const supabase = await createClient();

  const [{ data: staff }, presets, { data: log }, { data: activity }, settings] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, role, active, last_login_at")
      .neq("role", "customer_user")
      .order("full_name")
      .returns<UserRow[]>(),
    loadPresets(supabase),
    supabase
      .from("notification_log")
      .select("id, kind, recipient, subject, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<EmailLogRow[]>(),
    supabase
      .from("audit_log")
      .select("id, actor, action, entity, entity_id, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<ActivityRow[]>(),
    getSettings(),
  ]);

  // Customers can appear in the activity too.
  const actors = [...new Set((activity ?? []).map((a) => a.actor).filter((a): a is string => !!a))];
  const known = new Map((staff ?? []).map((u) => [u.user_id, u.full_name]));
  const missing = actors.filter((a) => !known.has(a));
  if (missing.length) {
    const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", missing).returns<{ user_id: string; full_name: string }[]>();
    for (const p of data ?? []) known.set(p.user_id, p.full_name);
  }

  return (
    <SettingsView
      staff={staff ?? []}
      presets={presets}
      meId={me.user_id}
      settings={settings}
      email={{ configured: emailConfigured(), from: process.env.EMAIL_FROM ?? null, log: log ?? [] }}
      activity={activity ?? []}
      names={Object.fromEntries(known)}
    />
  );
}
