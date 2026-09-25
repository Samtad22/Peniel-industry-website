import SettingsView, { type EmailLogRow } from "@/components/ops/SettingsView";
import { emailConfigured } from "@/lib/email";
import type { UserRow } from "@/components/ops/UsersTable";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { opsRolesFor } from "@/lib/roles";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireStaff(opsRolesFor("settings"));
  const supabase = await createClient();

  const [{ data: staff }, { data: presets }, { data: log }] = await Promise.all([
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
      .eq("kind", "hold")
      .order("sort_order")
      .returns<{ id: string; text: string }[]>(),
    supabase
      .from("notification_log")
      .select("id, kind, recipient, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .returns<EmailLogRow[]>(),
  ]);

  return (
    <SettingsView
      staff={staff ?? []}
      presets={presets ?? []}
      meId={me.user_id}
      email={{ configured: emailConfigured(), from: process.env.EMAIL_FROM ?? null, log: log ?? [] }}
    />
  );
}
