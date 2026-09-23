"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, homeFor } from "@/lib/auth";
import type { AuthState } from "@/app/login/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export async function setPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  const profile = await getProfile();
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?notice=password_set");
  }
  redirect(homeFor(profile));
}
