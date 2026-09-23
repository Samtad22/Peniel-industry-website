"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/env";
import { ROLE_LABELS, type Role } from "@/lib/roles";

export type InviteState = { error?: string; ok?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite-only accounts (CLAUDE.md rule 5): an admin creates the login and
 * the profile; the person gets an email and chooses their own password.
 */
export async function inviteUser(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireStaff(["admin"]);

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;
  const companyId = role === "customer_user" ? String(formData.get("company_id") ?? "") : null;

  if (!fullName) return { error: "Enter the person's name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  if (!(role in ROLE_LABELS)) return { error: "Choose a role." };
  if (role === "customer_user" && !companyId) return { error: "Choose which customer company they belong to." };

  // Creating a login needs the service role. Everything after this runs as
  // the admin, through RLS, so the audit log records who invited whom.
  const service = createAdminClient();
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/auth/set-password`,
    data: { full_name: fullName },
  });
  if (error || !data.user) {
    return {
      error: /already|registered|exists/i.test(error?.message ?? "")
        ? "Someone with that email already has an account."
        : `Could not send the invitation: ${error?.message ?? "unknown error"}`,
    };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: data.user.id,
    company_id: companyId,
    full_name: fullName,
    email,
    role,
  });
  if (profileError) {
    await service.auth.admin.deleteUser(data.user.id);
    return { error: `Could not create the profile: ${profileError.message}` };
  }

  revalidatePath("/ops/users");
  return { ok: `Invitation sent to ${email}.` };
}

export async function setUserActive(formData: FormData): Promise<void> {
  const me = await requireStaff(["admin"]);
  const userId = String(formData.get("user_id") ?? "");
  const active = formData.get("active") === "true";
  if (!userId || userId === me.user_id) return; // never lock yourself out

  const supabase = await createClient();
  await supabase.from("profiles").update({ active }).eq("user_id", userId);
  revalidatePath("/ops/users");
}
