import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, type Role, type StaffRole } from "@/lib/roles";

export type Profile = {
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: Role;
  active: boolean;
};

/**
 * The signed-in user's profile, verified against Supabase Auth.
 * Null when signed out, when no profile exists, or when deactivated.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("user_id, company_id, full_name, email, role, active")
    .eq("user_id", auth.user.id)
    .maybeSingle<Profile>();

  return data?.active ? data : null;
});

/** Where a user lands after signing in. */
export function homeFor(profile: Profile): string {
  return isStaffRole(profile.role) ? "/ops" : "/orders";
}

export async function requireCustomer(): Promise<Profile & { company_id: string }> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (isStaffRole(profile.role) || !profile.company_id) redirect("/ops");
  return profile as Profile & { company_id: string };
}

export async function requireStaff(roles?: StaffRole[]): Promise<Profile & { role: StaffRole }> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!isStaffRole(profile.role)) redirect("/orders");
  if (roles && !roles.includes(profile.role)) redirect("/ops");
  return profile as Profile & { role: StaffRole };
}
